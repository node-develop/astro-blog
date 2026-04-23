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

export const db: Database = new Proxy({} as Database, {
  get: (_target, prop) => Reflect.get(getDb() as object, prop),
});

export { schema };
