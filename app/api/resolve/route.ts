import { NextRequest, NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { detectInput } from "@/lib/detect/detect";
import { guardDevice } from "@/lib/device/access";
import { logRequest } from "@/lib/device/log";
import { getProvider } from "@/lib/providers/registry";
import type { ResolveResponse } from "@/lib/providers/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function respond(body: ResolveResponse, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("url")?.trim();

  if (!raw) {
    return respond({ ok: false, error: "Tempel link terlebih dahulu." }, 400);
  }

  const detected = detectInput(raw);

  if (!detected) {
    return respond(
      { ok: false, error: "Link ini belum didukung atau tidak valid." },
      400
    );
  }

  try {
    const device = await guardDevice(request);

    if (device) {
      logRequest(device.id, raw, detected.platform);
    }

    const data = await getProvider(detected.platform)(detected);

    return respond({ ok: true, data });
  } catch (error) {
    if (error instanceof AppError) {
      return respond(
        { ok: false, error: error.message, detail: error.detail },
        error.status
      );
    }

    return respond(
      {
        ok: false,
        error: "Gagal memproses link.",
        detail: error instanceof Error ? error.message : undefined,
      },
      500
    );
  }
}
