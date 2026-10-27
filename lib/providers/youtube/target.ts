import { AppError } from "../../errors";

const ID = /^[A-Za-z0-9_-]{11}$/;

export function parseVideoId(raw: string) {
  let parsed: URL;

  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new AppError("Tautan YouTube tidak valid.", 400);
  }

  const host = parsed.hostname.toLowerCase().replace(/^(www|m|music)\./, "");

  let id: string | null = null;

  if (host === "youtu.be") {
    id = parsed.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const parts = parsed.pathname.split("/").filter(Boolean);

    if (parts[0] === "watch") {
      id = parsed.searchParams.get("v");
    } else if (["shorts", "live", "embed", "v"].includes(parts[0] ?? "")) {
      id = parts[1] ?? null;
    }
  }

  if (!id || !ID.test(id)) {
    throw new AppError(
      "Tautan tidak valid. Gunakan tautan video YouTube, Shorts, atau youtu.be.",
      400
    );
  }

  return id;
}

export function isVideoId(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}

export function watchUrl(id: string) {
  return `https://www.youtube.com/watch?v=${id}`;
}
