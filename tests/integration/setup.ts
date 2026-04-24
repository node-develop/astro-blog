import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "~/lib/db/schema";

export interface TestDb {
  db: ReturnType<typeof drizzle<typeof schema>>;
  client: ReturnType<typeof postgres>;
  container: StartedPostgreSqlContainer;
  teardown(): Promise<void>;
}

export async function bootTestDb(): Promise<TestDb> {
  const container = await new PostgreSqlContainer("postgres:18-bookworm")
    .withDatabase("blog_test")
    .withUsername("test")
    .withPassword("test")
    .start();

  const url = container.getConnectionUri();
  const client = postgres(url, { max: 1 });
  const db = drizzle(client, { schema });

  // Apply migrations from the drizzle/ directory.
  const migrationDir = join(process.cwd(), "drizzle");
  const files = (await readdir(migrationDir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = await readFile(join(migrationDir, file), "utf8");
    // Strip drizzle statement-breakpoint markers and pass as a single unsafe
    // call so $$-delimited function bodies stay intact.
    await client.unsafe(sql.replaceAll(/-->\s*statement-breakpoint/g, ""));
  }

  return {
    db,
    client,
    container,
    async teardown(): Promise<void> {
      await client.end({ timeout: 5 });
      await container.stop();
    },
  };
}
