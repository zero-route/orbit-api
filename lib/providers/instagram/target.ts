import { AppError } from "../../errors";

export type TargetKind = "post" | "reel" | "story" | "share";

export type Target = {
  url: string;
  kind: TargetKind;
  shortcode?: string;
  username?: string;
  id?: string;
};

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

const CODE = /^[A-Za-z0-9_-]+$/;
const POST_TYPES = ["p", "reel", "reels", "tv"];

export function parseTarget(raw: string): Target | null {
  let parsed: URL;

  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase().replace(/^(www|m)\./, "");

  if (host !== "instagram.com" && host !== "instagr.am") {
    return null;
  }

  const parts = parsed.pathname.split("/").filter(Boolean);

  if (parts[0] === "share" && parts.length >= 2) {
    const rest = parts.slice(1);

    if (!rest.every((part) => CODE.test(part))) {
      return null;
    }

    return {
      url: `https://www.instagram.com/share/${rest.join("/")}/`,
      kind: "share",
    };
  }

  if (parts[0] === "stories" && /^\d{6,25}$/.test(parts[2] ?? "")) {
    const user = parts[1] ?? "";

    return {
      url: `https://www.instagram.com/stories/${user}/${parts[2]}/`,
      kind: "story",
      username: /^[\w.]{1,40}$/.test(user) ? user : undefined,
      id: parts[2],
    };
  }

  let typeIndex = -1;

  if (POST_TYPES.includes(parts[0] ?? "")) {
    typeIndex = 0;
  } else if (POST_TYPES.includes(parts[1] ?? "")) {
    typeIndex = 1;
  }

  if (typeIndex < 0) {
    return null;
  }

  const type = parts[typeIndex];
  const code = parts[typeIndex + 1];

  if (!code || !CODE.test(code)) {
    return null;
  }

  const path = type === "reels" || type === "tv" ? "reel" : type;

  return {
    url: `https://www.instagram.com/${path}/${code}/`,
    kind: type === "p" ? "post" : "reel",
    shortcode: code,
    username: typeIndex === 1 ? parts[0] : undefined,
  };
}

async function followShare(url: string): Promise<Target | null> {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,*/*" },
      signal: AbortSignal.timeout(8_000),
    });

    await response.body?.cancel().catch(() => undefined);

    const resolved = parseTarget(response.url);

    return resolved && resolved.kind !== "share" ? resolved : null;
  } catch {
    return null;
  }
}

export async function resolveTarget(inputUrl: string): Promise<Target> {
  const target = parseTarget(inputUrl);

  if (!target) {
    throw new AppError(
      "Tautan Instagram tidak valid. Gunakan tautan post, Reel, atau story.",
      400
    );
  }

  if (target.kind !== "share") {
    return target;
  }

  const resolved = await followShare(target.url);

  if (!resolved) {
    throw new AppError(
      "Tautan share Instagram tidak bisa dibuka. Salin tautan post langsung.",
      404
    );
  }

  return resolved;
}

export function candidatesOf(target: Target): string[] {
  const list: string[] = [];

  if (target.kind === "story" && target.id) {
    list.push(target.id);
  }

  list.push(target.url);

  if (target.shortcode) {
    list.push(target.shortcode);
  }

  return [...new Set(list)];
}
