/**
 * Idempotently seeds a credential-login admin user.
 *
 * `emailAndPassword.disableSignUp` is on in src/lib/auth.ts, so
 * `auth.api.signUpEmail` is rejected — the only way to create a login is to
 * write the user + credential account rows directly, hashing the password
 * with Better-Auth's own hasher so `signInEmail` can verify it.
 *
 * Shared by `scripts/bootstrap-admin.ts` (prod bootstrap) and
 * `tests/e2e/global-setup.ts` (Playwright fixture) — keep the logic here so
 * the two never drift.
 */
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, accounts } from "../db/schema.js";
import { auth } from "../auth.js";

export interface EnsureAdminInput {
  readonly email: string;
  readonly password: string;
  readonly name: string;
}

export interface EnsureAdminResult {
  readonly userId: string;
  /** true when the user row was inserted, false when it already existed. */
  readonly createdUser: boolean;
  /** true when the credential account row was inserted, false when its password was updated. */
  readonly createdAccount: boolean;
}

export const ensureAdminUser = async (input: EnsureAdminInput): Promise<EnsureAdminResult> => {
  const { email, password, name } = input;

  // Use Better-Auth's internal password hasher so the produced hash is
  // verifiable by `signInEmail` (same scrypt params + format).
  const ctx = await auth.$context;
  const passwordHash = await ctx.password.hash(password);

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  let userId: string;
  let createdUser: boolean;
  if (existing.length === 0) {
    const [created] = await db
      .insert(users)
      .values({ email, name, emailVerified: true, role: "admin" })
      .returning({ id: users.id });
    if (!created) throw new Error(`failed to insert admin user ${email}`);
    userId = created.id;
    createdUser = true;
  } else {
    userId = existing[0]!.id;
    await db
      .update(users)
      .set({ role: "admin", emailVerified: true, name, updatedAt: new Date() })
      .where(eq(users.id, userId));
    createdUser = false;
  }

  // Upsert the credential account row that holds the password hash.
  const existingAccount = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .limit(1);

  let createdAccount: boolean;
  if (existingAccount.length === 0) {
    await db.insert(accounts).values({
      userId,
      providerId: "credential",
      accountId: userId,
      password: passwordHash,
    });
    createdAccount = true;
  } else {
    await db
      .update(accounts)
      .set({ password: passwordHash, updatedAt: new Date() })
      .where(eq(accounts.userId, userId));
    createdAccount = false;
  }

  return { userId, createdUser, createdAccount };
};
