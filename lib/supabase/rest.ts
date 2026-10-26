import { AppError } from "../errors";

type Row = Record<string, unknown>;

function config() {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !key) {
    throw new AppError("Database belum dikonfigurasi di environment.", 503);
  }

  return { url, key };
}

async function call(
  table: string,
  query: string,
  init: { method: string; body?: unknown; prefer?: string }
): Promise<Row[]> {
  const { url, key } = config();

  let response: Response;

  try {
    response = await fetch(`${url}/rest/v1/${table}${query}`, {
      method: init.method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init.prefer ? { Prefer: init.prefer } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new AppError("Database tidak merespons, coba lagi.", 503);
  }

  const text = await response.text();

  if (!response.ok) {
    throw new AppError("Database menolak permintaan.", 502, text.slice(0, 300), response.status);
  }

  if (!text) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(text);

    return Array.isArray(parsed) ? (parsed as Row[]) : [];
  } catch {
    return [];
  }
}

export function sbSelect(table: string, query: string) {
  return call(table, query, { method: "GET" });
}

export function sbUpsert(table: string, conflict: string, body: Row) {
  return call(table, `?on_conflict=${encodeURIComponent(conflict)}`, {
    method: "POST",
    body,
    prefer: "resolution=merge-duplicates,return=representation",
  });
}

export function sbInsert(table: string, body: Row | Row[]) {
  return call(table, "", {
    method: "POST",
    body,
    prefer: "return=minimal",
  });
}

export function sbPatch(table: string, query: string, body: Row) {
  return call(table, query, {
    method: "PATCH",
    body,
    prefer: "return=representation",
  });
}
