import { NextRequest, NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { verifyUrl } from "@/lib/sign";
import { fetchTikTokPost } from "@/lib/providers/tiktok";
import { SlideshowSourceError, renderSlideshow } from "@/lib/slideshow/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUDGET_MS = 56_000;
const CHUNK_SIZE = 256 * 1024;

function fail(error: string, status: number) {
  return NextResponse.json(
    { ok: false, error },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const params = request.nextUrl.searchParams;
  const target = params.get("u")?.trim() ?? "";
  const signature = params.get("s")?.trim() ?? "";
  const expires = Number(params.get("e"));

  if (!target || target.length > 2048) {
    return fail("Data slideshow tidak valid.", 400);
  }

  const state = verifyUrl(`slideshow:${target}`, expires, signature);

  if (state === "invalid") {
    return fail("Data slideshow tidak valid. Muat ulang lalu coba lagi.", 403);
  }

  if (state === "expired") {
    return fail("Tautan sudah kedaluwarsa.", 410);
  }

  try {
    const post = await fetchTikTokPost(target);

    if (post.photos.length === 0 || !post.audioUrl) {
      return fail("Postingan ini tidak punya foto dan audio untuk slideshow.", 422);
    }

    const result = await renderSlideshow({
      images: post.photos,
      audioUrl: post.audioUrl,
      deadlineAt: startedAt + BUDGET_MS,
    });

    console.info(
      `[slideshow] ${Date.now() - startedAt}ms images=${result.imageCount} duration=${Math.round(result.duration)}s`
    );

    const bytes = new Uint8Array(result.buffer);
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
        "Content-Type": "video/mp4",
        "Content-Length": String(bytes.length),
        "Cache-Control": "no-store",
        "X-Slideshow-Duration": String(result.duration),
        "X-Slideshow-Images": String(result.imageCount),
      },
    });
  } catch (error) {
    if (error instanceof SlideshowSourceError) {
      return fail("Sumber media sudah kedaluwarsa.", 410);
    }

    if (error instanceof AppError) {
      return fail(error.message, error.status);
    }

    console.error("[slideshow]", error);

    return fail(
      error instanceof Error ? error.message : "Gagal membuat slideshow.",
      500
    );
  }
}
