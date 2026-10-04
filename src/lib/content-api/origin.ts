import { CANONICAL_ORIGIN } from "../seo/url-policy";

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Origins allowed to send a state-changing request with a session cookie.
 * Production: the canonical origin only. Elsewhere also the origin that issued
 * the cookie (BETTER_AUTH_URL, else SITE_URL), which is localhost in dev.
 * Computed per call so tests and env changes are never cached.
 */
export const allowedOrigins = (env: Env): readonly string[] => {
  if (env.NODE_ENV === "production") return [CANONICAL_ORIGIN];
  const base = env.BETTER_AUTH_URL ?? env.SITE_URL;
  const issuer = base && URL.canParse(base) ? [new URL(base).origin] : [];
  return [CANONICAL_ORIGIN, ...issuer];
};

/** A missing or "null" Origin never matches. */
export const isAllowedOrigin = (origin: string | null, env: Env): boolean =>
  origin !== null && allowedOrigins(env).includes(origin);
