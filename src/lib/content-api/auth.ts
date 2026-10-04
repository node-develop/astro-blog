import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { ADMIN_SESSION_TOKEN_HASH, contentApiKeys } from "../db/schema";
import { hasAuthorizationHeader } from "../http/authorization";
import { logger } from "../logger";
import { SESSION_AGENT, scopeSchema, type ApiScope } from "./contract";
import { apiError } from "./errors";
import { isAllowedOrigin } from "./origin";

export const hash = (value: string | Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");
export const equalSecret = (left: string, right: string): boolean =>
  timingSafeEqual(Buffer.from(hash(left)), Buffer.from(hash(right)));

export type Principal =
  | Readonly<{ kind: "key"; keyId: string; keyName: string; scopes: readonly ApiScope[] }>
  | Readonly<{
      kind: "session";
      keyId: string;
      keyName: string;
      scopes: readonly ApiScope[];
      userId: string;
    }>;

/**
 * One rule for the scopes of a key row. The `admin-session` row stands for a signed-in admin: it
 * is an identity (the FK) and a kill switch (`revoked_at`), and its stored scope list is ignored.
 * An admin session holds every scope there is, so a scope added later needs no data migration.
 * Every other key holds what its row says. The API (`authenticateSession`) and the worker's check
 * of the key behind a publication both go through this function.
 */
export const effectiveScopes = (
  key: Readonly<{ tokenHash: string; scopes: readonly ApiScope[] }>,
): readonly ApiScope[] =>
  key.tokenHash === ADMIN_SESSION_TOKEN_HASH ? scopeSchema.options : key.scopes;

/** Who made a write: the key behind it and, for an admin session, the person. */
export type Actor = Readonly<{ keyId: string; userId: string | null }>;
export const actorOf = (principal: Principal): Actor => ({
  keyId: principal.keyId,
  userId: principal.kind === "session" ? principal.userId : null,
});

/** `provenance.agent` of a document that does not name one: the key name, `admin` for a session. */
export const defaultAgent = (principal: Principal): string =>
  principal.kind === "session" ? SESSION_AGENT : principal.keyName;

/** `"any"` means: authenticated is enough, no particular scope. */
export const authenticate = async (request: Request, scope: ApiScope | "any") => {
  const bearer = /^Bearer (artka_[A-Za-z0-9_-]{43})$/.exec(
    request.headers.get("authorization") ?? "",
  );
  if (!bearer?.[1]) throw apiError(401, "unauthorized", "A content API Bearer token is required.");
  const [key] = await db
    .select()
    .from(contentApiKeys)
    .where(and(eq(contentApiKeys.tokenHash, hash(bearer[1])), isNull(contentApiKeys.revokedAt)));
  if (!key) throw apiError(401, "unauthorized", "Invalid or revoked API key.");
  if (scope !== "any" && !key.scopes.includes(scope))
    throw apiError(403, "forbidden", `Required scope: ${scope}`);
  const [rate] = await db
    .update(contentApiKeys)
    .set({
      windowStart: sql`case when window_start < now() - interval '1 minute' then now() else window_start end`,
      windowCount: sql`case when window_start < now() - interval '1 minute' then 1 else window_count + 1 end`,
    })
    .where(eq(contentApiKeys.id, key.id))
    .returning({ count: contentApiKeys.windowCount });
  if (!rate || rate.count > 60)
    throw apiError(429, "rate_limited", "Limit: 60 requests per minute per key.");
  return key;
};

const authenticateSession = async (
  request: Request,
  user: App.Locals["user"],
): Promise<Principal> => {
  if (!user) throw apiError(401, "unauthorized", "Sign in or send a content API Bearer token.");
  if (user.role !== "admin")
    throw apiError(403, "forbidden", "Only an administrator can use the content API.");
  if (
    request.method !== "GET" &&
    request.method !== "HEAD" &&
    !isAllowedOrigin(request.headers.get("origin"), process.env)
  )
    throw apiError(403, "origin_mismatch", "The Origin header does not match this site.");
  // No memo: the id changes whenever the table is rebuilt (tests truncate it).
  const [row] = await db
    .select()
    .from(contentApiKeys)
    .where(eq(contentApiKeys.tokenHash, ADMIN_SESSION_TOKEN_HASH));
  // The worker gates publication on this row (a revoked row fails the job with key_revoked),
  // so a revoked row must not accept work here.
  if (!row || row.revokedAt) {
    logger.error(
      { userId: user.id, revoked: Boolean(row?.revokedAt) },
      "admin-session key is missing or revoked",
    );
    throw apiError(
      503,
      "admin_session_key_missing",
      "The admin-session key is missing or revoked; session access is unavailable.",
    );
  }
  return {
    kind: "session",
    keyId: row.id,
    keyName: row.name,
    scopes: effectiveScopes(row),
    userId: user.id,
  };
};

/**
 * Who is calling, and may they use `scope`.
 * A non-empty Authorization header is judged as a Bearer key and never falls
 * back to the cookie. Without it, the signed-in admin of `locals` is the
 * principal: every scope (the row must exist and not be revoked), no rate limit, and an Origin
 * check on anything that writes.
 */
export const authorize = async (
  request: Request,
  locals: Partial<App.Locals> | undefined,
  scope: ApiScope | "any",
): Promise<Principal> => {
  if (hasAuthorizationHeader(request.headers)) {
    const key = await authenticate(request, scope);
    return { kind: "key", keyId: key.id, keyName: key.name, scopes: key.scopes };
  }
  const principal = await authenticateSession(request, locals?.user ?? null);
  if (scope !== "any") requireScope(principal, scope);
  return principal;
};

export const requireScope = (principal: Principal, scope: ApiScope): void => {
  if (!principal.scopes.includes(scope))
    throw apiError(403, "forbidden", `Required scope: ${scope}`);
};
