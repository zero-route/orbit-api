import { isObj, num, str, type Json } from "../pick";

export type XVideo = {
  label: string;
  height: number;
  url: string;
};

export type XMedia =
  | {
      type: "photo";
      url: string;
      original: string;
      ext: string;
    }
  | {
      type: "video";
      thumb?: string;
      durationMs?: number;
      variants: XVideo[];
    };

export type XTweet = {
  id: string;
  text?: string;
  username?: string;
  name?: string;
  avatar?: string;
  followers?: number;
  likes?: number;
  replies?: number;
  retweets?: number;
  bookmarks?: number;
  views?: number;
  media: XMedia[];
};

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function httpUrl(value: unknown) {
  const text = str(value);

  return text && /^https?:\/\//i.test(text) ? text : undefined;
}

export function extractTweet(body: unknown): Json | null {
  if (!isObj(body)) {
    return null;
  }

  if (isObj(body.tweet) && str(body.tweet.id)) {
    return body.tweet;
  }

  const data = isObj(body.data) ? body.data : undefined;

  if (data && isObj(data.tweet) && str(data.tweet.id)) {
    return data.tweet;
  }

  return str(body.id) && "stats" in body ? body : null;
}

function originalPhoto(url: string) {
  try {
    const parsed = new URL(url);

    if (parsed.hostname !== "pbs.twimg.com" || !parsed.pathname.startsWith("/media/")) {
      return { url, ext: "jpg" };
    }

    const match = parsed.pathname.match(/^(.*?)(?:\.([a-z0-9]+))?$/i);
    const base = match?.[1] ?? parsed.pathname;
    const format =
      match?.[2]?.toLowerCase() || parsed.searchParams.get("format") || "jpg";

    return {
      url: `https://pbs.twimg.com${base}?format=${format}&name=orig`,
      ext: format === "jpeg" ? "jpg" : format,
    };
  } catch {
    return { url, ext: "jpg" };
  }
}

function photoUrl(media: Json) {
  for (const key of ["image", "url", "media_url_https", "media_url", "src"]) {
    const found = httpUrl(media[key]);

    if (found) {
      return found;
    }
  }

  const link = httpUrl(media.link);

  return link && /twimg\.com/.test(link) ? link : undefined;
}

function sizeFromUrl(url: string) {
  const match = url.match(/\/(\d{2,5})x(\d{2,5})\//);

  return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
}

function videoVariants(media: Json) {
  const found = new Map<string, XVideo & { bitrate: number }>();

  for (const entry of list(media.video_variants)) {
    if (!isObj(entry)) {
      continue;
    }

    const link = httpUrl(entry.link);
    const type = str(entry.content_type) ?? "";

    if (!link) {
      continue;
    }

    if (type && !/mp4/i.test(type)) {
      continue;
    }

    if (!type && !/\.mp4(\?|$)/i.test(link)) {
      continue;
    }

    const size = sizeFromUrl(link);
    const height = size ? Math.min(size.width, size.height) : 0;
    const bitrate = num(entry.bitrate) ?? 0;
    const label = height > 0 ? `${height}p` : "Asli";
    const current = found.get(label);

    if (current && current.bitrate >= bitrate) {
      continue;
    }

    found.set(label, { label, height, url: link, bitrate });
  }

  const variants: XVideo[] = [...found.values()]
    .sort((a, b) => b.height - a.height || b.bitrate - a.bitrate)
    .map(({ label, height, url }) => ({ label, height, url }));

  if (variants.length === 0) {
    const fallback = httpUrl(media.video_link);

    if (fallback) {
      variants.push({ label: "Asli", height: 0, url: fallback });
    }
  }

  return variants;
}

function mediaOf(entry: unknown): XMedia | null {
  if (!isObj(entry)) {
    return null;
  }

  const type = (str(entry.type) ?? "").toLowerCase();

  if (type === "photo" || type === "image") {
    const display = photoUrl(entry);

    if (!display) {
      return null;
    }

    const original = originalPhoto(display);

    return { type: "photo", url: display, original: original.url, ext: original.ext };
  }

  if (type === "video" || type.includes("gif")) {
    const variants = videoVariants(entry);

    if (variants.length === 0) {
      return null;
    }

    return {
      type: "video",
      thumb: httpUrl(entry.image),
      durationMs: num(entry.duration_ms),
      variants,
    };
  }

  return null;
}

function count(stats: Json | undefined, key: string) {
  const value = num(stats?.[key]);

  return value !== undefined && value >= 0 ? value : undefined;
}

export function normalizeTweet(body: unknown): XTweet | null {
  const tweet = extractTweet(body);

  if (!tweet) {
    return null;
  }

  const retweeted =
    tweet.is_retweet === true && isObj(tweet.retweeted_tweet)
      ? tweet.retweeted_tweet
      : undefined;
  const base: Json = retweeted && str(retweeted.id) ? retweeted : tweet;
  const author = isObj(base.author) ? base.author : undefined;
  const stats = isObj(base.stats) ? base.stats : undefined;

  let mediaList = list(base.media);

  if (mediaList.length === 0 && isObj(base.quoted_tweet)) {
    mediaList = list(base.quoted_tweet.media);
  }

  return {
    id: str(base.id) as string,
    text: str(base.text),
    username: str(author?.username),
    name: str(author?.name),
    avatar: httpUrl(author?.profile_image),
    followers: num(author?.followers_count),
    likes: count(stats, "likes"),
    replies: count(stats, "replies"),
    retweets: count(stats, "retweets"),
    bookmarks: count(stats, "bookmarks"),
    views: count(stats, "views"),
    media: mediaList
      .map(mediaOf)
      .filter((item): item is XMedia => item !== null),
  };
}
