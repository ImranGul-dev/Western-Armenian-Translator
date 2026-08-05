export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function getClientFingerprintInput(request: Request, anonymousClientId: string): string {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = request.headers.get("cf-connecting-ip")
    || forwardedFor
    || request.headers.get("x-real-ip")
    || "unknown";
  return `${ip}|${anonymousClientId}`;
}

export function isPublishableKeyAccepted(suppliedKey: string | null, acceptedKeys: Set<string>): boolean {
  if (!suppliedKey || acceptedKeys.size === 0) return false;
  return acceptedKeys.has(suppliedKey.trim());
}
