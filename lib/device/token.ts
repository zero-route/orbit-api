import { createHmac, timingSafeEqual } from "crypto";
import { AppError } from "../errors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const TOKEN_TTL_SECONDS = 180 * 24 * 60 * 60;

export function isDeviceId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function secret() {
  const value =
    process.env.DEVICE_TOKEN_SECRET?.trim() || process.env.SIGNING_SECRET?.trim();

  if (!value) {
    throw new AppError("DEVICE_TOKEN_SECRET belum dikonfigurasi di environment.", 500);
  }

  return value;
}

function sign(deviceId: string, issuedAt: number) {
  return createHmac("sha256", secret())
    .update(`device\n${deviceId}\n${issuedAt}`)
    .digest("base64url");
}

export function issueToken(deviceId: string) {
  const issuedAt = Math.floor(Date.now() / 1000);

  return `${deviceId}.${issuedAt}.${sign(deviceId, issuedAt)}`;
}

export function verifyToken(token: string): string | null {
  const parts = token.split(".");

  if (parts.length !== 3) {
    return null;
  }

  const [deviceId, issued, signature] = parts;
  const issuedAt = Number(issued);

  if (!isDeviceId(deviceId) || !Number.isFinite(issuedAt) || !signature) {
    return null;
  }

  if (Math.floor(Date.now() / 1000) - issuedAt > TOKEN_TTL_SECONDS) {
    return null;
  }

  try {
    const expected = Buffer.from(sign(deviceId, issuedAt));
    const received = Buffer.from(signature);

    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      return null;
    }
  } catch {
    return null;
  }

  return deviceId;
}
