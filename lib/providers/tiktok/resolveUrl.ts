const POST_PATH = /^\/@[^/]+\/(video|photo)\/\d+/;

const POST_IN_HTML =
  /https?:\/\/(?:www\.)?tiktok\.com\/@[^/"'\s?\\]+\/(?:video|photo)\/\d+/i;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

export async function resolvePostUrl(inputUrl: string) {
  let current = inputUrl;

  for (let step = 0; step < 5; step += 1) {
    let parsed: URL;

    try {
      parsed = new URL(current);
    } catch {
      return inputUrl;
    }

    if (POST_PATH.test(parsed.pathname)) {
      return `${parsed.origin}${parsed.pathname}`;
    }

    try {
      const response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,*/*",
        },
        signal: AbortSignal.timeout(8_000),
      });

      const location = response.headers.get("location");

      if (!location) {
        const html = await response.text().catch(() => "");
        const found = html.match(POST_IN_HTML);

        return found ? found[0] : inputUrl;
      }

      current = new URL(location, current).toString();
    } catch {
      return inputUrl;
    }
  }

  return inputUrl;
}
