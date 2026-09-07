import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { contentApiKeys } from "../db/schema";
import type { ApiScope } from "./contract";
import { apiError } from "./errors";

export const hash = (value: string | Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");
export const equalSecret = (left: string, right: string): boolean =>
  timingSafeEqual(Buffer.from(hash(left)), Buffer.from(hash(right)));

export const authenticate = async (request: Request, scope: ApiScope) => {
  const bearer = /^Bearer (artka_[A-Za-z0-9_-]{43})$/.exec(
    request.headers.get("authorization") ?? "",
  );
  if (!bearer?.[1]) throw apiError(401, "unauthorized", "A content API Bearer token is required.");
  const [key] = await db
    .select()
    .from(contentApiKeys)
    .where(and(eq(contentApiKeys.tokenHash, hash(bearer[1])), isNull(contentApiKeys.revokedAt)));
  if (!key) throw apiError(401, "unauthorized", "Invalid or revoked API key.");
  if (!key.scopes.includes(scope)) throw apiError(403, "forbidden", `Required scope: ${scope}`);
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
