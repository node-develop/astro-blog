import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Database } from "../../src/lib/db";
import * as schema from "../../src/lib/db/schema";
import sharp from "sharp";

const state = vi.hoisted(() => ({ db: undefined as Database | undefined }));
vi.mock("~/lib/db", () => ({
  get db() {
    return state.db;
  },
}));
import { uploadImage } from "../../src/lib/content-api/media";

describe("S3 upload adapter with real HTTP and PostgreSQL", () => {
  let container: StartedPostgreSqlContainer;
  let client: ReturnType<typeof postgres>;
  let server: Server;
  let keyId: string;
  const objects = new Map<
    string,
    { bytes: Buffer; mime: string | undefined; auth: string | undefined }
  >();
  let requests = 0;
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18-bookworm").start();
    client = postgres(container.getConnectionUri(), { onnotice: () => {} });
    state.db = drizzle(client, { schema });
    await migrate(state.db, { migrationsFolder: "drizzle" });
    const [key] = await state.db
      .insert(schema.contentApiKeys)
      .values({ name: "media-test", tokenHash: "fake-media-token-hash", scopes: ["media:write"] })
      .returning();
    keyId = key!.id;
    server = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      requests++;
      objects.set(request.url!, {
        bytes: Buffer.concat(chunks),
        mime: request.headers["content-type"],
        auth: request.headers.authorization,
      });
      response.writeHead(200, { ETag: '"test-etag"' });
      response.end();
    }).listen(0, "127.0.0.1");
    await once(server, "listening");
    vi.stubEnv("CONTENT_S3_ENDPOINT", `http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    vi.stubEnv("CONTENT_S3_REGION", "us-east-1");
    vi.stubEnv("CONTENT_S3_BUCKET", "test-bucket");
    vi.stubEnv("CONTENT_S3_ACCESS_KEY_ID", "test-access-key");
    vi.stubEnv("CONTENT_S3_SECRET_ACCESS_KEY", "test-secret-key");
    vi.stubEnv("CONTENT_S3_PUBLIC_URL", "https://cdn.example.test/media/");
    vi.stubEnv("CONTENT_S3_FORCE_PATH_STYLE", "true");
  }, 180_000);
  afterAll(async () => {
    vi.unstubAllEnvs();
    server?.close();
    await client?.end();
    await container?.stop();
  });
  it("stores signed S3 objects and stable asset IDs; retries survive a new DB connection", async () => {
    const bytes = await sharp({ create: { width: 10, height: 10, channels: 3, background: "red" } })
      .png()
      .toBuffer();
    const first = await uploadImage(bytes, "image/png", keyId);
    expect(first.url).toMatch(/^https:\/\/cdn.example.test\/media\/articles\/[a-f0-9]{64}\.webp$/);
    const stored = [...objects.values()][0]!;
    expect(await sharp(stored.bytes).metadata()).toMatchObject({
      format: "webp",
      width: 10,
      height: 10,
    });
    expect(stored.mime).toBe("image/webp");
    expect(stored.auth).toContain("AWS4-HMAC-SHA256");
    await client.end();
    client = postgres(container.getConnectionUri());
    state.db = drizzle(client, { schema });
    const second = await uploadImage(bytes, "image/png", keyId);
    expect(second.id).toBe(first.id);
    expect(second.url).toBe(first.url);
    expect(requests).toBe(1);
  });
});
