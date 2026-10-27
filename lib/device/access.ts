import { AppError } from "../errors";
import { requireDevice, readToken } from "./guard";
import type { DeviceRecord } from "./store";

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const TRACK_LIMIT = 5_000;

const hits = new Map<string, number[]>();

type HeaderSource = { headers: { get(name: string): string | null } };

function mode() {
  const value = process.env.ORBIT_GUARD?.trim().toLowerCase();

  return value === "strict" || value === "off" ? value : "soft";
}

export function limitDevice(id: string, now = Date.now()) {
  const recent = (hits.get(id) ?? []).filter((time) => now - time < WINDOW_MS);

  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(id, recent);
    throw new AppError("Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.", 429);
  }

  recent.push(now);

  if (hits.size >= TRACK_LIMIT) {
    hits.clear();
  }

  hits.set(id, recent);
}

export async function guardDevice(
  request: HeaderSource
): Promise<DeviceRecord | null> {
  const current = mode();

  if (current === "off") {
    return null;
  }

  if (!readToken(request)) {
    if (current === "strict") {
      throw new AppError("Perangkat belum terdaftar.", 401);
    }

    return null;
  }

  const device = await requireDevice(request);

  limitDevice(device.id);

  return device;
}
