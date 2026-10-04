import { randomBytes } from "node:crypto";
import { desc, eq, ne } from "drizzle-orm";
import type { Database } from "../db";
import { ADMIN_SESSION_TOKEN_HASH, contentApiKeys } from "../db/schema";
import { hash } from "./auth";
import type { CreateKeyInput } from "./contract";
import { apiError } from "./errors";

type Row = typeof contentApiKeys.$inferSelect;
/** Anything that can run a query: the database or a transaction. */
type Queryable = Pick<Database, "select" | "insert" | "update">;

/** The shape clients see. The token hash is deliberately not part of it. */
export const keyView = (row: Pick<Row, "id" | "name" | "scopes" | "createdAt" | "revokedAt">) => ({
  id: row.id,
  name: row.name,
  scopes: [...row.scopes],
  createdAt: row.createdAt.toISOString(),
  revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
});

export const issueToken = (): string => `artka_${randomBytes(32).toString("base64url")}`;

/** Stores the hash only; the returned token is the one and only copy of the credential. */
export const createKey = async (database: Queryable, input: CreateKeyInput) => {
  const token = issueToken();
  const [row] = await database
    .insert(contentApiKeys)
    .values({ name: input.name, tokenHash: hash(token), scopes: [...input.scopes] })
    .returning();
  return { ...keyView(row!), token };
};

/** Newest first, revoked keys included, the `admin-session` system row left out. */
export const listKeys = async (database: Queryable) => {
  const rows = await database
    .select()
    .from(contentApiKeys)
    .where(ne(contentApiKeys.tokenHash, ADMIN_SESSION_TOKEN_HASH))
    .orderBy(desc(contentApiKeys.createdAt), desc(contentApiKeys.id));
  return rows.map(keyView);
};

/**
 * Revokes, never deletes: content rows reference keys with ON DELETE RESTRICT. Revoking also fails
 * the key's queued and publishing jobs (the worker answers `key_revoked`). The `admin-session` row
 * cannot be revoked here: that would turn every admin write into a 503.
 */
export const revokeKey = async (database: Queryable, id: string) => {
  const [row] = await database.select().from(contentApiKeys).where(eq(contentApiKeys.id, id));
  if (!row) throw apiError(404, "not_found", "Key not found.");
  if (row.tokenHash === ADMIN_SESSION_TOKEN_HASH)
    throw apiError(403, "system_key_protected", "The admin-session key cannot be revoked.");
  if (row.revokedAt) return { ...keyView(row), unchanged: true as const };
  const [revoked] = await database
    .update(contentApiKeys)
    .set({ revokedAt: new Date() })
    .where(eq(contentApiKeys.id, id))
    .returning();
  return { ...keyView(revoked!), unchanged: false as const };
};
