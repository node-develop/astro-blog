/**
 * A request that carries a non-empty Authorization header is a credentialed
 * API call: it is judged by that header alone and never falls back to a
 * session cookie. Shared by the auth middleware (request-classification.ts)
 * and the content API (content-api/auth.ts) so they cannot disagree about it.
 */
export const hasAuthorizationHeader = (headers: Headers): boolean =>
  (headers.get("authorization") ?? "").trim() !== "";
