import "../env.js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type Database = ReturnType<typeof createDb>;

export const createDb = (connectionString: string) => {
  const client = postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return drizzle(client, { schema });
};

let cached: Database | null = null;

const getDb = (): Database => {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL env variable is required");
  cached = createDb(url);
  return cached;
};

/**
 * Schema-only metadata (`db._`) that adapters read at construction time
 * (Better-Auth ≥1.7 inspects `db._.schema` when `drizzleAdapter(db)` is
 * called). Serving it from a client-less instance keeps request paths that
 * never query (e.g. `/login` without a session cookie) independent of
 * `DATABASE_URL`, while any real query still fails loud via `getDb()`.
 */
const schemaOnly = drizzle.mock({ schema });

export const db: Database = new Proxy({} as Database, {
  get: (_target, prop) => {
    if (prop === "_" && !cached && !process.env.DATABASE_URL) {
      return Reflect.get(schemaOnly as object, prop);
    }
    return Reflect.get(getDb() as object, prop);
  },
});

export { schema };
