import { AppError } from "../../errors";
import { profileUrlFor } from "../../detect/profile";
import { deadlineIn, rapidJson } from "../../rapidapi/client";
import { hostConfig } from "../../rapidapi/hosts";
import { expiryFromNow, proxyPath } from "../../sign";
import type {
  DetectedInput,
  MediaResult,
  Photo,
  Provider,
  Quality,
} from "../types";
import { normalizeTweet, type XMedia, type XTweet } from "./normalize";
import { parseXTarget } from "./target";

const BUDGET_MS = 40_000;

async function fetchTweet(tweetUrl: string): Promise<XTweet> {
  const { host, path } = hostConfig("x");

  try {
    const payload = await rapidJson({
      host,
      path,
      query: { tweet: tweetUrl },
      deadlineAt: deadlineIn(BUDGET_MS),
      retries: 3,
    });

    const tweet = normalizeTweet(payload);

    if (tweet) {
      return tweet;
    }
  } catch (error) {
    if (error instanceof AppError && error.status === 404) {
      throw new AppError(
        "Tweet tidak ditemukan. Pastikan tautan benar dan akunnya tidak privat.",
        404
      );
    }

    throw error;
  }

  throw new AppError(
    "Tweet tidak ditemukan. Pastikan tautan benar dan akunnya tidak privat.",
    404
  );
}

function qualitiesOf(media: Extract<XMedia, { type: "video" }>, wrap: (url: string) => string) {
  return media.variants.map(
    (variant): Quality => ({
      id: variant.label,
      label: variant.label,
      ext: "mp4",
      url: wrap(variant.url),
      height: variant.height || undefined,
    })
  );
}

export const xProvider: Provider = async (
  input: DetectedInput
): Promise<MediaResult> => {
  const startedAt = Date.now();
  const target = parseXTarget(input.url);
  const tweet = await fetchTweet(
    `https://x.com/${target.username ?? "i"}/status/${target.id}`
  );

  console.info(`[x] tweet ${Date.now() - startedAt}ms media=${tweet.media.length}`);

  if (tweet.media.length === 0) {
    throw new AppError(
      "Tweet ini tidak berisi video atau foto yang bisa diunduh.",
      422
    );
  }

  const expires = expiryFromNow();
  const wrap = (url: string) => proxyPath(url, expires);
  const username = tweet.username ?? target.username;

  const first = tweet.media[0];
  const onlyVideo = tweet.media.length === 1 && first.type === "video";

  const author = {
    name: tweet.name,
    username,
    avatarUrl: tweet.avatar ? wrap(tweet.avatar) : undefined,
    followers: tweet.followers,
    profileUrl: profileUrlFor("x", username),
  };

  const stats = {
    likes: tweet.likes,
    comments: tweet.replies,
    reposts: tweet.retweets,
    saves: tweet.bookmarks,
    views: tweet.views,
  };

  const base = {
    platform: "x" as const,
    sourceUrl: input.url,
    postId: tweet.id,
    caption: tweet.text,
    author,
    stats,
    expiresAt: expires * 1000,
  };

  if (onlyVideo && first.type === "video") {
    return {
      ...base,
      kind: "video",
      durationSeconds: first.durationMs ? Math.round(first.durationMs / 1000) : undefined,
      coverUrl: first.thumb ? wrap(first.thumb) : undefined,
      videos: qualitiesOf(first, wrap),
      photos: [],
    };
  }

  const photos: Photo[] = tweet.media.map((item, index) => {
    if (item.type === "photo") {
      return {
        id: String(index + 1),
        url: wrap(item.original),
        previewUrl: wrap(item.url),
        ext: item.ext,
      };
    }

    return {
      id: String(index + 1),
      url: wrap(item.variants[0].url),
      thumbnailUrl: item.thumb ? wrap(item.thumb) : undefined,
      ext: "mp4",
      isVideo: true,
    };
  });

  return {
    ...base,
    kind: "photo",
    coverUrl: photos[0].previewUrl ?? photos[0].thumbnailUrl,
    videos: [],
    photos,
  };
};
