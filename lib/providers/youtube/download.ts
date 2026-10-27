import { AppError } from "../../errors";
import { deadlineIn, rapidJson } from "../../rapidapi/client";
import { hostConfig } from "../../rapidapi/hosts";
import { isObj, str } from "../pick";
import { watchUrl } from "./target";

export const VIDEO_FORMATS = ["1080p", "720p", "480p", "360p", "240p"] as const;

const ALLOWED = new Set<string>([...VIDEO_FORMATS, "mp3"]);

export type DownloadLink = {
  url: string;
  filename?: string;
  cover?: string;
};

export function isAllowedFormat(value: unknown): value is string {
  return typeof value === "string" && ALLOWED.has(value);
}

function pickCover(thumbnails: unknown) {
  if (!isObj(thumbnails)) {
    return undefined;
  }

  for (const key of ["max", "high", "hd", "maxres"]) {
    const value = thumbnails[key];

    if (typeof value === "string" && /^https:\/\//i.test(value)) {
      return value;
    }
  }

  return undefined;
}

export async function requestDownload(
  id: string,
  format: string,
  budgetMs = 52_000
): Promise<DownloadLink> {
  const { host, path } = hostConfig("youtube", "download");

  let payload: unknown;

  try {
    payload = await rapidJson({
      host,
      path,
      method: "POST",
      body: { url: watchUrl(id), format },
      query: {},
      deadlineAt: deadlineIn(budgetMs),
      timeoutMs: budgetMs,
      retries: 2,
      retryDelayMs: 1_200,
    });
  } catch (error) {
    if (
      error instanceof AppError &&
      error.upstream !== undefined &&
      [400, 404, 422].includes(error.upstream)
    ) {
      throw new AppError(
        `Format ${format} tidak tersedia untuk video ini. Coba kualitas lain.`,
        422
      );
    }

    throw error;
  }

  const link = isObj(payload) ? str(payload.download_url) : undefined;

  if (!isObj(payload) || payload.ok !== true || !link || !/^https:\/\//i.test(link)) {
    throw new AppError(
      "Gagal membuat link unduhan. Coba lagi atau pilih kualitas lain.",
      502
    );
  }

  return {
    url: link,
    filename: str(payload.filename),
    cover: pickCover(payload.thumbnails),
  };
}
