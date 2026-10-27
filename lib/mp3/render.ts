import ffmpegPath from "ffmpeg-static";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isPublicHost } from "../media/safeHost";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

const MAX_AUDIO_BYTES = 60 * 1024 * 1024;
const MAX_COVER_BYTES = 8 * 1024 * 1024;
const GONE_STATUSES = new Set([403, 404, 410]);

export type Mp3Input = {
  audioUrl: string;
  coverUrl: string | null;
  title: string;
  artist: string | null;
  album: string | null;
  year: string | null;
};

export type Mp3Result = {
  buffer: Buffer;
  coverEmbedded: boolean;
};

export class SourceGoneError extends Error {
  constructor() {
    super("Sumber audio sudah kedaluwarsa.");
    this.name = "SourceGoneError";
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertPublic(value: string) {
  const url = new URL(value);

  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    !isPublicHost(url.hostname)
  ) {
    throw new Error("URL aset tidak valid.");
  }

  return url;
}

async function download(rawUrl: string, maxBytes: number, accept: string) {
  const url = assertPublic(rawUrl);
  let lastError = "Gagal mengambil aset.";
  let gone = false;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        cache: "no-store",
        headers: { Accept: accept, "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(25_000),
      });

      if (GONE_STATUSES.has(response.status)) {
        await response.body?.cancel().catch(() => undefined);
        gone = true;
        break;
      }

      if (!response.ok || !response.body) {
        lastError = `Server media HTTP ${response.status}`;
      } else {
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

        if (total > 0) {
          return Buffer.concat(chunks);
        }

        lastError = "Aset kosong.";
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;

      if (lastError === "Ukuran aset melebihi batas.") {
        throw new Error(lastError);
      }
    }

    await sleep(500 * attempt);
  }

  if (gone) {
    throw new SourceGoneError();
  }

  throw new Error(lastError);
}

function run(command: string, args: string[], timeoutMs: number) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });

    let stderr = "";

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-8000);
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Proses konversi melewati batas waktu."));
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);

      if (code !== 0) {
        reject(new Error(`Konversi gagal: ${stderr.slice(-1500)}`));
        return;
      }

      resolve();
    });
  });
}

function encodeArgs(
  audioPath: string,
  coverPath: string | null,
  outPath: string,
  input: Mp3Input
) {
  const args = ["-hide_banner", "-nostats", "-y", "-i", audioPath];

  if (coverPath) {
    args.push("-i", coverPath);
  }

  args.push("-map", "0:a:0");

  if (coverPath) {
    args.push(
      "-map",
      "1:v:0",
      "-c:v",
      "mjpeg",
      "-q:v",
      "2",
      "-vf",
      "scale=640:640:force_original_aspect_ratio=increase,crop=640:640",
      "-disposition:v:0",
      "attached_pic",
      "-metadata:s:v",
      "title=Album cover",
      "-metadata:s:v",
      "comment=Cover (front)"
    );
  }

  args.push(
    "-c:a",
    "libmp3lame",
    "-b:a",
    "320k",
    "-ar",
    "44100",
    "-id3v2_version",
    "3",
    "-write_id3v1",
    "1",
    "-metadata",
    `title=${input.title}`
  );

  if (input.artist) {
    args.push("-metadata", `artist=${input.artist}`);
  }

  if (input.album) {
    args.push("-metadata", `album=${input.album}`);
  }

  if (input.year) {
    args.push("-metadata", `date=${input.year}`);
  }

  args.push("-f", "mp3", outPath);

  return args;
}

export async function renderMp3(input: Mp3Input): Promise<Mp3Result> {
  const binary = process.env.FFMPEG_PATH?.trim() || ffmpegPath;

  if (!binary) {
    throw new Error("ffmpeg tidak tersedia di server.");
  }

  const dir = await mkdtemp(path.join(os.tmpdir(), "orbit-mp3-"));

  try {
    const audioPath = path.join(dir, "audio.bin");
    const coverPath = path.join(dir, "cover.bin");
    const outPath = path.join(dir, "out.mp3");

    const [audio, cover] = await Promise.all([
      download(input.audioUrl, MAX_AUDIO_BYTES, "*/*"),
      input.coverUrl
        ? download(
            input.coverUrl,
            MAX_COVER_BYTES,
            "image/jpeg,image/png,image/webp,image/*;q=0.8,*/*;q=0.5"
          ).catch(() => null)
        : Promise.resolve(null),
    ]);

    await writeFile(audioPath, audio);

    let coverEmbedded = false;

    if (cover) {
      await writeFile(coverPath, cover);

      try {
        await run(binary, encodeArgs(audioPath, coverPath, outPath, input), 50_000);
        coverEmbedded = true;
      } catch (error) {
        console.error("[mp3] dengan cover gagal, coba tanpa cover", error);
      }
    }

    if (!coverEmbedded) {
      await run(binary, encodeArgs(audioPath, null, outPath, input), 50_000);
    }

    const info = await stat(outPath);

    if (info.size < 1024) {
      throw new Error("Hasil konversi kosong.");
    }

    return { buffer: await readFile(outPath), coverEmbedded };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
