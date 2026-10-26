import { AppError } from "../errors";
import { findDevice, type DeviceRecord } from "./store";
import { verifyToken } from "./token";

const CACHE_MS = 60_000;
const CACHE_LIMIT = 2_000;

const cache = new Map<string, { record: DeviceRecord; until: number }>();

type HeaderSource = { headers: { get(name: string): string | null } };

export function readToken(request: HeaderSource) {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);

  return match ? match[1] : null;
}

export function forgetDevice(id: string) {
  cache.delete(id);
}

export async function requireDevice(request: HeaderSource): Promise<DeviceRecord> {
  const token = readToken(request);

  if (!token) {
    throw new AppError("Perangkat belum terdaftar.", 401);
  }

  const id = verifyToken(token);

  if (!id) {
    throw new AppError("Sesi perangkat tidak valid. Buka ulang aplikasi.", 401);
  }

  const now = Date.now();
  const hit = cache.get(id);

  let record: DeviceRecord | null;

  if (hit && hit.until > now) {
    record = hit.record;
  } else {
    record = await findDevice(id);

    if (record) {
      if (cache.size >= CACHE_LIMIT) {
        cache.clear();
      }

      cache.set(id, { record, until: now + CACHE_MS });
    }
  }

  if (!record) {
    throw new AppError("Perangkat tidak dikenal. Buka ulang aplikasi.", 401);
  }

  if (record.blocked) {
    throw new AppError(
      record.blockedReason
        ? `Akses perangkat ini diblokir: ${record.blockedReason}`
        : "Akses perangkat ini diblokir.",
      403
    );
  }

  return record;
}
