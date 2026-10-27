import { isObj, num, str, type Json } from "../pick";

export type IgMedia = {
  type: "video" | "photo";
  url: string;
  thumb?: string;
};

export function httpUrl(value: unknown) {
  const text = str(value);

  return text && /^https?:\/\//i.test(text) ? text : undefined;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function rootOf(body: unknown): Json | undefined {
  if (!isObj(body)) {
    return undefined;
  }

  return isObj(body.data) ? body.data : body;
}

function bestImage(node: Json) {
  const width = num(node.width);
  const height = num(node.height);
  const ratio = width && height ? width / height : undefined;

  let best: string | undefined;
  let area = -1;

  for (const entry of list(node.images)) {
    if (!isObj(entry)) {
      continue;
    }

    const link = httpUrl(entry.link);
    const w = num(entry.width);
    const h = num(entry.height);

    if (!link || !w || !h) {
      continue;
    }

    if (ratio && Math.abs(w / h - ratio) / ratio > 0.06) {
      continue;
    }

    if (w * h > area) {
      area = w * h;
      best = link;
    }
  }

  return best ?? httpUrl(node.image);
}

function bestVideo(node: Json) {
  const video = isObj(node.video) ? node.video : undefined;
  const direct = httpUrl(video?.link) ?? httpUrl(node.video);

  if (direct) {
    return direct;
  }

  for (const entry of list(node.videos)) {
    const link = isObj(entry) ? httpUrl(entry.link) : undefined;

    if (link) {
      return link;
    }
  }

  return undefined;
}

function mediaOf(node: Json): IgMedia | null {
  const kind = (str(node.type) ?? "").toLowerCase();
  const video = bestVideo(node);
  const image = bestImage(node);

  if (video && (kind === "" || kind.includes("video") || !image)) {
    return { type: "video", url: video, thumb: image };
  }

  if (image) {
    return { type: "photo", url: image, thumb: image };
  }

  return video ? { type: "video", url: video } : null;
}

export function mediaList(body: unknown): IgMedia[] {
  const root = rootOf(body);

  if (!root) {
    return [];
  }

  const children = [...list(root.carousel), ...list(root.items)].filter(isObj);
  const nodes = children.length > 0 ? children : [root];

  return nodes
    .map(mediaOf)
    .filter((item): item is IgMedia => item !== null);
}
