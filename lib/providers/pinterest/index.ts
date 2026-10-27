import { AppError } from "../../errors";
import { profileUrlFor } from "../../detect/profile";
import { deadlineIn, rapidJson } from "../../rapidapi/client";
import { hostConfig } from "../../rapidapi/hosts";
import { expiryFromNow, proxyPath } from "../../sign";
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
import { displayImage, imageExt, parseMedia, type PinMedia } from "./media";
import { resolvePin } from "./target";

const MAIN_BUDGET_MS = 40_000;
const DETAILS_BUDGET_MS = 25_000;

async function fetchMedia(urls: string[], deadlineAt: number): Promise<PinMedia> {
  const { host, path } = hostConfig("pinterest");

  let lastError: AppError | null = null;

  for (const url of urls) {
    try {
      const payload = await rapidJson({
        host,
        path,
        query: { url },
        deadlineAt,
        retries: 3,
      });

      const media = parseMedia(payload);

      if (media) {
        return media;
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
    "Pin tidak ditemukan. Pastikan tautan benar dan pin tidak privat.",
    404
  );
}

export const pinterestProvider: Provider = async (
  input: DetectedInput
): Promise<MediaResult> => {
  const startedAt = Date.now();
  const deadlineAt = deadlineIn(MAIN_BUDGET_MS);
  const pin = await resolvePin(input.url);
  const media = await fetchMedia(pin.urls, deadlineAt);
  const id = pin.id ?? media.id;
  const expires = expiryFromNow();
  const wrap = (url: string) => proxyPath(url, expires);

  console.info(`[pinterest] media ${Date.now() - startedAt}ms video=${media.isVideo}`);

  const base = {
    platform: "pinterest" as const,
    sourceUrl: input.url,
    postId: id,
    expiresAt: expires * 1000,
    detailsPending: true,
  };

  if (!media.isVideo) {
    const preview = displayImage(media.downloadUrl);

    const photo: Photo = {
      id: "1",
      url: wrap(media.downloadUrl),
      previewUrl: wrap(preview),
      width: media.width,
      height: media.height,
      ext: imageExt(media.downloadUrl),
    };

    return {
      ...base,
      kind: "photo",
      coverUrl: photo.previewUrl,
      videos: [],
      photos: [photo],
    };
  }

  let cover = media.thumbnail ? wrap(displayImage(media.thumbnail)) : undefined;
  let videos: Quality[] = [];

  if (!media.isHls) {
    videos = [
      { id: "original", label: "Asli", ext: "mp4", url: wrap(media.downloadUrl) },
    ];
  } else {
    const details = id ? await fetchDetails(id, deadlineAt) : null;

    videos = (details?.videos ?? []).map((variant) => ({
      id: variant.label,
      label: variant.label,
      ext: "mp4",
      url: wrap(variant.url),
      height: variant.height || undefined,
    }));

    if (videos.length === 0) {
      throw new AppError("Video Pinterest ini belum bisa diunduh.", 422);
    }

    if (!cover && details?.cover) {
      cover = wrap(details.cover);
    }
  }

  return {
    ...base,
    kind: "video",
    coverUrl: cover,
    videos,
    photos: [],
  };
};

export const pinterestDetails: DetailsProvider = async (
  input: DetectedInput
): Promise<MediaPatch | null> => {
  const startedAt = Date.now();
  const deadlineAt = deadlineIn(DETAILS_BUDGET_MS);
  const pin = await resolvePin(input.url);

  if (!pin.id) {
    return null;
  }

  const details = await fetchDetails(pin.id, deadlineAt);

  console.info(`[pinterest] details ${Date.now() - startedAt}ms ok=${Boolean(details)}`);

  if (!details) {
    return null;
  }

  const expires = expiryFromNow();
  const wrap = (url: string) => proxyPath(url, expires);

  const caption = [details.title, details.description]
    .filter((part, index, all): part is string => Boolean(part) && all.indexOf(part) === index)
    .join("\n\n");

  return {
    caption: caption || undefined,
    author: {
      name: details.name,
      username: details.username,
      avatarUrl: details.avatar ? wrap(details.avatar) : undefined,
      followers: details.followers,
      profileUrl: details.profileUrl ?? profileUrlFor("pinterest", details.username),
    },
    stats: {
      likes: details.likes,
      comments: details.comments,
      shares: details.shares,
      saves: details.saves,
    },
    coverUrl: details.cover ? wrap(details.cover) : undefined,
  };
};
