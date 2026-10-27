import { isObj, num, str, type Json } from "../pick";

export type PinMedia = {
  id?: string;
  downloadUrl: string;
  isVideo: boolean;
  isHls: boolean;
  thumbnail?: string;
  width?: number;
  height?: number;
};

const HLS = /\.m3u8(\?|$)/i;
const VIDEO_FILE = /\.(mp4|m3u8|mov)(\?|$)/i;

export function httpUrl(value: unknown) {
  const text = str(value);

  return text && /^https?:\/\//i.test(text) ? text : undefined;
}

export function displayImage(url: string) {
  return url.replace(/(\/\/i\.pinimg\.com)\/originals\//, "$1/736x/");
}

export function imageExt(url: string) {
  if (/\.png(\?|$)/i.test(url)) return "png";
  if (/\.webp(\?|$)/i.test(url)) return "webp";
  if (/\.gif(\?|$)/i.test(url)) return "gif";

  return "jpg";
}

export function parseMedia(payload: unknown): PinMedia | null {
  if (!isObj(payload) || payload.ok === false) {
    return null;
  }

  const root: Json = httpUrl(payload.download_url)
    ? payload
    : isObj(payload.data)
      ? payload.data
      : payload;

  const downloadUrl = httpUrl(root.download_url);

  if (!downloadUrl) {
    return null;
  }

  const thumbnail = httpUrl(root.thumbnail_url);

  return {
    id: str(root.id),
    downloadUrl,
    isVideo:
      (str(root.type) ?? "").toLowerCase() === "video" ||
      VIDEO_FILE.test(downloadUrl),
    isHls: HLS.test(downloadUrl),
    thumbnail: thumbnail && !VIDEO_FILE.test(thumbnail) ? thumbnail : undefined,
    width: num(root.width),
    height: num(root.height),
  };
}
