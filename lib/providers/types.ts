export type PlatformId =
  | "tiktok"
  | "instagram"
  | "youtube"
  | "x"
  | "threads"
  | "pinterest"
  | "spotify";

export type MediaKind = "video" | "photo" | "audio";

export type Quality = {
  id: string;
  label: string;
  ext: string;
  url: string;
  height?: number;
  sizeBytes?: number;
};

export type Photo = {
  id: string;
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  ext: string;
  isVideo?: boolean;
  previewUrl?: string;
};

export type AudioTrack = {
  url: string;
  previewUrl?: string;
  title?: string;
  artist?: string;
  ext: string;
};

export type Author = {
  name?: string;
  username?: string;
  avatarUrl?: string;
  followers?: number;
  profileUrl?: string;
};

export type Stats = {
  likes?: number;
  comments?: number;
  shares?: number;
  views?: number;
  saves?: number;
  reposts?: number;
};

export type MediaResult = {
  platform: PlatformId;
  kind: MediaKind;
  sourceUrl: string;
  postId?: string;
  caption?: string;
  author?: Author;
  stats?: Stats;
  durationSeconds?: number;
  coverUrl?: string;
  videos: Quality[];
  photos: Photo[];
  audio?: AudioTrack;
  expiresAt?: number;
  detailsPending?: boolean;
  slideshowUrl?: string;
  embedUrl?: string;
};

export type MediaPatch = {
  caption?: string;
  coverUrl?: string;
  author?: Author;
  stats?: Stats;
};

export type DetectedInput = {
  platform: PlatformId;
  url: string;
  shortLink: boolean;
};

export type Provider = (input: DetectedInput) => Promise<MediaResult>;

export type DetailsProvider = (
  input: DetectedInput
) => Promise<MediaPatch | null>;

export type ResolveResponse =
  | { ok: true; data: MediaResult }
  | { ok: false; error: string; detail?: string };

export type DetailsResponse =
  | { ok: true; data: MediaPatch }
  | { ok: false; error: string };
