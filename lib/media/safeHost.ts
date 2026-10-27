export function isPublicHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (!host || host === "localhost" || host.endsWith(".localhost")) {
    return false;
  }

  if (host.endsWith(".local") || host.endsWith(".internal")) {
    return false;
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const [a, b] = host.split(".").map(Number);

    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
  }

  if (host.includes(":")) {
    if (host === "::1" || host === "::") return false;
    if (/^f[cd]/.test(host) || /^fe[89ab]/.test(host)) return false;
    if (host.startsWith("::ffff:")) return false;
  }

  return true;
}
