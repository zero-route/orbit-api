import { AppError } from "../errors";
import { schedule } from "../device/log";
import { coolDown, reportKey, requireKeys, usableKeys } from "./keys";

export type RapidRequest = {
  host: string;
  path: string;
  query: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  deadlineAt?: number;
  method?: "GET" | "POST";
  body?: unknown;
};

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 900;
const MIN_ATTEMPT_MS = 1_500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function messageOf(payload: unknown, fallback: string) {
  if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;

    if (typeof record.message === "string" && record.message.trim()) {
      return record.message.trim();
    }
  }

  return fallback;
}

export function deadlineIn(ms: number) {
  return Date.now() + ms;
}

export async function rapidJson(request: RapidRequest): Promise<unknown> {
  const keys = usableKeys(request.host, await requireKeys());
  const retries = request.retries ?? DEFAULT_RETRIES;
  const delay = request.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const timeout = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const offset = Math.floor(Math.random() * keys.length);
  const search = new URLSearchParams(request.query).toString();
  const endpoint = `https://${request.host}${request.path}${search ? `?${search}` : ""}`;
  const method = request.method ?? "GET";
  const body =
    request.body === undefined ? undefined : JSON.stringify(request.body);

  let lastError: AppError | null = null;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    const remaining = request.deadlineAt
      ? request.deadlineAt - Date.now()
      : Number.POSITIVE_INFINITY;

    if (remaining < MIN_ATTEMPT_MS) {
      break;
    }

    if (attempt > 0) {
      await sleep(Math.min(delay * attempt, Math.max(0, remaining - MIN_ATTEMPT_MS)));
    }

    const key = keys[(offset + attempt) % keys.length];

    try {
      const response = await fetch(endpoint, {
        method,
        headers: {
          "X-Rapidapi-Key": key,
          "X-Rapidapi-Host": request.host,
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(Math.min(timeout, remaining)),
      });

      const text = await response.text();

      let payload: unknown;

      try {
        payload = JSON.parse(text);
      } catch {
        lastError = new AppError(
          "Server data memberi respons tidak terduga.",
          502,
          text.slice(0, 300),
          response.status
        );
        continue;
      }

      if (response.ok) {
        schedule(() => reportKey(request.host, key, "ok"));

        return payload;
      }

      const detail = text.slice(0, 300);

      if (response.status === 429) {
        coolDown(request.host, key, "rate");
        schedule(() => reportKey(request.host, key, "rate"));

        lastError = new AppError(
          "Server sedang ramai, coba lagi sebentar.",
          429,
          detail,
          response.status
        );
        continue;
      }

      if (response.status === 401 || response.status === 403) {
        coolDown(request.host, key, "denied");
        schedule(() => reportKey(request.host, key, "denied"));

        lastError = new AppError(
          messageOf(payload, "Akses ke server data ditolak."),
          502,
          detail,
          response.status
        );
        continue;
      }

      if (response.status >= 500) {
        lastError = new AppError(
          "Server data sedang bermasalah.",
          502,
          detail,
          response.status
        );
        continue;
      }

      throw new AppError(
        messageOf(payload, `Server data menolak permintaan (${response.status}).`),
        response.status === 404 ? 404 : 502,
        detail,
        response.status
      );
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      lastError = new AppError(
        "Server data tidak merespons, coba lagi.",
        504,
        error instanceof Error ? error.message : undefined
      );
    }
  }

  throw lastError ?? new AppError("Gagal menghubungi server data.", 502);
}
