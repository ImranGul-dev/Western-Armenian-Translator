export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function getRequestIp(request: Request): string | null {
  const forwardedFor = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();

  const ip =
    request.headers.get("cf-connecting-ip")?.trim() ||
    forwardedFor ||
    request.headers.get("x-real-ip")?.trim() ||
    null;

  return ip || null;
}

export function getClientFingerprintInput(
  request: Request,
  anonymousClientId: string,
): string {
  const ip = getRequestIp(request) || "unknown";

  return `${ip}|${anonymousClientId}`;
}

/*
 * The five-free-translations daily allowance should follow
 * the visitor's public IP instead of a browser-specific ID.
 *
 * This prevents opening Incognito, another browser or clearing
 * local storage from creating another five free translations.
 *
 * If the platform cannot provide an IP address, fall back to
 * the existing browser fingerprint rather than putting every
 * unknown visitor into one shared quota bucket.
 */
export function getGuestQuotaFingerprintInput(
  request: Request,
  anonymousClientId: string,
): string {
  const ip = getRequestIp(request);

  if (ip) {
    return `ip|${ip}`;
  }

  return `fallback|${getClientFingerprintInput(
    request,
    anonymousClientId,
  )}`;
}

export function isPublishableKeyAccepted(
  suppliedKey: string | null,
  acceptedKeys: Set<string>,
): boolean {
  if (!suppliedKey || acceptedKeys.size === 0) {
    return false;
  }

  return acceptedKeys.has(suppliedKey.trim());
}