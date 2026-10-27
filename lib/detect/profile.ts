import type { PlatformId } from "../providers/types";

const BUILDERS: Partial<Record<PlatformId, (username: string) => string>> = {
  tiktok: (name) => `https://www.tiktok.com/@${name}`,
  instagram: (name) => `https://www.instagram.com/${name}/`,
  x: (name) => `https://x.com/${name}`,
  threads: (name) => `https://www.threads.com/@${name}`,
  pinterest: (name) => `https://www.pinterest.com/${name}/`,
};

export function profileUrlFor(platform: PlatformId, username?: string) {
  if (!username) {
    return undefined;
  }

  const clean = username.replace(/^@/, "").trim();

  if (!/^[\w.-]+$/.test(clean)) {
    return undefined;
  }

  return BUILDERS[platform]?.(encodeURIComponent(clean));
}
