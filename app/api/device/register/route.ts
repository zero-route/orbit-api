import { NextRequest, NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { registerDevice } from "@/lib/device/store";
import { forgetDevice } from "@/lib/device/guard";
import { isDeviceId, issueToken } from "@/lib/device/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function reply(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function clean(value: unknown, max: number) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : undefined;
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;

  try {
    const parsed: unknown = await request.json();

    body =
      typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>)
        : {};
  } catch {
    return reply({ ok: false, error: "Permintaan tidak valid." }, 400);
  }

  if (!isDeviceId(body.deviceId)) {
    return reply({ ok: false, error: "ID perangkat tidak valid." }, 400);
  }

  try {
    const device = await registerDevice(body.deviceId, {
      platform: clean(body.platform, 20),
      appVersion: clean(body.appVersion, 20),
    });

    forgetDevice(device.id);

    if (device.blocked) {
      return reply(
        {
          ok: false,
          error: device.blockedReason
            ? `Akses perangkat ini diblokir: ${device.blockedReason}`
            : "Akses perangkat ini diblokir.",
        },
        403
      );
    }

    return reply({ ok: true, token: issueToken(device.id), plan: device.plan });
  } catch (error) {
    if (error instanceof AppError) {
      return reply({ ok: false, error: error.message }, error.status);
    }

    return reply({ ok: false, error: "Gagal mendaftarkan perangkat." }, 500);
  }
}
