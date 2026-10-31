import type { PlatformId } from "../providers/types";

export type HostConfig = {
  host: string;
  path: string;
};

export type HostRole = "main" | "details" | "audio" | "download";

const DEFAULTS: Record<string, HostConfig> = {
  "tiktok:main": {
    host: "instagram-tiktok-youtube-downloader.p.rapidapi.com",
    path: "/fetch",
  },
  "tiktok:details": {
    host: "best-tiktok-scraper-free-1000-calls.p.rapidapi.com",
    path: "/videos/details",
  },
  "spotify:main": {
    host: "spotify81.p.rapidapi.com",
    path: "/tracks",
  },
  "spotify:audio": {
    host: "spotify81.p.rapidapi.com",
    path: "/download_track",
  },
  "threads:main": {
    host: "best-threads-scraper-free-1000-calls.p.rapidapi.com",
    path: "/posts/media",
  },
  "threads:details": {
    host: "best-threads-scraper-free-1000-calls.p.rapidapi.com",
    path: "/posts/details",
  },
  "youtube:main": {
    host: "best-youtube-scraper-free-1000-calls.p.rapidapi.com",
    path: "/videos/details",
  },
  "youtube:download": {
    host: "all-in-one-downloader-api.p.rapidapi.com",
    path: "/youtube/download",
  },
  "x:main": {
    host: "best-twitter-scraper-free-1000-calls.p.rapidapi.com",
    path: "/tweets/details",
  },
  "pinterest:main": {
    host: "instagram-tiktok-youtube-downloader.p.rapidapi.com",
    path: "/fetch",
  },
  "pinterest:details": {
    host: "pinterest-global-scraper-api.p.rapidapi.com",
    path: "/v3/pins",
  },
  "instagram:main": {
    host: "best-instagram-scraper-free-1000-calls.p.rapidapi.com",
    path: "/posts/media",
  },
  "instagram:details": {
    host: "best-instagram-scraper-free-1000-calls.p.rapidapi.com",
    path: "/posts/details",
  },
};

function clean(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}

function normalizePath(value: string) {
  return value.startsWith("/") ? value : `/${value}`;
}

export function hostConfig(
  platform: PlatformId,
  role: HostRole = "main"
): HostConfig {
  const base = DEFAULTS[`${platform}:${role}`];
  const key = platform.toUpperCase();
  const prefix =
    role === "main" ? `RAPIDAPI_${key}` : `RAPIDAPI_${key}_${role.toUpperCase()}`;

  let legacyHost: string | undefined;
  let legacyPath: string | undefined;

  if (platform === "tiktok" && role === "main") {
    legacyHost = clean(process.env.RAPIDAPI_DOWNLOAD_HOST);
    legacyPath = clean(process.env.RAPIDAPI_PATH);
  }

  if (platform === "tiktok" && role === "details") {
    legacyHost = clean(process.env.RAPIDAPI_DETAILS_HOST);
  }

  const host = clean(process.env[`${prefix}_HOST`]) ?? legacyHost ?? base?.host;
  const path = clean(process.env[`${prefix}_PATH`]) ?? legacyPath ?? base?.path;

  if (!host || !path) {
    throw new Error(`Host RapidAPI untuk ${platform} (${role}) belum diatur.`);
  }

  return { host, path: normalizePath(path) };
}
