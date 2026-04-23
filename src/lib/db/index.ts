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

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL env variable is required");
}

export const db: Database = createDb(url);
export { schema };
