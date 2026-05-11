import "../env.ts";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const MANUAL_MIGRATIONS = ["0007_triggers_and_roles.sql"];

const main = async (): Promise<void> => {
  const client = postgres(url, { max: 1 });
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: "./drizzle" });

  const drizzleDir = path.resolve(process.cwd(), "drizzle");
  for (const file of MANUAL_MIGRATIONS) {
    const sqlPath = path.join(drizzleDir, file);
    const sql = await readFile(sqlPath, "utf-8");
    console.log(`[migrate] applying manual SQL: ${file}`);
    await client.unsafe(sql);
    console.log(`[migrate] done: ${file}`);
  }

  await client.end();
  console.log("migrations applied");
};

main().catch((err: unknown) => {
  console.error("migration failed", err);
  process.exit(1);
});
