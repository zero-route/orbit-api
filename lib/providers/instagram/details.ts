import { rapidJson } from "../../rapidapi/client";
import { hostConfig } from "../../rapidapi/hosts";
import { isObj, num, str } from "../pick";
import { rootOf } from "./media";

export type InstagramDetails = {
  username?: string;
  fullName?: string;
  avatar?: string;
  caption?: string;
  code?: string;
  productType?: string;
  likes?: number;
  comments?: number;
  views?: number;
  reposts?: number;
};

function count(value: unknown) {
  const parsed = num(value);

  return parsed !== undefined && parsed >= 0 ? parsed : undefined;
}

export function parseDetails(payload: unknown): InstagramDetails | null {
  const root = rootOf(payload);

  if (!root) {
    return null;
  }

  const owner = isObj(root.owner) ? root.owner : undefined;

  if (!str(root.id) && !owner) {
    return null;
  }

  const stats = isObj(root.stats) ? root.stats : undefined;
  const hidden = root.are_likes_hidden === true;
  const caption = isObj(root.caption) ? str(root.caption.text) : str(root.caption);

  return {
    username: str(owner?.username),
    fullName: str(owner?.full_name),
    avatar: str(owner?.profile_picture),
    caption: caption ?? str(root.title),
    code: str(root.code),
    productType: str(root.product_type)?.toLowerCase(),
    likes: hidden ? undefined : count(stats?.like_count),
    comments: count(stats?.comment_count),
    views: count(stats?.view_count) ?? count(stats?.play_count),
    reposts: count(stats?.repost_count),
  };
}

export async function fetchDetails(
  candidates: string[],
  deadlineAt: number
): Promise<InstagramDetails | null> {
  let config;

  try {
    config = hostConfig("instagram", "details");
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
        `[instagram-details] gagal: ${error instanceof Error ? error.message : "unknown"}`
      );
    }
  }

  return null;
}
