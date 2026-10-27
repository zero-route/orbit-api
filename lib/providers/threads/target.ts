import { AppError } from "../../errors";

export type ThreadsTarget = {
  code: string;
  username?: string;
  share: boolean;
  raw?: string;
};

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

const SHARE_AGENTS = [
  USER_AGENT,
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
];

const SHARE_HOSTS = ["www.threads.com", "www.threads.net"];
const CODE = /^[\w-]{5,40}$/;

export function parseThreadsTarget(raw: string): ThreadsTarget | null {
  let parsed: URL;

  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase().replace(/^(www|m)\./, "");

  if (host !== "threads.com" && host !== "threads.net") {
    return null;
  }

  const parts = parsed.pathname.split("/").filter(Boolean);

  if (parts[0] === "share" && CODE.test(parts[1] ?? "")) {
    return { code: parts[1], share: true };
  }

  const postIndex = parts.indexOf("post");

  if (postIndex >= 1 && CODE.test(parts[postIndex + 1] ?? "")) {
    const user = parts[postIndex - 1].replace(/^@/, "");

    return {
      code: parts[postIndex + 1],
      username: /^[\w.]{1,40}$/.test(user) ? user : undefined,
      share: false,
      raw: `https://www.threads.com${parsed.pathname}${parsed.search}`,
    };
  }

  if (parts[0] === "t" && CODE.test(parts[1] ?? "")) {
    return {
      code: parts[1],
      share: false,
      raw: `https://www.threads.com${parsed.pathname}${parsed.search}`,
    };
  }

  return null;
}

async function resolveOnce(
  code: string,
  host: string,
  agent: string
): Promise<ThreadsTarget> {
  const response = await fetch(`https://${host}/share/${code}`, {
    method: "GET",
    redirect: "follow",
    cache: "no-store",
    headers: {
      "User-Agent": agent,
      Accept: "text/html,application/xhtml+xml,*/*",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(9_000),
  });

  const final = parseThreadsTarget(response.url);

  if (final && !final.share) {
    await response.body?.cancel().catch(() => undefined);

    return final;
  }

  const html = (await response.text()).slice(0, 600_000);

  const match =
    html.match(/(?:og:url|canonical)["'][^>]*?content=["']([^"']+)["']/i) ??
    html.match(
      /href=["'](https?:\/\/[^"']*threads\.(?:com|net)\/@[\w.]+\/post\/[\w-]+[^"']*)["']/i
    ) ??
    html.match(/\/@([\w.]+)\/post\/([\w-]{5,40})/);

  if (match) {
    const candidate = match[2]
      ? `https://www.threads.com/@${match[1]}/post/${match[2]}`
      : match[1].replace(/&amp;/g, "&");

    const target = parseThreadsTarget(candidate);

    if (target && !target.share) {
      return target;
    }
  }

  throw new Error("share tidak terselesaikan");
}

async function resolveShare(code: string) {
  const attempts: Promise<ThreadsTarget>[] = [];

  for (const host of SHARE_HOSTS) {
    for (const agent of SHARE_AGENTS) {
      attempts.push(resolveOnce(code, host, agent));
    }
  }

  try {
    return await Promise.any(attempts);
  } catch {
    return null;
  }
}

export async function resolveThread(inputUrl: string): Promise<ThreadsTarget> {
  const target = parseThreadsTarget(inputUrl);

  if (!target) {
    throw new AppError(
      "Tautan Threads tidak valid. Gunakan tautan postingan, bukan profil.",
      400
    );
  }

  if (!target.share) {
    return target;
  }

  return (await resolveShare(target.code)) ?? target;
}

export function candidatesOf(target: ThreadsTarget) {
  const list: string[] = [];

  if (target.raw) {
    list.push(target.raw);
  }

  if (target.share) {
    list.push(`https://www.threads.com/share/${target.code}`);
  } else {
    list.push(
      target.username
        ? `https://www.threads.com/@${target.username}/post/${target.code}`
        : `https://www.threads.com/t/${target.code}`
    );
  }

  return [...new Set(list)];
}
