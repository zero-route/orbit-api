import { AppError } from "../errors";
import { sbPatch, sbSelect } from "../supabase/rest";

const CACHE_MS = 60_000;
const RATE_COOLDOWN_MS = 5 * 60_000;
const DENIED_COOLDOWN_MS = 30 * 60_000;

let cached: { keys: string[]; until: number } | null = null;

const cooling = new Map<string, number>();
const failures = new Map<string, number>();
const lastOk = new Map<string, number>();

export function envKeys(): string[] {
  const raw = process.env.RAPIDAPI_KEYS || process.env.RAPIDAPI_KEY || "";

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function databaseConfigured() {
  return Boolean(
    process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  );
}

async function storedKeys(): Promise<string[]> {
  if (!databaseConfigured()) {
    return [];
  }

  const now = Date.now();

  if (cached && cached.until > now) {
    return cached.keys;
  }

  try {
    const rows = await sbSelect(
      "api_keys",
      "?status=eq.active&select=key&order=last_used.asc.nullsfirst&limit=50"
    );

    const keys = rows
      .map((row) => (typeof row.key === "string" ? row.key.trim() : ""))
      .filter(Boolean);

    cached = { keys, until: now + CACHE_MS };

    return keys;
  } catch {
    cached = { keys: cached?.keys ?? [], until: now + 15_000 };

    return cached.keys;
  }
}

export async function requireKeys(): Promise<string[]> {
  const merged = [...new Set([...envKeys(), ...(await storedKeys())])];

  if (merged.length === 0) {
    throw new AppError("RAPIDAPI_KEY belum dikonfigurasi di environment.", 500);
  }

  return merged;
}

function slot(host: string, key: string) {
  return `${host}|${key}`;
}

export function usableKeys(host: string, keys: string[], now = Date.now()) {
  const ready = keys.filter((key) => (cooling.get(slot(host, key)) ?? 0) <= now);

  return ready.length > 0 ? ready : keys;
}

export function coolDown(host: string, key: string, kind: "rate" | "denied") {
  cooling.set(
    slot(host, key),
    Date.now() + (kind === "rate" ? RATE_COOLDOWN_MS : DENIED_COOLDOWN_MS)
  );
}

export function resetKeyState() {
  cooling.clear();
  failures.clear();
  lastOk.clear();
  cached = null;
}

export async function reportKey(
  host: string,
  key: string,
  outcome: "ok" | "rate" | "denied"
) {
  if (!databaseConfigured()) {
    return;
  }

  const id = slot(host, key);
  const now = Date.now();

  if (outcome === "ok") {
    const clean = (failures.get(id) ?? 0) === 0;

    if (clean && now - (lastOk.get(id) ?? 0) < 5 * 60_000) {
      return;
    }

    lastOk.set(id, now);
  }

  const count = outcome === "ok" ? 0 : (failures.get(id) ?? 0) + 1;

  failures.set(id, count);

  await sbPatch("api_keys", `?key=eq.${encodeURIComponent(key)}`, {
    last_used: new Date().toISOString(),
    fail_count: count,
    last_error: outcome === "ok" ? null : `${host} ${outcome}`,
  });
}
