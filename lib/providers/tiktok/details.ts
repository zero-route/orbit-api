import { rapidJson } from "../../rapidapi/client";
import { hostConfig } from "../../rapidapi/hosts";
import { isObj, num, str, type Json } from "../pick";

export type TikTokDetails = {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  reposts?: number;
  username?: string;
  nickname?: string;
  avatar?: string;
  followers?: number;
  description?: string;
};

function count(value: unknown) {
  const parsed = num(value);

  return parsed !== undefined && parsed >= 0 ? parsed : undefined;
}

function parseDetails(payload: unknown): TikTokDetails | null {
  if (!isObj(payload)) {
    return null;
  }

  const root: Json = isObj(payload.data) ? payload.data : payload;
  const stats = isObj(root.stats) ? root.stats : null;

  if (!stats) {
    return null;
  }

  const author = isObj(root.author) ? root.author : undefined;
  const authorStats = isObj(root.author_stats) ? root.author_stats : undefined;

  return {
    views: count(stats.play_count),
    likes: count(stats.like_count),
    comments: count(stats.comment_count),
    shares: count(stats.share_count),
    saves: count(stats.save_count),
    reposts: count(stats.repost_count),
    username: str(author?.username),
    nickname: str(author?.nickname),
    avatar: str(author?.profile_picture),
    followers: count(authorStats?.follower_count),
    description: str(root.description),
  };
}

export async function fetchDetails(
  postUrl: string,
  originalUrl: string,
  deadlineAt: number
): Promise<TikTokDetails | null> {
  let config;

  try {
    config = hostConfig("tiktok", "details");
  } catch {
    return null;
  }

  const candidates = [postUrl];

  if (originalUrl !== postUrl) {
    candidates.push(originalUrl);
  }

  for (const target of candidates) {
    try {
      const payload = await rapidJson({
        host: config.host,
        path: config.path,
        query: { video: target },
        deadlineAt,
        retries: 2,
      });

      const details = parseDetails(payload);

      if (details) {
        return details;
      }
    } catch (error) {
      console.info(
        `[tiktok-details] gagal: ${error instanceof Error ? error.message : "unknown"}`
      );
    }
  }

  return null;
}
