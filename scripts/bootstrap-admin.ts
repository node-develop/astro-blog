import "../src/lib/env.js";
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db/index.js";
import { users } from "../src/lib/db/schema.js";
import { auth } from "../src/lib/auth.js";

const main = async (): Promise<void> => {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? "Admin";

  if (!email || !password) {
    console.error("ADMIN_EMAIL and ADMIN_PASSWORD env vars are required");
    process.exit(1);
  }

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (existing.length === 0) {
    await auth.api.signUpEmail({ body: { email, password, name } });
    console.warn(`created user ${email}`);
  } else {
    console.warn(`user ${email} already exists, skipping signup`);
  }

  const result = await db
    .update(users)
    .set({ role: "admin", emailVerified: true })
    .where(eq(users.email, email))
    .returning({ id: users.id, role: users.role });

  if (result.length === 0) {
    console.error("failed to promote user to admin");
    process.exit(1);
  }

  console.warn(`user ${email} → role=${result[0]!.role}`);
};

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error("bootstrap-admin failed", err);
    process.exit(1);
  });
