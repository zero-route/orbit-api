import type { PlatformId } from "../providers/types";

export type PlatformInfo = {
  id: PlatformId;
  name: string;
  accent: string;
  accentText: string;
  hosts: RegExp;
  shortHosts?: RegExp;
};

export const PLATFORMS: PlatformInfo[] = [
  {
    id: "tiktok",
    name: "TikTok",
    accent: "#25F4EE",
    accentText: "#06201F",
    hosts: /(^|\.)tiktok\.com$/i,
    shortHosts: /^(vt|vm)\.tiktok\.com$/i,
  },
  {
    id: "instagram",
    name: "Instagram",
    accent: "#E1306C",
    accentText: "#FFFFFF",
    hosts: /(^|\.)(instagram\.com|instagr\.am)$/i,
  },
  {
    id: "youtube",
    name: "YouTube",
    accent: "#FF3B30",
    accentText: "#FFFFFF",
    hosts: /(^|\.)(youtube\.com|youtu\.be)$/i,
    shortHosts: /^youtu\.be$/i,
  },
  {
    id: "x",
    name: "X",
    accent: "#E8EAF0",
    accentText: "#0B0D12",
    hosts: /(^|\.)(x\.com|twitter\.com)$/i,
  },
  {
    id: "threads",
    name: "Threads",
    accent: "#C7CBD6",
    accentText: "#0B0D12",
    hosts: /(^|\.)threads\.(net|com)$/i,
  },
  {
    id: "pinterest",
    name: "Pinterest",
    accent: "#E60023",
    accentText: "#FFFFFF",
    hosts: /(^|\.)(pinterest\.[a-z.]+|pin\.it)$/i,
    shortHosts: /^pin\.it$/i,
  },
  {
    id: "spotify",
    name: "Spotify",
    accent: "#1DB954",
    accentText: "#04140A",
    hosts: /(^|\.)(spotify\.com|spotify\.link)$/i,
    shortHosts: /^spotify\.link$/i,
  },
];

export function getPlatform(id: PlatformId) {
  return PLATFORMS.find((item) => item.id === id) as PlatformInfo;
}
