/**
 * Better-Auth session detection shared by the auth guard
 * (src/lib/auth/request-classification.ts) and the public HTML cache policy
 * (src/lib/http/public-cache.ts). Deliberately dependency-free so public page
 * modules can use it without importing admin/auth code.
 *
 * Names match exactly: a lookalike (`…session_token-suffix`, other casing)
 * must neither trigger the auth context nor make a response uncacheable.
 */
const SESSION_COOKIE_NAMES: ReadonlySet<string> = new Set([
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
]);

export const hasSessionCookie = (cookieHeader: string | null): boolean => {
  if (!cookieHeader) return false;
  return cookieHeader.split(";").some((cookie) => {
    const separator = cookie.indexOf("=");
    if (separator < 1) return false;
    return SESSION_COOKIE_NAMES.has(cookie.slice(0, separator).trim());
  });
};
