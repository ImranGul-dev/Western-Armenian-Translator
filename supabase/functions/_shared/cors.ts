function wildcardPatternToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/gu, "\\$&").replace(/\*/gu, ".*");
  return new RegExp(`^${escaped}$`, "u");
}

export function isOriginAllowed(origin: string | null, configuredOrigins: string): boolean {
  if (!origin) return true;
  const patterns = configuredOrigins.split(",").map((item) => item.trim()).filter(Boolean);
  return patterns.some((pattern) => wildcardPatternToRegExp(pattern).test(origin));
}

export function buildCorsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-id, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Expose-Headers": "X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-Request-Id",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "Vary": "Origin"
  };
}
