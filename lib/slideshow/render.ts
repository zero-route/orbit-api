import ffmpegPath from "ffmpeg-static";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { IMAGE_ACCEPT, imageVariants } from "../media/imageVariants";
import { isPublicHost } from "../media/safeHost";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

const MAX_IMAGES = 30;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_AUDIO_BYTES = 30 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 100 * 1024 * 1024;
const MAX_DURATION_SECONDS = 180;
const FPS = 10;
const CONCURRENCY = 4;

export type SlideshowInput = {
  images: string[];
  audioUrl: string;
  deadlineAt: number;
};

export type SlideshowResult = {
  buffer: Buffer;
  duration: number;
  imageCount: number;
};

export class SlideshowSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlideshowSourceError";
  }
}

function publicUrl(value: string) {
  const url = new URL(value);

  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    !isPublicHost(url.hostname)
  ) {
    throw new Error("URL aset tidak valid.");
  }

  return url;
}

async function downloadAsset(rawUrl: string, maxBytes: number, accept: string) {
  let url = publicUrl(rawUrl);
  let response: Response | undefined;

  for (let hop = 0; hop <= 4; hop += 1) {
    response = await fetch(url, {
      redirect: "manual",
      cache: "no-store",
      headers: {
        Accept: accept,
        "User-Agent": USER_AGENT,
        Referer: "https://www.tiktok.com/",
      },
      signal: AbortSignal.timeout(25_000),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");

      if (!location || hop === 4) {
        throw new Error("Redirect aset tidak valid.");
      }

      url = publicUrl(new URL(location, url).toString());
      continue;
    }

    break;
  }

  if (!response) {
    throw new Error("Gagal mengambil aset.");
  }

  if ([403, 404, 410].includes(response.status)) {
    await response.body?.cancel().catch(() => undefined);
    throw new SlideshowSourceError("Sumber media sudah kedaluwarsa.");
  }

  if (!response.ok || !response.body) {
    throw new Error("Gagal mengambil aset TikTok.");
  }

  const declared = Number(response.headers.get("content-length") || 0);

  if (declared > maxBytes) {
    throw new Error("Ukuran aset melebihi batas.");
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      total += value.byteLength;

      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("Ukuran aset melebihi batas.");
      }

      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  if (total === 0) {
    throw new Error("Aset kosong.");
  }

  return Buffer.concat(chunks);
}

function run(command: string, args: string[], timeoutMs: number) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => {
      stdout = (stdout + chunk).slice(-12_000);
    });

    child.stderr.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-12_000);
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Proses media melewati batas waktu."));
    }, Math.max(3_000, timeoutMs));

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);

      if (code !== 0) {
        reject(new Error(`Proses media gagal: ${stderr.slice(-1500)}`));
        return;
      }

      resolve(`${stdout}\n${stderr}`.trim());
    });
  });
}

async function audioDuration(binary: string, audioPath: string, timeoutMs: number) {
  const output = await run(
    binary,
    ["-hide_banner", "-nostats", "-i", audioPath, "-t", "0", "-f", "null", "-"],
    timeoutMs
  );

  const match = output.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);

  if (!match) {
    throw new Error("Durasi audio tidak dapat dibaca.");
  }

  const seconds =
    Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);

  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error("Durasi audio tidak dapat dibaca.");
  }

  return seconds;
}

async function prepareImage(
  binary: string,
  source: string,
  workDir: string,
  index: number,
  deadlineAt: number
) {
  const tag = String(index).padStart(3, "0");
  const rawPath = path.join(workDir, `raw-${tag}.bin`);
  const imagePath = path.join(workDir, `image-${tag}.jpg`);
  let gone: SlideshowSourceError | null = null;

  for (const candidate of imageVariants(source)) {
    try {
      const bytes = await downloadAsset(candidate, MAX_IMAGE_BYTES, IMAGE_ACCEPT);

      await writeFile(rawPath, bytes);

      await run(
        binary,
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-i",
          rawPath,
          "-frames:v",
          "1",
          "-pix_fmt",
          "yuvj420p",
          "-q:v",
          "2",
          imagePath,
        ],
        Math.min(30_000, deadlineAt - Date.now())
      );

      return imagePath;
    } catch (error) {
      if (error instanceof SlideshowSourceError) {
        gone = error;
      }
    }
  }

  if (gone) {
    throw gone;
  }

  throw new Error(`Gambar slide ${index + 1} tidak dapat diproses.`);
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>
) {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;

      cursor += 1;
      results[index] = await task(items[index], index);
    }
  });

  await Promise.all(workers);

  return results;
}

export async function renderSlideshow(
  input: SlideshowInput
): Promise<SlideshowResult> {
  const binary = process.env.FFMPEG_PATH?.trim() || ffmpegPath;

  if (!binary) {
    throw new Error("ffmpeg tidak tersedia di server.");
  }

  if (input.images.length < 1 || input.images.length > MAX_IMAGES) {
    throw new Error(`Jumlah gambar harus antara 1–${MAX_IMAGES}.`);
  }

  publicUrl(input.audioUrl);
  input.images.forEach(publicUrl);

  const workDir = await mkdtemp(path.join(os.tmpdir(), "orbit-slideshow-"));

  try {
    const [imagePaths, audioBytes] = await Promise.all([
      mapLimit(input.images, CONCURRENCY, (source, index) =>
        prepareImage(binary, source, workDir, index, input.deadlineAt)
      ),
      downloadAsset(input.audioUrl, MAX_AUDIO_BYTES, "*/*"),
    ]);

    const audioPath = path.join(workDir, "audio.bin");
    const outputPath = path.join(workDir, "slideshow.mp4");

    await writeFile(audioPath, audioBytes);

    const seconds = await audioDuration(
      binary,
      audioPath,
      Math.min(30_000, input.deadlineAt - Date.now())
    );
    const duration = Math.min(seconds, MAX_DURATION_SECONDS);
    const each = duration / imagePaths.length;

    const inputArgs = imagePaths.flatMap((imagePath) => [
      "-loop",
      "1",
      "-framerate",
      String(FPS),
      "-t",
      each.toFixed(6),
      "-i",
      imagePath,
    ]);

    const chains = imagePaths.map(
      (_, index) =>
        `[${index}:v]scale=1080:1920:force_original_aspect_ratio=decrease,` +
        `pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${FPS},format=yuv420p[v${index}]`
    );

    const joined = imagePaths.map((_, index) => `[v${index}]`).join("");
    const graph = `${chains.join(";")};${joined}concat=n=${imagePaths.length}:v=1:a=0[video]`;

    await run(
      binary,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        ...inputArgs,
        "-i",
        audioPath,
        "-filter_complex",
        graph,
        "-map",
        "[video]",
        "-map",
        `${imagePaths.length}:a:0`,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "28",
        "-g",
        String(FPS * 60),
        "-c:a",
        "aac",
        "-b:a",
        "96k",
        "-t",
        duration.toFixed(6),
        "-shortest",
        "-movflags",
        "+faststart",
        outputPath,
      ],
      input.deadlineAt - Date.now() - 1_500
    );

    const info = await stat(outputPath);

    if (info.size > MAX_OUTPUT_BYTES) {
      throw new Error("Hasil video melebihi batas ukuran.");
    }

    return {
      buffer: await readFile(outputPath),
      duration,
      imageCount: imagePaths.length,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
