import { AppError } from "../../errors";
import { deadlineIn, rapidJson } from "../../rapidapi/client";
import { hostConfig } from "../../rapidapi/hosts";
import { expiryFromNow, proxyPath, slideshowPath } from "../../sign";
import type {
  DetailsProvider,
  DetectedInput,
  MediaPatch,
  MediaResult,
  Photo,
  Provider,
} from "../types";
import { fetchDetails } from "./details";
import { normalizeTikTok, type TikTokRaw } from "./normalize";
import { resolvePostUrl } from "./resolveUrl";

const MAIN_BUDGET_MS = 40_000;
const DETAILS_BUDGET_MS = 25_000;
const MIN_RETRY_WINDOW_MS = 8_000;

function photoExt(url: string) {
  if (/\.webp(\?|$)/i.test(url)) return "webp";
  if (/\.png(\?|$)/i.test(url)) return "png";

  return "jpg";
}

async function fetchRaw(targetUrl: string, deadlineAt: number): Promise<TikTokRaw> {
  const { host, path } = hostConfig("tiktok");

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const payload = await rapidJson({
      host,
      path,
      query: { url: targetUrl },
      deadlineAt,
      retries: 3,
    });

    try {
      return normalizeTikTok(payload, targetUrl);
    } catch (error) {
      if (attempt === 1 || deadlineAt - Date.now() < MIN_RETRY_WINDOW_MS) {
        throw error;
      }
    }
  }

  throw new AppError("Gagal mengambil data dari TikTok.", 502);
}

export async function fetchTikTokPost(inputUrl: string) {
  const deadlineAt = deadlineIn(MAIN_BUDGET_MS);
  const targetUrl = await resolvePostUrl(inputUrl);

  return fetchRaw(targetUrl, deadlineAt);
}

export const tiktokProvider: Provider = async (
  input: DetectedInput
): Promise<MediaResult> => {
  const startedAt = Date.now();
  const deadlineAt = deadlineIn(MAIN_BUDGET_MS);
  const targetUrl = await resolvePostUrl(input.url);
  const raw = await fetchRaw(targetUrl, deadlineAt);

  console.info(`[tiktok] media ${Date.now() - startedAt}ms`);

  const expires = expiryFromNow();
  const wrap = (url?: string) => (url ? proxyPath(url, expires) : undefined);
  const isPhoto = raw.photos.length > 0;

  const rawHasStats = [raw.likes, raw.comments, raw.shares, raw.views].some(
    (value) => (value ?? 0) > 0
  );
  const fromRaw = (value?: number) => (rawHasStats ? value : undefined);

  const photos: Photo[] = raw.photos.map((url, index) => ({
    id: String(index + 1),
    url: proxyPath(url, expires),
    ext: photoExt(url),
  }));

  const videoUrl = wrap(raw.videoUrl);
  const audioUrl = wrap(raw.audioUrl);

  return {
    platform: "tiktok",
    kind: isPhoto ? "photo" : "video",
    sourceUrl: input.url,
    postId: raw.id,
    caption: raw.description || undefined,
    author: {
      name: raw.nickname,
      username: raw.username,
      avatarUrl: wrap(raw.avatar),
    },
    stats: {
      likes: fromRaw(raw.likes),
      comments: fromRaw(raw.comments),
      shares: fromRaw(raw.shares),
      views: fromRaw(raw.views),
    },
    durationSeconds: raw.durationSeconds,
    coverUrl: wrap(raw.cover),
    videos:
      !isPhoto && videoUrl
        ? [{ id: "original", label: "Asli", ext: "mp4", url: videoUrl }]
        : [],
    photos,
    audio: audioUrl
      ? {
          url: audioUrl,
          title: raw.audioTitle,
          artist: raw.audioArtist,
          ext: "mp3",
        }
      : undefined,
    expiresAt: expires * 1000,
    detailsPending: true,
    slideshowUrl:
      isPhoto && audioUrl ? slideshowPath(input.url, expires) : undefined,
  };
};

export const tiktokDetails: DetailsProvider = async (
  input: DetectedInput
): Promise<MediaPatch | null> => {
  const startedAt = Date.now();
  const deadlineAt = deadlineIn(DETAILS_BUDGET_MS);
  const targetUrl = await resolvePostUrl(input.url);
  const details = await fetchDetails(targetUrl, input.url, deadlineAt);

  console.info(`[tiktok] details ${Date.now() - startedAt}ms ok=${Boolean(details)}`);

  if (!details) {
    return null;
  }

  const expires = expiryFromNow();

  return {
    caption: details.description,
    author: {
      name: details.nickname,
      username: details.username,
      avatarUrl: details.avatar ? proxyPath(details.avatar, expires) : undefined,
      followers: details.followers,
    },
    stats: {
      likes: details.likes,
      comments: details.comments,
      shares: details.shares,
      views: details.views,
      saves: details.saves,
      reposts: details.reposts,
    },
  };
};
