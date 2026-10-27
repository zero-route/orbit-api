import { AppError } from "../../errors";
import { deadlineIn, rapidJson } from "../../rapidapi/client";
import { hostConfig } from "../../rapidapi/hosts";
import { expiryFromNow, mp3Path, proxyPath } from "../../sign";
import type { DetectedInput, MediaResult, Provider } from "../types";
import {
  parseAudio,
  parseTrack,
  type SpotifyAudio,
  type SpotifyTrack,
} from "./normalize";
import { resolveTrackId } from "./target";

const BUDGET_MS = 40_000;

type Settled<T> = { value: T } | { error: AppError };

async function settle<T>(task: Promise<T>): Promise<Settled<T>> {
  try {
    return { value: await task };
  } catch (error) {
    return {
      error:
        error instanceof AppError
          ? error
          : new AppError("Gagal mengambil data lagu.", 502),
    };
  }
}

async function fetchMeta(id: string, deadlineAt: number): Promise<SpotifyTrack> {
  const { host, path } = hostConfig("spotify");

  const payload = await rapidJson({
    host,
    path,
    query: { ids: id },
    deadlineAt,
    timeoutMs: 14_000,
    retries: 3,
  });

  const track = parseTrack(payload);

  if (!track) {
    throw new AppError(
      "Info lagu tidak ditemukan. Pastikan tautan lagu Spotify benar.",
      404
    );
  }

  return track;
}

async function fetchAudio(id: string, deadlineAt: number): Promise<SpotifyAudio> {
  const { host, path } = hostConfig("spotify", "audio");

  const payload = await rapidJson({
    host,
    path,
    query: {
      q: id,
      onlyLinks: "true",
      bypassSpotify: "false",
      downloadFullVideo: "false",
      extraUrls: "false",
    },
    deadlineAt,
    timeoutMs: 24_000,
    retries: 2,
  });

  const audio = parseAudio(payload);

  if (!audio) {
    throw new AppError(
      "Audio lagu belum tersedia saat ini. Coba lagi beberapa saat.",
      502
    );
  }

  return audio;
}

function albumLine(track: SpotifyTrack) {
  const year = track.releaseDate?.slice(0, 4);

  return [track.album, year].filter(Boolean).join(" · ") || undefined;
}

export const spotifyProvider: Provider = async (
  input: DetectedInput
): Promise<MediaResult> => {
  const startedAt = Date.now();
  const id = await resolveTrackId(input.url);
  const deadlineAt = deadlineIn(BUDGET_MS);

  const [meta, audio] = await Promise.all([
    settle(fetchMeta(id, deadlineAt)),
    settle(fetchAudio(id, deadlineAt)),
  ]);

  console.info(
    `[spotify] ${Date.now() - startedAt}ms meta=${"value" in meta} audio=${"value" in audio}`
  );

  if ("error" in meta) {
    throw meta.error;
  }

  if ("error" in audio) {
    throw audio.error;
  }

  const track = meta.value;
  const expires = expiryFromNow();
  const wrap = (url: string) => proxyPath(url, expires);

  const payload = JSON.stringify({
    a: audio.value.url,
    c: track.cover ?? null,
    t: track.title,
    r: track.artist ?? null,
    l: track.album ?? null,
    y: track.releaseDate ? track.releaseDate.slice(0, 4) : null,
  });

  return {
    platform: "spotify",
    kind: "audio",
    sourceUrl: input.url,
    postId: track.id ?? id,
    caption: albumLine(track),
    author: track.artist
      ? { name: track.artist, profileUrl: track.artistUrl }
      : undefined,
    durationSeconds: track.durationMs
      ? Math.round(track.durationMs / 1000)
      : undefined,
    coverUrl: track.cover ? wrap(track.cover) : undefined,
    videos: [],
    photos: [],
    audio: {
      url: mp3Path(payload, expires),
      previewUrl: wrap(audio.value.url),
      title: track.title,
      artist: track.artist,
      ext: "mp3",
    },
    expiresAt: expires * 1000,
  };
};
