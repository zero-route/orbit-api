import { AppError } from "../../errors";
import { isObj, num, str } from "../pick";

export type YouTubeVideo = {
  title: string;
  isShort: boolean;
  durationSeconds?: number;
  publishedAt?: number;
  description?: string;
  thumbnail?: string;
  channelName?: string;
  channelHandle?: string;
  channelLink?: string;
  channelAvatar?: string;
  subscribers?: number;
  views?: number;
  likes?: number;
  comments?: number;
};

function httpUrl(value: unknown) {
  const text = str(value);

  return text && /^https?:\/\//i.test(text) ? text : undefined;
}

function count(value: unknown) {
  const parsed = num(value);

  return parsed !== undefined && parsed >= 0 ? parsed : undefined;
}

export function parseVideo(payload: unknown, id: string): YouTubeVideo | null {
  if (!isObj(payload) || !isObj(payload.video) || !str(payload.video.id)) {
    return null;
  }

  const video = payload.video;
  const playability = isObj(video.playability) ? video.playability : undefined;

  if (video.is_live === true || video.is_upcoming === true) {
    throw new AppError(
      "Siaran langsung atau video yang belum tayang belum didukung.",
      422
    );
  }

  if (playability && str(playability.status) && playability.status !== "OK") {
    throw new AppError(
      str(playability.reason) ??
        "Video ini tidak bisa diputar (privat, dihapus, atau dibatasi).",
      422
    );
  }

  const channel = isObj(video.channel) ? video.channel : undefined;
  const published = str(video.published_at);
  const publishedMs = published ? Date.parse(published) : NaN;

  return {
    title: str(video.title) ?? "Video YouTube",
    isShort: video.is_short === true,
    durationSeconds: num(video.duration_seconds),
    publishedAt: Number.isFinite(publishedMs)
      ? Math.floor(publishedMs / 1000)
      : undefined,
    description: str(video.description),
    thumbnail:
      httpUrl(video.thumbnail) ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    channelName: str(channel?.name),
    channelHandle: str(channel?.handle)?.replace(/^@/, ""),
    channelLink: httpUrl(channel?.link),
    channelAvatar: httpUrl(channel?.thumbnail),
    subscribers: count(channel?.subscriber_count),
    views: count(video.view_count),
    likes: count(video.like_count),
    comments: count(video.comment_count),
  };
}
