/**
 * Cache-Control policy for on-demand (SSR) HTML routes.
 *
 * Feeds already ship `public, max-age=…`; HTML routes did not, so every
 * crawler hit re-rendered the home/blog index from scratch. Only anonymous
 * requests are cacheable — a signed-in editor sees the same markup today,
 * but the session cookie makes the response per-user by definition and a
 * shared cache must never store it.
 */
import { hasSessionCookie } from "./session-cookie";

export const PUBLIC_HTML_CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=3600";

/** Cache-Control value for an SSR HTML response, or null when it must stay private. */
export const publicHtmlCacheControl = (request: Request): string | null =>
  hasSessionCookie(request.headers.get("cookie")) ? null : PUBLIC_HTML_CACHE_CONTROL;

/** Applies the anonymous cache policy to `headers` in place; no-op for signed-in requests. */
export const applyPublicHtmlCache = (request: Request, headers: Headers): void => {
  const value = publicHtmlCacheControl(request);
  if (value) headers.set("Cache-Control", value);
};
