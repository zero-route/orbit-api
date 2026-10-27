export type Json = Record<string, unknown>;

export function isObj(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function str(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found: string | undefined = str(item);

      if (found) {
        return found;
      }
    }
  }

  return undefined;
}

export function num(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

const URL_KEYS = [
  "url",
  "urlList",
  "url_list",
  "uri_list",
  "src",
  "imageURL",
  "imageUrl",
  "image_url",
  "display_image",
  "download_url",
  "downloadUrl",
  "play_addr",
  "playAddr",
  "play_url",
  "playUrl",
  "download_addr",
  "downloadAddr",
];

const HTTP = /^https?:\/\//i;

export function collectUrls(value: unknown, depth = 0): string[] {
  if (depth > 7) {
    return [];
  }

  if (typeof value === "string") {
    const url = value.trim();

    return HTTP.test(url) ? [url] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectUrls(item, depth + 1));
  }

  if (isObj(value)) {
    const direct = Object.values(value).flatMap((item) =>
      typeof item === "string" && HTTP.test(item.trim()) ? [item.trim()] : []
    );

    if (direct.length > 0) {
      return direct;
    }

    for (const key of URL_KEYS) {
      if (key in value) {
        const found = collectUrls(value[key], depth + 1);

        if (found.length > 0) {
          return found;
        }
      }
    }
  }

  return [];
}

export function firstUrl(value: unknown): string | undefined {
  return collectUrls(value)[0];
}

function imageRank(url: string) {
  if (/\.jpe?g(\?|$)/i.test(url)) return 0;
  if (/\.webp(\?|$)/i.test(url)) return 1;
  if (/\.png(\?|$)/i.test(url)) return 2;
  if (/\.(heic|heif|avif)(\?|$)/i.test(url)) return 4;

  return 3;
}

export function bestImageUrl(value: unknown): string | undefined {
  const urls = collectUrls(value);

  if (urls.length === 0) {
    return undefined;
  }

  return [...urls].sort((a, b) => imageRank(a) - imageRank(b))[0];
}

export function pickUrl(sources: Json[], keys: string[], image = false) {
  for (const source of sources) {
    for (const key of keys) {
      if (key in source) {
        const found = image ? bestImageUrl(source[key]) : firstUrl(source[key]);

        if (found) {
          return found;
        }
      }
    }
  }

  return undefined;
}

export function pickStr(sources: Json[], keys: string[]) {
  for (const source of sources) {
    for (const key of keys) {
      const found = str(source[key]);

      if (found) {
        return found;
      }
    }
  }

  return undefined;
}

export function pickNum(sources: Json[], keys: string[]) {
  for (const source of sources) {
    for (const key of keys) {
      const found = num(source[key]);

      if (found !== undefined) {
        return found;
      }
    }
  }

  return undefined;
}

export function pickObj(sources: Json[], keys: string[]) {
  for (const source of sources) {
    for (const key of keys) {
      if (isObj(source[key])) {
        return source[key] as Json;
      }
    }
  }

  return undefined;
}

export function unwrap(payload: unknown) {
  let current: unknown = payload;

  for (let index = 0; index < 4; index += 1) {
    if (!isObj(current)) {
      break;
    }

    const record: Json = current;

    const next = ["data", "result", "response", "item", "aweme_detail"]
      .map((key) => record[key])
      .find((value) => isObj(value));

    if (!next) {
      break;
    }

    current = next;
  }

  return isObj(current) ? current : undefined;
}
