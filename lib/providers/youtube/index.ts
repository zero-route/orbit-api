import { AppError } from "../../errors";
import { deadlineIn, rapidJson } from "../../rapidapi/client";
import { hostConfig } from "../../rapidapi/hosts";
import { expiryFromNow, payloadPath, proxyPath } from "../../sign";
import type { DetectedInput, MediaResult, Provider, Quality } from "../types";
import { VIDEO_FORMATS } from "./download";
import { parseVideo } from "./normalize";
import { parseVideoId, watchUrl } from "./target";

const BUDGET_MS = 40_000;

export const YT_LINK_ROUTE = "/api/ytlink";
export const YT_MP3_ROUTE = "/api/ytmp3";

export const youtubeProvider: Provider = async (
  input: DetectedInput
): Promise<MediaResult> => {
  const startedAt = Date.now();
  const id = parseVideoId(input.url);
  const { host, path } = hostConfig("youtube");

  let payload: unknown;

  try {
    payload = await rapidJson({
      host,
      path,
      query: { video: watchUrl(id) },
      deadlineAt: deadlineIn(BUDGET_MS),
      timeoutMs: 20_000,
      retries: 3,
    });
  } catch (error) {
    if (
      error instanceof AppError &&
      error.upstream !== undefined &&
      [400, 404, 422].includes(error.upstream)
    ) {
      throw new AppError(
        "Video tidak ditemukan atau tidak bisa diakses. Pastikan tautan benar.",
        404
      );
    }

    throw error;
  }

  const video = parseVideo(payload, id);

  console.info(`[youtube] details ${Date.now() - startedAt}ms ok=${Boolean(video)}`);

  if (!video) {
    throw new AppError(
      "Video tidak ditemukan atau tidak bisa diakses. Pastikan tautan benar.",
      404
    );
  }

  const expires = expiryFromNow();
  const year = video.publishedAt
    ? String(new Date(video.publishedAt * 1000).getUTCFullYear())
    : null;

  const videos: Quality[] = VIDEO_FORMATS.map((format) => ({
    id: format,
    label: format,
    ext: "mp4",
    url: payloadPath(YT_LINK_ROUTE, JSON.stringify({ id, f: format }), expires),
    height: Number.parseInt(format, 10),
  }));

  const handle = video.channelHandle;
  const caption = [video.title, video.description]
    .filter((part): part is string => Boolean(part))
    .join("\n\n");

  return {
    platform: "youtube",
    kind: "video",
    sourceUrl: input.url,
    postId: id,
    caption,
    author:
      video.channelName || handle
        ? {
            name: video.channelName,
            username: handle,
            avatarUrl: video.channelAvatar
              ? proxyPath(video.channelAvatar, expires)
              : undefined,
            followers: video.subscribers,
            profileUrl:
              video.channelLink ??
              (handle ? `https://www.youtube.com/@${handle}` : undefined),
          }
        : undefined,
    stats: {
      views: video.views,
      likes: video.likes,
      comments: video.comments,
    },
    durationSeconds: video.durationSeconds,
    coverUrl: video.thumbnail ? proxyPath(video.thumbnail, expires) : undefined,
    videos,
    photos: [],
    audio: {
      url: payloadPath(
        YT_MP3_ROUTE,
        JSON.stringify({
          id,
          t: video.title,
          r: video.channelName ?? null,
          y: year,
        }),
        expires
      ),
      title: video.title,
      artist: video.channelName,
      ext: "mp3",
    },
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0`,
    expiresAt: expires * 1000,
  };
};
