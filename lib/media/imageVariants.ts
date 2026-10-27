const MODERN_EXTENSION = /\.(heic|heif|avif)$/i;

export const IMAGE_ACCEPT =
  "image/jpeg,image/webp,image/png,image/*;q=0.8,*/*;q=0.5";

export function isImagePath(pathname: string) {
  return (
    /\.(jpe?g|webp|png|heic|heif|avif)$/i.test(pathname) ||
    /photomode|tplv-[^/]*image/i.test(pathname)
  );
}

export function imageVariants(rawUrl: string): string[] {
  try {
    const url = new URL(rawUrl);

    if (url.hostname === "pbs.twimg.com" && url.searchParams.get("name") === "orig") {
      const fallback = new URL(rawUrl);

      fallback.searchParams.set("name", "large");

      return [rawUrl, fallback.toString()];
    }

    if (!MODERN_EXTENSION.test(url.pathname)) {
      return [rawUrl];
    }

    const swap = (extension: string) => {
      const next = new URL(rawUrl);

      next.pathname = next.pathname.replace(MODERN_EXTENSION, `.${extension}`);

      return next.toString();
    };

    return [swap("jpeg"), swap("webp"), rawUrl];
  } catch {
    return [rawUrl];
  }
}
