import { rapidJson } from "../../rapidapi/client";
import { hostConfig } from "../../rapidapi/hosts";
import { isObj, num, str } from "../pick";
import { httpUrl, rootOf } from "../instagram/media";

export type ThreadsDetails = {
  username?: string;
  name?: string;
  avatar?: string;
  text?: string;
  likes?: number;
  replies?: number;
  reposts?: number;
  shares?: number;
};

function count(value: unknown) {
  const parsed = num(value);

  return parsed !== undefined && parsed >= 0 ? parsed : undefined;
}

export function parseDetails(payload: unknown): ThreadsDetails | null {
  const root = rootOf(payload);

  if (!root) {
    return null;
  }

  const author = isObj(root.author) ? root.author : undefined;

  if (!str(root.id) && !author) {
    return null;
  }

  const stats = isObj(root.stats) ? root.stats : undefined;

  return {
    username: str(author?.username),
    name: str(author?.full_name),
    avatar: httpUrl(author?.profile_picture),
    text: str(root.text),
    likes: count(stats?.like_count),
    replies: count(stats?.reply_count),
    reposts: count(stats?.repost_count),
    shares: count(stats?.share_count),
  };
}

export async function fetchDetails(
  candidates: string[],
  deadlineAt: number
): Promise<ThreadsDetails | null> {
  let config;

  try {
    config = hostConfig("threads", "details");
  } catch {
    return null;
  }

  for (const post of candidates) {
    try {
      const payload = await rapidJson({
        host: config.host,
        path: config.path,
        query: { post },
        deadlineAt,
        retries: 2,
      });

      const details = parseDetails(payload);

      if (details) {
        return details;
      }
    } catch (error) {
      console.info(
        `[threads-details] gagal: ${error instanceof Error ? error.message : "unknown"}`
      );
    }
  }

  return null;
}
