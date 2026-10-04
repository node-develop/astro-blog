import "../src/lib/env";
import { z } from "zod";
import { createDb } from "../src/lib/db";
import { createKeySchema, scopeSchema } from "../src/lib/content-api/contract";
import { createKey, revokeKey } from "../src/lib/content-api/keys";

const [command, nameOrId, ...requestedScopes] = process.argv.slice(2);
if (!process.env.DATABASE_URL || !nameOrId || !["create", "revoke"].includes(command ?? "")) {
  console.error(
    `Usage: pnpm content:key create <name> ${scopeSchema.options.join(" ")}\n       pnpm content:key revoke <key-id>\nDATABASE_URL is required.`,
  );
  process.exit(1);
}
const database = createDb(process.env.DATABASE_URL);
try {
  if (command === "revoke") {
    const result = await revokeKey(database, z.uuid().parse(nameOrId));
    process.stdout.write(`${result.unchanged ? "Already revoked" : "Revoked"}\n`);
  } else {
    const input = createKeySchema.parse({ name: nameOrId, scopes: requestedScopes });
    const { id, token, scopes } = await createKey(database, input);
    // Deliberately print the newly created credential once; only its hash is stored.
    process.stdout.write(JSON.stringify({ id, token, scopes }) + "\n");
  }
} finally {
  await database.$client.end();
}
