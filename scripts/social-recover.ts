/**
 * Run from cron every 5 min:
 *   - generating older than 10 min → failed
 *   - sending older than 5 min and externalId IS NULL → pending + retryCount++
 *
 * If externalId IS NOT NULL during sending zombie → leave as 'sending' for
 * manual resolution (external API may have accepted but our process crashed).
 */
import { config as dotenv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { and, eq, sql, isNull, lt } from "drizzle-orm";
import * as schema from "../src/lib/db/schema.js";

dotenv();

const main = async (): Promise<void> => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const client = postgres(url, { max: 1 });
  const db = drizzle(client, { schema });
  const { socialPosts } = schema;

  const stuckGen = await db
    .update(socialPosts)
    .set({
      status: "failed",
      errorMessage: "generation timed out",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(socialPosts.status, "generating"),
        lt(socialPosts.createdAt, sql`now() - interval '10 minutes'`),
      ),
    )
    .returning({ id: socialPosts.id });

  const stuckSend = await db
    .update(socialPosts)
    .set({
      status: "pending",
      retryCount: sql`${socialPosts.retryCount} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(socialPosts.status, "sending"),
        isNull(socialPosts.externalId),
        lt(socialPosts.updatedAt, sql`now() - interval '5 minutes'`),
      ),
    )
    .returning({ id: socialPosts.id });

  console.warn(
    JSON.stringify({
      recoveredGenerating: stuckGen.length,
      recoveredSending: stuckSend.length,
    }),
  );

  await client.end();
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
