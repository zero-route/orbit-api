import type { DetectedInput } from "../providers/types";
import { PLATFORMS } from "./platforms";

const URL_PATTERN = /(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?/i;

function extractUrl(raw: string) {
  const text = raw.trim();

  if (!text) {
    return null;
  }

  const explicit = text.match(/https?:\/\/[^\s]+/i);

  if (explicit) {
    return explicit[0].replace(/[)\]}>.,;!?'"]+$/, "");
  }

  const bare = text.match(URL_PATTERN);

  if (!bare) {
    return null;
  }

  return `https://${bare[0].replace(/[)\]}>.,;!?'"]+$/, "")}`;
}

export function detectInput(raw: string): DetectedInput | null {
  const extracted = extractUrl(raw);

  if (!extracted) {
    return null;
  }

  let parsed: URL;

  try {
    parsed = new URL(extracted);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return null;
  }

  const host = parsed.hostname.toLowerCase();

  for (const platform of PLATFORMS) {
    if (platform.hosts.test(host)) {
      return {
        platform: platform.id,
        url: parsed.toString(),
        shortLink: Boolean(platform.shortHosts?.test(host)),
      };
    }
  }

  return null;
}
