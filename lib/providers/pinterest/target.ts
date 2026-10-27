import { AppError } from "../../errors";

export type PinTarget = {
  id?: string;
  urls: string[];
};

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

function pinId(text: string) {
  const match = text.match(/\/pin\/(?:[^/?#]*--)?(\d{6,25})/);

  return match ? match[1] : undefined;
}

function urlsFor(id: string) {
  return [
    `https://id.pinterest.com/pin/${id}/`,
    `https://www.pinterest.com/pin/${id}/`,
  ];
}

async function resolveShort(url: string) {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,*/*",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(8_000),
    });

    const fromUrl = pinId(decodeURIComponent(response.url));

    if (fromUrl) {
      await response.body?.cancel().catch(() => undefined);

      return fromUrl;
    }

    const html = (await response.text()).slice(0, 400_000);

    return pinId(html);
  } catch {
    return undefined;
  }
}

export async function resolvePin(inputUrl: string): Promise<PinTarget> {
  let parsed: URL;

  try {
    parsed = new URL(inputUrl.trim());
  } catch {
    throw new AppError("Tautan Pinterest tidak valid.", 400);
  }

  const host = parsed.hostname.toLowerCase();

  if (host === "pin.it" || host === "www.pin.it") {
    const code = parsed.pathname.split("/").filter(Boolean)[0] ?? "";

    if (!/^[\w-]{4,40}$/.test(code)) {
      throw new AppError("Tautan Pinterest tidak valid.", 400);
    }

    const short = `https://pin.it/${code}`;
    const id = await resolveShort(short);

    return id ? { id, urls: urlsFor(id) } : { urls: [short] };
  }

  if (!/(^|\.)pinterest\.[a-z.]{2,}$/.test(host)) {
    throw new AppError("Tautan Pinterest tidak valid.", 400);
  }

  const id = pinId(parsed.pathname);

  if (!id) {
    throw new AppError(
      "Tautan Pinterest tidak valid. Gunakan tautan pin, bukan profil atau board.",
      400
    );
  }

  return { id, urls: urlsFor(id) };
}
