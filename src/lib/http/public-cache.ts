/**
 * Cache-Control policy for on-demand (SSR) HTML routes.
 *
 * Feeds already ship `public, max-age=…`; HTML routes did not, so every
 * crawler hit re-rendered the home/blog index from scratch. Only anonymous
 * requests are cacheable — a signed-in editor sees the same markup today,
 * but the session cookie makes the response per-user by definition and a
 * shared cache must never store it.
 *
 * Mirrors the cookie names from src/lib/auth/request-classification.ts
 * without importing admin/auth code into public page modules.
 */
const SESSION_COOKIE_NAMES: ReadonlySet<string> = new Set([
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
]);

export const PUBLIC_HTML_CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=3600";

export const hasSessionCookie = (cookieHeader: string | null): boolean => {
  if (!cookieHeader) return false;
  return cookieHeader.split(";").some((cookie) => {
    const separator = cookie.indexOf("=");
    if (separator < 1) return false;
    return SESSION_COOKIE_NAMES.has(cookie.slice(0, separator).trim());
  });
};

/** Cache-Control value for an SSR HTML response, or null when it must stay private. */
export const publicHtmlCacheControl = (request: Request): string | null =>
  hasSessionCookie(request.headers.get("cookie")) ? null : PUBLIC_HTML_CACHE_CONTROL;

/** Applies the anonymous cache policy to `headers` in place; no-op for signed-in requests. */
export const applyPublicHtmlCache = (request: Request, headers: Headers): void => {
  const value = publicHtmlCacheControl(request);
  if (value) headers.set("Cache-Control", value);
};
