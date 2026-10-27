import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { name: "orbit-api", ok: true },
    { headers: { "Cache-Control": "no-store" } }
  );
}
