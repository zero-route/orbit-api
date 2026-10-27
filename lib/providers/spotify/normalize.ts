import { isObj, num, str, type Json } from "../pick";

export type SpotifyTrack = {
  id?: string;
  title: string;
  artist?: string;
  artistUrl?: string;
  album?: string;
  releaseDate?: string;
  durationMs?: number;
  cover?: string;
};

export type SpotifyAudio = {
  url: string;
};

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function bestCover(album: Json | undefined) {
  let best: string | undefined;
  let width = -1;

  for (const entry of list(album?.images)) {
    if (!isObj(entry)) {
      continue;
    }

    const url = str(entry.url);
    const size = num(entry.width) ?? 0;

    if (url && size > width) {
      width = size;
      best = url;
    }
  }

  return best;
}

export function parseTrack(payload: unknown): SpotifyTrack | null {
  if (!isObj(payload)) {
    return null;
  }

  const track = list(payload.tracks).find(isObj);

  if (!track) {
    return null;
  }

  const title = str(track.name);

  if (!title) {
    return null;
  }

  const album = isObj(track.album) ? track.album : undefined;
  const artists = list(track.artists).filter(isObj);
  const names = artists
    .map((entry) => str(entry.name))
    .filter((name): name is string => Boolean(name));

  const first = artists[0];
  const firstId = str(first?.id);
  const firstUrl = isObj(first?.external_urls)
    ? str(first.external_urls.spotify)
    : undefined;

  return {
    id: str(track.id),
    title,
    artist: names.length > 0 ? names.join(", ") : undefined,
    artistUrl:
      firstUrl ?? (firstId ? `https://open.spotify.com/artist/${firstId}` : undefined),
    album: str(album?.name),
    releaseDate: str(album?.release_date),
    durationMs: num(track.duration_ms),
    cover: bestCover(album),
  };
}

export function parseAudio(payload: unknown): SpotifyAudio | null {
  if (!isObj(payload) || payload.status === false) {
    return null;
  }

  const url = str(payload.url);

  return url && /^https?:\/\//i.test(url) ? { url } : null;
}
