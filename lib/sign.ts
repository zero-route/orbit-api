import { createHmac, timingSafeEqual } from "crypto";
import { AppError } from "./errors";

export const LINK_TTL_SECONDS = 25 * 60;

function secret() {
  const value = process.env.SIGNING_SECRET?.trim();

  if (!value) {
    throw new AppError("SIGNING_SECRET belum dikonfigurasi di environment.", 500);
  }

  return value;
}

export function expiryFromNow(ttlSeconds = LINK_TTL_SECONDS) {
  return Math.floor(Date.now() / 1000) + ttlSeconds;
}

function digest(url: string, expires: number) {
  return createHmac("sha256", secret())
    .update(`${expires}\n${url}`)
    .digest("base64url");
}

export type VerifyState = "ok" | "invalid" | "expired";

export function verifyUrl(
  url: string,
  expires: number,
  signature: string
): VerifyState {
  if (!url || !Number.isFinite(expires) || !signature) {
    return "invalid";
  }

  try {
    const expected = Buffer.from(digest(url, expires));
    const received = Buffer.from(signature);

    if (expected.length !== received.length) {
      return "invalid";
    }

    if (!timingSafeEqual(expected, received)) {
      return "invalid";
    }
  } catch {
    return "invalid";
  }

  return expires * 1000 < Date.now() ? "expired" : "ok";
}

export function mp3Path(payload: string, expires: number) {
  const encoded = Buffer.from(payload, "utf8").toString("base64url");
  const params = new URLSearchParams();

  params.set("d", encoded);
  params.set("e", String(expires));
  params.set("s", digest(encoded, expires));

  return `/api/mp3?${params.toString()}`;
}

export function slideshowPath(postUrl: string, expires: number) {
  const params = new URLSearchParams();

  params.set("u", postUrl);
  params.set("e", String(expires));
  params.set("s", digest(`slideshow:${postUrl}`, expires));

  return `/api/slideshow?${params.toString()}`;
}

export function payloadPath(route: string, payload: string, expires: number) {
  const encoded = Buffer.from(payload, "utf8").toString("base64url");
  const params = new URLSearchParams();

  params.set("d", encoded);
  params.set("e", String(expires));
  params.set("s", digest(`${route}|${encoded}`, expires));

  return `${route}?${params.toString()}`;
}

export function decodePayload<T>(encoded: string): T | null {
  try {
    const value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));

    return value && typeof value === "object" ? (value as T) : null;
  } catch {
    return null;
  }
}

export function verifyPayload(
  route: string,
  encoded: string,
  expires: number,
  signature: string
) {
  return verifyUrl(`${route}|${encoded}`, expires, signature);
}

export function proxyPath(url: string, expires: number) {
  const params = new URLSearchParams();

  params.set("u", url);
  params.set("e", String(expires));
  params.set("s", digest(url, expires));

  return `/api/download?${params.toString()}`;
}
