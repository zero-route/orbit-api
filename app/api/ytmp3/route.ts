import { NextRequest, NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { tagMp3 } from "@/lib/mp3/id3";
import { isPublicHost } from "@/lib/media/safeHost";
import { decodePayload, verifyPayload } from "@/lib/sign";
import { requestDownload } from "@/lib/providers/youtube/download";
import { YT_MP3_ROUTE } from "@/lib/providers/youtube";
import { isVideoId } from "@/lib/providers/youtube/target";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_AUDIO_BYTES = 80 * 1024 * 1024;
const MAX_COVER_BYTES = 6 * 1024 * 1024;
const CHUNK_SIZE = 256 * 1024;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

function text(value: unknown, max: number) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

function fail(error: string, status: number, fallbackUrl?: string) {
  return NextResponse.json(
    { ok: false, error, url: fallbackUrl ?? null },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

function sniffImage(data: Buffer) {
  if (data.length > 4 && data[0] === 0xff && data[1] === 0xd8) {
    return "image/jpeg";
  }

  if (data.length > 8 && data[0] === 0x89 && data.toString("ascii", 1, 4) === "PNG") {
    return "image/png";
  }

  return null;
}

function isYtImage(value: string) {
  try {
    const url = new URL(value);

    return url.protocol === "https:" && url.hostname.endsWith(".ytimg.com");
  } catch {
    return false;
  }
}

async function fetchCover(candidates: string[]) {
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, {
        cache: "no-store",
        redirect: "follow",
        headers: { "User-Agent": USER_AGENT, Accept: "image/jpeg,image/*;q=0.8" },
        signal: AbortSignal.timeout(8_000),
      });

      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        continue;
      }

      const data = Buffer.from(await response.arrayBuffer());
      const mime = sniffImage(data);

      if (mime && data.length > 2048 && data.length <= MAX_COVER_BYTES) {
        return { data, mime };
      }
    } catch {
      continue;
    }
  }

  return null;
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const params = request.nextUrl.searchParams;
  const encoded = params.get("d")?.trim() ?? "";
  const signature = params.get("s")?.trim() ?? "";
  const expires = Number(params.get("e"));

  if (!encoded || encoded.length > 2048) {
    return fail("Permintaan unduhan tidak valid.", 400);
  }

  const state = verifyPayload(YT_MP3_ROUTE, encoded, expires, signature);

  if (state === "invalid") {
    return fail("Permintaan unduhan tidak valid. Muat ulang lalu coba lagi.", 403);
  }

  if (state === "expired") {
    return fail("Tautan sudah kedaluwarsa.", 410);
  }

  const data = decodePayload<Record<string, unknown>>(encoded);

  if (!data || !isVideoId(data.id)) {
    return fail("Permintaan unduhan tidak valid.", 400);
  }

  const id = data.id;

  let link;

  try {
    link = await requestDownload(id, "mp3", 34_000);
  } catch (error) {
    if (error instanceof AppError) {
      return fail(error.message, error.status);
    }

    return fail("Gagal membuat link unduhan MP3.", 502);
  }

  try {
    const left = 56_000 - (Date.now() - startedAt);
    const audioUrl = new URL(link.url);

    if (audioUrl.protocol !== "https:" || !isPublicHost(audioUrl.hostname)) {
      return fail("Link unduhan MP3 tidak valid.", 502);
    }

    const [audioResponse, cover] = await Promise.all([
      fetch(audioUrl, {
        cache: "no-store",
        redirect: "follow",
        headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
        signal: AbortSignal.timeout(Math.max(left - 2_000, 5_000)),
      }),
      fetchCover(
        [
          link.cover && isYtImage(link.cover) ? link.cover : null,
          `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
          `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        ].filter((value): value is string => value !== null)
      ),
    ]);

    if (!audioResponse.ok) {
      await audioResponse.body?.cancel().catch(() => undefined);

      return fail(
        `Server file audio membalas HTTP ${audioResponse.status}.`,
        502,
        link.url
      );
    }

    const declared = Number(audioResponse.headers.get("content-length") || 0);

    if (declared > MAX_AUDIO_BYTES) {
      await audioResponse.body?.cancel().catch(() => undefined);

      return fail("File audio terlalu besar untuk diberi cover.", 413, link.url);
    }

    const audio = Buffer.from(await audioResponse.arrayBuffer());

    if (audio.length < 4096 || audio.length > MAX_AUDIO_BYTES) {
      return fail("File audio dari server tidak valid.", 502, link.url);
    }

    const tagged = tagMp3(audio, {
      title:
        text(data.t, 300) ??
        (link.filename ? link.filename.replace(/\.mp3$/i, "") : "YouTube Audio"),
      artist: text(data.r, 300),
      year: text(data.y, 4),
      cover,
    });

    console.info(`[ytmp3] ${Date.now() - startedAt}ms cover=${Boolean(cover)}`);

    const bytes = new Uint8Array(tagged);
    let offset = 0;

    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= bytes.length) {
          controller.close();
          return;
        }

        controller.enqueue(bytes.subarray(offset, offset + CHUNK_SIZE));
        offset += CHUNK_SIZE;
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(bytes.length),
        "Cache-Control": "no-store",
        "X-Cover-Embedded": cover ? "1" : "0",
      },
    });
  } catch (error) {
    console.error("[ytmp3]", error);

    return fail(
      error instanceof Error ? error.message : "Gagal menyiapkan MP3.",
      502,
      link.url
    );
  }
}
