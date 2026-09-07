import "../src/lib/env";
import { randomBytes, createHash } from "node:crypto";
import postgres from "postgres";
import { scopeSchema } from "../src/lib/content-api/contract";

const [command, nameOrId, ...requestedScopes] = process.argv.slice(2);
if (!process.env.DATABASE_URL || !nameOrId || !["create", "revoke"].includes(command ?? "")) {
  console.error(
    "Usage: pnpm content:key create <name> articles:read articles:write articles:publish media:write\n       pnpm content:key revoke <key-id>\nDATABASE_URL is required.",
  );
  process.exit(1);
}
const client = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  if (command === "revoke") {
    const rows =
      await client`update content_api_keys set revoked_at = now() where id = ${nameOrId} returning id`;
    process.stdout.write(`${rows.length ? "Revoked" : "Not found"}\n`);
  } else {
    const scopes = requestedScopes.map((scope) => scopeSchema.parse(scope));
    if (!scopes.length) throw new Error("Provide at least one scope");
    const token = `artka_${randomBytes(32).toString("base64url")}`;
    const digest = createHash("sha256").update(token).digest("hex");
    const [key] = await client`insert into content_api_keys (name, token_hash, scopes)
      values (${nameOrId}, ${digest}, ${client.json(scopes)}) returning id`;
    // Deliberately print the newly created credential once; only its hash is stored.
    process.stdout.write(JSON.stringify({ id: key!.id, token, scopes }) + "\n");
  }
} finally {
  await client.end();
}
