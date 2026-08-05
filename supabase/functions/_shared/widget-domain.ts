export function normalizeOriginHost(origin: string): string | null {
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.host.toLowerCase().replace(/\.$/u, "");
  } catch {
    return null;
  }
}

export function originMatchesDomain(origin: string, allowedDomain: string): boolean {
  const host = normalizeOriginHost(origin);
  return host !== null && host === allowedDomain.toLowerCase().replace(/\.$/u, "");
}
