import "../src/lib/env.js";
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db/index.js";
import { users, accounts } from "../src/lib/db/schema.js";
import { auth } from "../src/lib/auth.js";

const main = async (): Promise<void> => {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? "Admin";

  if (!email || !password) {
    console.error("ADMIN_EMAIL and ADMIN_PASSWORD env vars are required");
    process.exit(1);
  }

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
  if (existing.length === 0) {
    const [created] = await db
      .insert(users)
      .values({ email, name, emailVerified: true, role: "admin" })
      .returning({ id: users.id });
    userId = created!.id;
    console.warn(`created user ${email} (id=${userId})`);
  } else {
    userId = existing[0]!.id;
    await db
      .update(users)
      .set({ role: "admin", emailVerified: true, name, updatedAt: new Date() })
      .where(eq(users.id, userId));
    console.warn(`user ${email} already exists (id=${userId}) → ensured admin`);
  }

  // Upsert the credential account row that holds the password hash.
  const existingAccount = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .limit(1);

  if (existingAccount.length === 0) {
    await db.insert(accounts).values({
      userId,
      providerId: "credential",
      accountId: userId,
      password: passwordHash,
    });
    console.warn(`created credential account for ${email}`);
  } else {
    await db
      .update(accounts)
      .set({ password: passwordHash, updatedAt: new Date() })
      .where(eq(accounts.userId, userId));
    console.warn(`updated credential password for ${email}`);
  }
};

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("bootstrap-admin failed", err);
    process.exit(1);
  });
