import { NextRequest, NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import {
  IMAGE_ACCEPT,
  imageVariants,
  isImagePath,
} from "@/lib/media/imageVariants";
import { isPublicHost } from "@/lib/media/safeHost";
import { verifyUrl } from "@/lib/sign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 450;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

const EXTENSIONS: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/heic": "heic",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
};

const INFERRED: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  mp3: "audio/mpeg",
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function failure(error: string, status: number, detail?: string) {
  return NextResponse.json(
    { ok: false, error, detail },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

function safeFilename(value: string | null, fallbackExtension: string) {
  const cleaned = (value ?? "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_.]+|[_.]+$/g, "")
    .slice(0, 90);

  const base = cleaned || "orbit_media";

  return /\.[a-z0-9]{2,5}$/i.test(base) ? base : `${base}.${fallbackExtension}`;
}

function referrerFor(hostname: string) {
  if (/twimg\.com$/i.test(hostname)) {
    return "https://x.com/";
  }

  if (/pinimg\.com$/i.test(hostname)) {
    return "https://www.pinterest.com/";
  }

  return /(cdninstagram\.com|fbcdn\.net|instagram\.com)$/i.test(hostname)
    ? "https://www.instagram.com/"
    : "https://www.tiktok.com/";
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const target = params.get("u")?.trim() ?? "";
  const signature = params.get("s")?.trim() ?? "";
  const expires = Number(params.get("e"));
  const asDownload = params.get("d") === "1";
  const checkOnly = params.get("c") === "1";
  const range = request.headers.get("range");

  let state: ReturnType<typeof verifyUrl>;

  try {
    state = verifyUrl(target, expires, signature);
  } catch (error) {
    if (error instanceof AppError) {
      return failure(error.message, error.status);
    }

    return failure("Tautan media tidak valid.", 403);
  }

  if (state === "invalid") {
    return failure("Tautan media tidak valid.", 403);
  }

  if (state === "expired") {
    return failure("Tautan media sudah kedaluwarsa.", 410);
  }

  let parsed: URL;

  try {
    parsed = new URL(target);
  } catch {
    return failure("Tautan media tidak valid.", 400);
  }

  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    !isPublicHost(parsed.hostname)
  ) {
    return failure("Tautan media tidak valid.", 400);
  }

  const headers: Record<string, string> = {
    Accept: isImagePath(parsed.pathname) ? IMAGE_ACCEPT : "*/*",
    "User-Agent": USER_AGENT,
    Referer: referrerFor(parsed.hostname),
  };

  if (range && !checkOnly) {
    headers.Range = range;
  }

  try {
    const candidates = imageVariants(target);
    let chosen = parsed;
    let response: Response | undefined;

    for (let index = 0; index < candidates.length; index += 1) {
      const isLast = index === candidates.length - 1;

      try {
        const attempt = await fetch(candidates[index], {
          method: "GET",
          redirect: "follow",
          cache: "no-store",
          headers,
        });

        const attemptType = (attempt.headers.get("content-type") || "").toLowerCase();

        if (
          attempt.ok &&
          attempt.body &&
          (isLast || /^image\/(jpe?g|webp|png)/.test(attemptType))
        ) {
          response = attempt;
          chosen = new URL(candidates[index]);
          break;
        }

        if (isLast) {
          response = attempt;
        } else {
          await attempt.body?.cancel().catch(() => undefined);
        }
      } catch (error) {
        if (isLast) {
          throw error;
        }
      }
    }

    if (!response) {
      return failure("Gagal mengambil file media.", 502);
    }

    for (
      let attempt = 1;
      attempt < MAX_ATTEMPTS &&
      !response.ok &&
      (response.status === 429 ||
        response.status === 403 ||
        response.status === 404 ||
        response.status >= 500);
      attempt += 1
    ) {
      await response.body?.cancel().catch(() => undefined);
      await sleep(RETRY_DELAY_MS * attempt);

      response = await fetch(chosen.toString(), {
        method: "GET",
        redirect: "follow",
        cache: "no-store",
        headers,
      });
    }

    if (!response.ok || !response.body) {
      const upstream = response.status;

      await response.body?.cancel().catch(() => undefined);

      if (upstream === 403 || upstream === 404 || upstream === 410) {
        return failure("Tautan media sudah kedaluwarsa.", 410);
      }

      return failure(`Server media HTTP ${upstream}`, 502);
    }

    const upstreamType = (response.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();

    if (upstreamType.includes("json") || upstreamType.startsWith("text/")) {
      await response.body.cancel().catch(() => undefined);

      return failure("Server media tidak mengembalikan file.", 502);
    }

    if (checkOnly) {
      await response.body.cancel().catch(() => undefined);

      return NextResponse.json(
        { ok: true },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }

    const pathExtension = chosen.pathname.split(".").pop()?.toLowerCase() || "";

    const contentType =
      upstreamType && upstreamType !== "application/octet-stream"
        ? upstreamType
        : INFERRED[pathExtension] || "application/octet-stream";

    const out = new Headers();

    out.set("Content-Type", contentType);

    for (const header of ["content-length", "content-range"]) {
      const value = response.headers.get(header);

      if (value) {
        out.set(header, value);
      }
    }

    out.set("Accept-Ranges", response.headers.get("accept-ranges") || "bytes");

    if (asDownload) {
      const extension =
        EXTENSIONS[contentType] ||
        (/^[a-z0-9]{2,5}$/.test(pathExtension) ? pathExtension : "bin");

      const filename = safeFilename(params.get("n"), extension);

      out.set("Content-Disposition", `attachment; filename="${filename}"`);
      out.set("Cache-Control", "no-store");
    } else {
      out.set("Content-Disposition", "inline");
      out.set("Cache-Control", "private, max-age=1200");
    }

    return new NextResponse(response.body, {
      status: response.status === 206 ? 206 : 200,
      headers: out,
    });
  } catch (error) {
    return failure(
      "Gagal mengambil file media.",
      502,
      error instanceof Error ? error.message : undefined
    );
  }
}
