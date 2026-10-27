import { AppError } from "../../errors";
import {
  bestImageUrl,
  isObj,
  pickNum,
  pickObj,
  pickStr,
  pickUrl,
  unwrap,
  type Json,
} from "../pick";

export type TikTokRaw = {
  id?: string;
  description: string;
  username?: string;
  nickname?: string;
  avatar?: string;
  cover?: string;
  durationSeconds?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  views?: number;
  videoUrl?: string;
  audioUrl?: string;
  audioTitle?: string;
  audioArtist?: string;
  photos: string[];
};

const PHOTO_KEYS = [
  "items",
  "images",
  "image_post",
  "imagePost",
  "photos",
  "slides",
  "image_urls",
  "imageUrls",
  "pictures",
  "image_list",
  "imageList",
  "download_urls",
];

const VIDEO_KEYS = [
  "nowm",
  "no_watermark",
  "noWatermark",
  "hdplay",
  "play",
  "play_url",
  "playUrl",
  "playAddr",
  "play_addr",
  "video_url",
  "videoUrl",
  "download",
  "downloadUrl",
  "download_url",
  "video",
  "url",
];

const AUDIO_KEYS = [
  "music",
  "music_url",
  "musicUrl",
  "music_info",
  "musicInfo",
  "audio",
  "audio_url",
  "audioUrl",
  "audio_download_url",
  "audioDownloadUrl",
  "audio_link",
  "music_download_url",
  "music_link",
  "sound",
  "sound_url",
  "bgm_url",
];

const AVATAR_KEYS = [
  "avatar_thumb",
  "avatarThumb",
  "avatar",
  "avatar_url",
  "avatarUrl",
  "avatar_medium",
  "avatarMedium",
  "avatar_larger",
  "avatarLarger",
  "avatar_168x168",
  "avatar_300x300",
  "avatar_64",
  "avatar_100",
  "avatar_uri",
  "avatarUri",
  "profile_picture",
  "profilePicture",
  "profile_pic",
  "profilePic",
  "user_avatar",
  "userAvatar",
];

const COVER_KEYS = [
  "cover",
  "origin_cover",
  "originCover",
  "dynamic_cover",
  "dynamicCover",
  "thumbnail",
  "thumbnail_url",
  "thumbnailUrl",
  "thumb",
  "poster",
];

function extractPhotos(root: Json, extra: Json[]) {
  for (const source of [root, ...extra]) {
    for (const key of PHOTO_KEYS) {
      let list: unknown = source[key];

      if (isObj(list)) {
        list = list.images ?? list.photos ?? list.list;
      }

      if (Array.isArray(list)) {
        const urls = list
          .map((item) => bestImageUrl(item))
          .filter((item): item is string => Boolean(item));

        if (urls.length > 0) {
          return Array.from(new Set(urls));
        }
      }
    }
  }

  return [];
}

function usernameFromUrl(value: string) {
  try {
    const match = new URL(value).pathname.match(/^\/@([^/]+)/);

    return match?.[1] ? decodeURIComponent(match[1]) : undefined;
  } catch {
    return undefined;
  }
}

function toSeconds(value?: number) {
  if (value === undefined || value <= 0) {
    return undefined;
  }

  return value > 7200 ? Math.round(value / 1000) : Math.round(value);
}

export function isBackupPayload(payload: unknown) {
  const root = unwrap(payload);

  if (!root) {
    return false;
  }

  return root.api_backup === true || /backup/i.test(String(root.method_used ?? ""));
}

export function normalizeTikTok(payload: unknown, inputUrl: string): TikTokRaw {
  const root = unwrap(payload);

  if (!root) {
    throw new AppError("Format respons server data tidak dikenali.", 502);
  }

  const videoObj = pickObj([root], ["video", "video_info", "videoInfo"]);
  const authorRaw = root.author ?? root.user ?? root.authorInfo ?? root.author_info;
  const authorObj = isObj(authorRaw) ? authorRaw : undefined;
  const statsObj = pickObj(
    [root],
    ["stats", "statistics", "statistic", "stat", "statsV2"]
  );

  const mediaSources: Json[] = videoObj ? [videoObj, root] : [root];
  const photos = extractPhotos(root, videoObj ? [videoObj] : []);
  const videoUrl = pickUrl(mediaSources, VIDEO_KEYS);

  if (photos.length === 0 && !videoUrl) {
    throw new AppError(
      "Media tidak ditemukan pada konten ini.",
      502,
      JSON.stringify(payload).slice(0, 600)
    );
  }

  const audioUrl = pickUrl(mediaSources, AUDIO_KEYS);
  const musicObj = pickObj(mediaSources, ["music_info", "musicInfo", "music"]);
  const authorSources = authorObj ? [authorObj, root] : [root];
  const statSources = statsObj ? [statsObj, root] : [root];

  const username =
    pickStr(authorSources, [
      "unique_id",
      "uniqueId",
      "username",
      "user_name",
      "handle",
      "author",
    ]) ??
    (typeof authorRaw === "string" ? authorRaw.replace(/^@/, "") : undefined) ??
    usernameFromUrl(inputUrl);

  const nickname = pickStr(authorSources, [
    "nickname",
    "nick_name",
    "name",
    "display_name",
    "author_name",
    "authorName",
  ]);

  return {
    id: pickStr(
      [root],
      ["id", "aweme_id", "awemeId", "video_id", "videoId", "videoid"]
    ),
    description:
      pickStr([root], ["title", "desc", "description", "caption", "text"]) ?? "",
    username,
    nickname,
    avatar: pickUrl(authorObj ? [authorObj, root] : [root], AVATAR_KEYS, true),
    cover: pickUrl(mediaSources, COVER_KEYS, true) ?? photos[0],
    durationSeconds: toSeconds(
      pickNum([...mediaSources], ["duration", "video_duration", "videoDuration"])
    ),
    likes: pickNum(statSources, [
      "digg_count",
      "diggCount",
      "like_count",
      "likeCount",
      "likes",
    ]),
    comments: pickNum(statSources, ["comment_count", "commentCount", "comments"]),
    shares: pickNum(statSources, [
      "share_count",
      "shareCount",
      "repost_count",
      "repostCount",
      "shares",
    ]),
    views: pickNum(statSources, [
      "play_count",
      "playCount",
      "view_count",
      "viewCount",
      "views",
    ]),
    videoUrl: photos.length > 0 ? undefined : videoUrl,
    audioUrl,
    audioTitle: musicObj ? pickStr([musicObj], ["title", "name"]) : undefined,
    audioArtist: musicObj
      ? pickStr([musicObj], ["author", "artist", "owner_nickname"])
      : undefined,
    photos,
  };
}
