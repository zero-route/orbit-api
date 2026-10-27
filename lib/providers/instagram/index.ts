import { AppError } from "../../errors";
import { profileUrlFor } from "../../detect/profile";
import { deadlineIn, rapidJson } from "../../rapidapi/client";
import { hostConfig } from "../../rapidapi/hosts";
import { expiryFromNow, proxyPath } from "../../sign";
import { isObj, str } from "../pick";
import type {
  DetailsProvider,
  DetectedInput,
  MediaPatch,
  MediaResult,
  Photo,
  Provider,
  Quality,
} from "../types";
import { fetchDetails } from "./details";
import { mediaList, rootOf, type IgMedia } from "./media";
import { candidatesOf, resolveTarget } from "./target";

const MAIN_BUDGET_MS = 40_000;
const DETAILS_BUDGET_MS = 25_000;

function imageExt(url: string) {
  if (/\.webp(\?|$)/i.test(url)) return "webp";
  if (/\.png(\?|$)/i.test(url)) return "png";

  return "jpg";
}

async function fetchMedia(candidates: string[], deadlineAt: number) {
  const { host, path } = hostConfig("instagram");

  let lastError: AppError | null = null;

  for (const post of candidates) {
    try {
      const payload = await rapidJson({
        host,
        path,
        query: { post },
        deadlineAt,
        retries: 3,
      });

      const items = mediaList(payload);

      if (items.length > 0) {
        return { payload, items };
      }
    } catch (error) {
      if (!(error instanceof AppError)) {
        throw error;
      }

      lastError = error;

      if (error.status === 429) {
        break;
      }
    }
  }

  if (lastError && lastError.status !== 404) {
    throw lastError;
  }

  throw new AppError(
    "Media tidak ditemukan. Pastikan tautan benar, akun tidak privat, dan konten masih tersedia.",
    404
  );
}

export function buildMedia(items: IgMedia[], expires: number) {
  const wrap = (url: string) => proxyPath(url, expires);
  const hasPhoto = items.some((item) => item.type === "photo");

  if (!hasPhoto && items.length === 1) {
    const only = items[0];
    const videos: Quality[] = [
      { id: "original", label: "Asli", ext: "mp4", url: wrap(only.url) },
    ];

    return {
      kind: "video" as const,
      videos,
      photos: [] as Photo[],
      cover: only.thumb ? wrap(only.thumb) : undefined,
    };
  }

  if (!hasPhoto) {
    const videos: Quality[] = items.map((item, index) => ({
      id: String(index + 1),
      label: `Video ${index + 1}`,
      ext: "mp4",
      url: wrap(item.url),
    }));

    return {
      kind: "video" as const,
      videos,
      photos: [] as Photo[],
      cover: items[0].thumb ? wrap(items[0].thumb) : undefined,
    };
  }

  const photos: Photo[] = items.map((item, index) => ({
    id: String(index + 1),
    url: wrap(item.url),
    thumbnailUrl: item.thumb ? wrap(item.thumb) : undefined,
    ext: item.type === "video" ? "mp4" : imageExt(item.url),
    isVideo: item.type === "video" || undefined,
  }));

  return {
    kind: "photo" as const,
    videos: [] as Quality[],
    photos,
    cover: photos[0].thumbnailUrl ?? photos[0].url,
  };
}

export const instagramProvider: Provider = async (
  input: DetectedInput
): Promise<MediaResult> => {
  const startedAt = Date.now();
  const deadlineAt = deadlineIn(MAIN_BUDGET_MS);
  const target = await resolveTarget(input.url);
  const { payload, items } = await fetchMedia(candidatesOf(target), deadlineAt);

  console.info(`[instagram] media ${Date.now() - startedAt}ms items=${items.length}`);

  const expires = expiryFromNow();
  const built = buildMedia(items, expires);
  const root = rootOf(payload);
  const owner = root && isObj(root.owner) ? root.owner : undefined;
  const username = str(owner?.username) ?? target.username;
  const avatar = str(owner?.profile_picture);

  return {
    platform: "instagram",
    kind: built.kind,
    sourceUrl: input.url,
    postId: target.shortcode ?? target.id,
    author:
      username || owner
        ? {
            name: str(owner?.full_name),
            username,
            avatarUrl: avatar ? proxyPath(avatar, expires) : undefined,
            profileUrl: profileUrlFor("instagram", username),
          }
        : undefined,
    coverUrl: built.cover,
    videos: built.videos,
    photos: built.photos,
    expiresAt: expires * 1000,
    detailsPending: true,
  };
};

export const instagramDetails: DetailsProvider = async (
  input: DetectedInput
): Promise<MediaPatch | null> => {
  const startedAt = Date.now();
  const deadlineAt = deadlineIn(DETAILS_BUDGET_MS);
  const target = await resolveTarget(input.url);
  const details = await fetchDetails(candidatesOf(target), deadlineAt);

  console.info(`[instagram] details ${Date.now() - startedAt}ms ok=${Boolean(details)}`);

  if (!details) {
    return null;
  }

  const expires = expiryFromNow();

  return {
    caption: details.caption,
    author: {
      name: details.fullName,
      username: details.username,
      avatarUrl: details.avatar ? proxyPath(details.avatar, expires) : undefined,
      profileUrl: profileUrlFor("instagram", details.username),
    },
    stats: {
      likes: details.likes,
      comments: details.comments,
      views: details.views,
      reposts: details.reposts,
    },
  };
};
