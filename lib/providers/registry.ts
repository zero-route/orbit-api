import { AppError } from "../errors";
import { getPlatform } from "../detect/platforms";
import type { DetailsProvider, PlatformId, Provider } from "./types";
import { instagramDetails, instagramProvider } from "./instagram";
import { pinterestDetails, pinterestProvider } from "./pinterest";
import { spotifyProvider } from "./spotify";
import { youtubeProvider } from "./youtube";
import { threadsDetails, threadsProvider } from "./threads";
import { tiktokDetails, tiktokProvider } from "./tiktok";
import { xProvider } from "./x";

const REAL: Partial<Record<PlatformId, Provider>> = {
  tiktok: tiktokProvider,
  instagram: instagramProvider,
  pinterest: pinterestProvider,
  x: xProvider,
  youtube: youtubeProvider,
  threads: threadsProvider,
  spotify: spotifyProvider,
};

const DETAILS: Partial<Record<PlatformId, DetailsProvider>> = {
  tiktok: tiktokDetails,
  instagram: instagramDetails,
  pinterest: pinterestDetails,
  threads: threadsDetails,
};

export function getProvider(platform: PlatformId): Provider {
  const real = REAL[platform];

  if (real) {
    return real;
  }

  return async () => {
    throw new AppError(
      `${getPlatform(platform).name} belum tersedia, segera hadir.`,
      501
    );
  };
}

export function getDetailsProvider(platform: PlatformId): DetailsProvider | null {
  return DETAILS[platform] ?? null;
}
