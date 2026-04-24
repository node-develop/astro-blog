import type { FullConfig } from "@playwright/test";
import { eq } from "drizzle-orm";
import { auth } from "../../src/lib/auth";
import { db } from "../../src/lib/db";
import { users } from "../../src/lib/db/schema";

/**
 * Seeds a predictable admin user for Playwright tests.
 */
export default async function globalSetup(_config: FullConfig): Promise<void> {
  const email = "e2e-admin@test.dev";
  const existing = await db.select().from(users).where(eq(users.email, email));
  if (existing.length === 0) {
    try {
      await auth.api.signUpEmail({
        body: { email, password: "e2e-admin-password", name: "E2E Admin" },
      });
    } catch (err) {
      // Ignore "user already exists" race — the upsert below handles it.
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.toLowerCase().includes("already")) throw err;
    }
  }
  await db.update(users).set({ role: "admin" }).where(eq(users.email, email));
}
