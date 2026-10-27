import { AppError } from "../../errors";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

const ID = /^[A-Za-z0-9]{22}$/;

function unsupported(type: string) {
  if (type === "album") {
    return new AppError(
      "Tautan album belum didukung. Tempel tautan satu lagu (track).",
      400
    );
  }

  if (type === "playlist") {
    return new AppError(
      "Tautan playlist belum didukung. Tempel tautan satu lagu (track).",
      400
    );
  }

  return new AppError(
    "Tautan Spotify tidak valid. Gunakan tautan lagu, contoh: open.spotify.com/track/...",
    400
  );
}

async function followShort(url: string) {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      cache: "no-store",
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(8_000),
    });

    const fromUrl = response.url.match(/track\/([A-Za-z0-9]{22})/);

    if (fromUrl) {
      await response.body?.cancel().catch(() => undefined);

      return fromUrl[1];
    }

    const html = await response.text();
    const fromHtml = html.match(
      /open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\/([A-Za-z0-9]{22})/
    );

    return fromHtml ? fromHtml[1] : undefined;
  } catch {
    return undefined;
  }
}

export async function resolveTrackId(inputUrl: string) {
  let parsed: URL;

  try {
    parsed = new URL(inputUrl.trim());
  } catch {
    throw unsupported("invalid");
  }

  const host = parsed.hostname.toLowerCase();

  if (host === "spotify.link" || host === "spotify.app.link") {
    const id = await followShort(parsed.toString());

    if (!id) {
      throw new AppError(
        "Tautan pendek tidak bisa dibaca. Buka tautannya di Spotify lalu salin tautan lagu lengkap.",
        400
      );
    }

    return id;
  }

  if (host !== "open.spotify.com") {
    throw unsupported("invalid");
  }

  const parts = parsed.pathname
    .split("/")
    .filter(Boolean)
    .filter((part) => !/^intl-[a-z-]+$/i.test(part) && part !== "embed");

  const type = (parts[0] ?? "").toLowerCase();
  const id = parts[1] ?? "";

  if (!ID.test(id)) {
    throw unsupported("invalid");
  }

  if (type !== "track") {
    throw unsupported(type);
  }

  return id;
}
