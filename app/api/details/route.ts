import { NextRequest, NextResponse } from "next/server";
import { detectInput } from "@/lib/detect/detect";
import { AppError } from "@/lib/errors";
import { guardDevice } from "@/lib/device/access";
import { getDetailsProvider } from "@/lib/providers/registry";
import type { DetailsResponse } from "@/lib/providers/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function respond(body: DetailsResponse, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("url")?.trim();
  const detected = raw ? detectInput(raw) : null;

  if (!detected) {
    return respond({ ok: false, error: "Link tidak valid." }, 400);
  }

  const provider = getDetailsProvider(detected.platform);

  if (!provider) {
    return respond({ ok: false, error: "Detail tidak tersedia." }, 404);
  }

  try {
    await guardDevice(request);

    const data = await provider(detected);

    if (!data) {
      return respond({ ok: false, error: "Detail tidak tersedia." }, 404);
    }

    return respond({ ok: true, data });
  } catch (error) {
    if (error instanceof AppError && [401, 403, 429].includes(error.status)) {
      return respond({ ok: false, error: error.message }, error.status);
    }

    return respond({ ok: false, error: "Detail tidak tersedia." }, 502);
  }
}
