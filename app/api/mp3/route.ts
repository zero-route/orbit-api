import { NextRequest, NextResponse } from "next/server";
import { verifyUrl } from "@/lib/sign";
import { SourceGoneError, renderMp3 } from "@/lib/mp3/render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_PAYLOAD = 8192;
const CHUNK_SIZE = 256 * 1024;

function text(value: unknown, max: number) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

function fail(error: string, status: number) {
  return NextResponse.json(
    { ok: false, error },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const payload = params.get("d")?.trim() ?? "";
  const signature = params.get("s")?.trim() ?? "";
  const expires = Number(params.get("e"));

  if (!payload || payload.length > MAX_PAYLOAD) {
    return fail("Data konversi tidak valid.", 400);
  }

  const state = verifyUrl(payload, expires, signature);

  if (state === "invalid") {
    return fail("Data konversi tidak valid. Muat ulang lagu lalu coba lagi.", 403);
  }

  if (state === "expired") {
    return fail("Tautan sudah kedaluwarsa.", 410);
  }

  let data: Record<string, unknown>;

  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return fail("Data konversi tidak valid.", 400);
  }

  const audioUrl = text(data.a, 4096);

  if (!audioUrl) {
    return fail("Data konversi tidak valid.", 400);
  }

  try {
    const result = await renderMp3({
      audioUrl,
      coverUrl: text(data.c, 4096),
      title: text(data.t, 300) ?? "Lagu",
      artist: text(data.r, 300),
      album: text(data.l, 300),
      year: text(data.y, 10),
    });

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
        "Content-Type": "audio/mpeg",
        "Content-Length": String(bytes.length),
        "Cache-Control": "no-store",
        "X-Cover-Embedded": result.coverEmbedded ? "1" : "0",
      },
    });
  } catch (error) {
    if (error instanceof SourceGoneError) {
      return fail("Sumber audio sudah kedaluwarsa.", 410);
    }

    console.error("[mp3]", error);

    return fail(
      error instanceof Error ? error.message : "Gagal membuat file MP3.",
      500
    );
  }
}
