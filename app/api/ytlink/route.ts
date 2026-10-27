import { NextRequest, NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { decodePayload, verifyPayload } from "@/lib/sign";
import { isAllowedFormat, requestDownload } from "@/lib/providers/youtube/download";
import { YT_LINK_ROUTE } from "@/lib/providers/youtube";
import { isVideoId } from "@/lib/providers/youtube/target";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function fail(error: string, status: number) {
  return NextResponse.json(
    { ok: false, error },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const params = request.nextUrl.searchParams;
  const encoded = params.get("d")?.trim() ?? "";
  const signature = params.get("s")?.trim() ?? "";
  const expires = Number(params.get("e"));

  if (!encoded || encoded.length > 512) {
    return fail("Permintaan unduhan tidak valid.", 400);
  }

  const state = verifyPayload(YT_LINK_ROUTE, encoded, expires, signature);

  if (state === "invalid") {
    return fail("Permintaan unduhan tidak valid. Muat ulang lalu coba lagi.", 403);
  }

  if (state === "expired") {
    return fail("Tautan sudah kedaluwarsa.", 410);
  }

  const data = decodePayload<{ id?: unknown; f?: unknown }>(encoded);

  if (!data || !isVideoId(data.id) || !isAllowedFormat(data.f) || data.f === "mp3") {
    return fail("Permintaan unduhan tidak valid.", 400);
  }

  try {
    const link = await requestDownload(data.id, data.f);

    console.info(`[ytlink] ${data.f} ${Date.now() - startedAt}ms`);

    return NextResponse.json(
      { ok: true, url: link.url },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof AppError) {
      return fail(error.message, error.status);
    }

    return fail("Gagal membuat link unduhan.", 502);
  }
}
