import { rapidJson } from "../../rapidapi/client";
import { hostConfig } from "../../rapidapi/hosts";
import { isObj, num, str, type Json } from "../pick";
import { httpUrl } from "./media";

export type Mp4Variant = {
  label: string;
  height: number;
  url: string;
};

export type PinDetails = {
  title?: string;
  description?: string;
  username?: string;
  name?: string;
  avatar?: string;
  followers?: number;
  profileUrl?: string;
  likes?: number;
  saves?: number;
  comments?: number;
  shares?: number;
  cover?: string;
  videos: Mp4Variant[];
};

function count(value: unknown) {
  const parsed = num(value);

  return parsed !== undefined && parsed >= 0 ? parsed : undefined;
}

function collectVideos(root: unknown) {
  const found = new Map<string, Mp4Variant>();

  const visit = (value: unknown, depth: number) => {
    if (depth > 3 || !isObj(value)) {
      return;
    }

    const link = httpUrl(value.url);

    if (link && /\.mp4(\?|$)/i.test(link)) {
      const height = num(value.height) ?? 0;
      const width = num(value.width) ?? 0;
      const size = height && width ? Math.min(height, width) : height;
      const label = size > 0 ? `${size}p` : "Asli";

      if (!found.has(label)) {
        found.set(label, { label, height: size, url: link });
      }

      return;
    }

    for (const child of Object.values(value)) {
      visit(child, depth + 1);
    }
  };

  visit(root, 0);

  return [...found.values()].sort((a, b) => b.height - a.height);
}

export function parseDetails(payload: unknown): PinDetails | null {
  if (!isObj(payload) || !isObj(payload.data)) {
    return null;
  }

  const data: Json = payload.data;

  if (!str(data.entityId) && !str(data.id)) {
    return null;
  }

  const creator = isObj(data.nativeCreator) ? data.nativeCreator : undefined;
  const pinner = isObj(data.pinner) ? data.pinner : creator;
  const aggregatedPin = isObj(data.aggregatedPinData)
    ? data.aggregatedPinData
    : undefined;
  const aggregated = isObj(aggregatedPin?.aggregatedStats)
    ? aggregatedPin.aggregatedStats
    : undefined;

  const username = str(pinner?.username) ?? str(creator?.username);

  return {
    title: str(data.title) ?? str(data.gridTitle),
    description: str(data.closeupUnifiedDescription) ?? str(data.description),
    username,
    name: str(pinner?.fullName) ?? str(creator?.fullName),
    avatar: httpUrl(pinner?.imageLargeUrl) ?? httpUrl(pinner?.imageMediumUrl),
    followers: count(pinner?.followerCount),
    profileUrl: httpUrl(creator?.profileUrl),
    likes: count(data.totalReactionCount),
    saves: count(aggregated?.saves) ?? count(data.repinCount),
    comments: count(aggregatedPin?.commentCount),
    shares: count(data.shareCount),
    cover:
      httpUrl(isObj(data.image736x) ? data.image736x.url : undefined) ??
      httpUrl(isObj(data.imageSpec736x) ? data.imageSpec736x.url : undefined),
    videos: collectVideos(data.videos),
  };
}

export async function fetchDetails(
  id: string,
  deadlineAt: number
): Promise<PinDetails | null> {
  let config;

  try {
    config = hostConfig("pinterest", "details");
  } catch {
    return null;
  }

  const path = `${config.path.replace(/\/+$/, "")}/${encodeURIComponent(id)}/`;

  try {
    const payload = await rapidJson({
      host: config.host,
      path,
      query: {},
      deadlineAt,
      retries: 2,
    });

    return parseDetails(payload);
  } catch (error) {
    console.info(
      `[pinterest-details] gagal: ${error instanceof Error ? error.message : "unknown"}`
    );

    return null;
  }
}
