import { AppError } from "../../errors";

export type XTarget = {
  id: string;
  username?: string;
};

export function parseXTarget(raw: string): XTarget {
  let parsed: URL;

  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new AppError("Tautan X tidak valid.", 400);
  }

  const host = parsed.hostname.toLowerCase().replace(/^(www|mobile|m)\./, "");

  if (host !== "x.com" && host !== "twitter.com") {
    throw new AppError("Tautan X tidak valid.", 400);
  }

  const parts = parsed.pathname.split("/").filter(Boolean);
  const index = parts.findIndex(
    (part) => part === "status" || part === "statuses"
  );
  const id = index >= 0 ? (parts[index + 1] ?? "") : "";

  if (!/^\d{5,25}$/.test(id)) {
    throw new AppError(
      "Tautan X tidak valid. Gunakan tautan tweet, bukan profil.",
      400
    );
  }

  const before = parts[index - 1] ?? "";
  const username =
    index >= 1 && !["i", "web"].includes(before) && /^\w{1,30}$/.test(before)
      ? before
      : undefined;

  return { id, username };
}
