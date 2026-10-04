import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { APIContext } from "astro";
import type { Database } from "../../src/lib/db";
import * as schema from "../../src/lib/db/schema";

const state = vi.hoisted(() => ({ db: undefined as Database | undefined }));
vi.mock("~/lib/db", () => ({
  get db() {
    return state.db;
  },
}));

// The worker's first step commits through GitHub: stand in for the adapter, nothing else.
vi.mock("../../src/lib/content-api/github", async (original) => ({
  ...(await original<typeof import("../../src/lib/content-api/github")>()),
  commitArticle: vi.fn(async () => "commit-1"),
}));

import { ALL } from "../../src/pages/api/v1/[...path]";
import { processPublication } from "../../src/lib/content-api/worker";
import { createdKeySchema, keyListSchema, scopeSchema } from "../../src/lib/content-api/contract";

const token = `artka_${"a".repeat(43)}`;
const document = {
  externalId: "session-source",
  lang: "ru",
  slug: "session-content-api",
  title: "Session API article",
  description: "Description of the session access integration test article.",
  summary:
    "This article tests that a signed-in administrator can write through the content API with a cookie.",
  body: "## An example\n\nAn original explanation with useful details.",
  tags: ["ai"],
  sources: [{ url: "https://example.com/source", title: "Original source" }],
  provenance: { agent: "integration" },
};
// Real users rows: content_article_versions.actor_user_id references users.id (a uuid).
const USER_IDS = {
  a1: "a1a1a1a1-0000-4000-8000-000000000001",
  a2: "a2a2a2a2-0000-4000-8000-000000000002",
} as const;
const admin = (label: keyof typeof USER_IDS) => ({
  user: { id: USER_IDS[label], email: `${label}@test.local`, role: "admin" },
  session: null,
});
const reader = { user: { id: "r1", email: "r1@test.local", role: "reader" }, session: null };

type Options = {
  readonly locals?: unknown;
  readonly origin?: string | null;
  readonly bearer?: string;
  readonly key?: string;
  readonly body?: unknown;
};
const request = (method: string, path: string, options: Options): Request => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.origin) headers.origin = options.origin;
  if (options.bearer) headers.authorization = `Bearer ${options.bearer}`;
  if (options.key) headers["idempotency-key"] = options.key;
  return new Request(`https://artka.dev/api/v1/${path}`, {
    method,
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
};
const call = async (method: string, path: string, options: Options = {}) => {
  const response = await ALL({
    params: { path },
    request: request(method, path, options),
    locals: options.locals,
  } as unknown as APIContext);
  return { status: response.status, body: await response.json() };
};
const create = (options: Options, overrides: Record<string, unknown> = {}) =>
  call("POST", "articles", {
    origin: "https://artka.dev",
    key: "k1",
    body: { article: { ...document, ...overrides } },
    ...options,
  });

describe("content API session access with PostgreSQL", () => {
  let container: StartedPostgreSqlContainer;
  let client: ReturnType<typeof postgres>;
  const adminSessionRow = () =>
    state
      .db!.select()
      .from(schema.contentApiKeys)
      .where(eq(schema.contentApiKeys.tokenHash, schema.ADMIN_SESSION_TOKEN_HASH))
      .then((rows) => rows[0]);
  const seedAdminSession = () =>
    state.db!.insert(schema.contentApiKeys).values({
      name: schema.ADMIN_SESSION_KEY_NAME,
      tokenHash: schema.ADMIN_SESSION_TOKEN_HASH,
      scopes: ["articles:read", "articles:write", "articles:publish", "media:write"],
    });

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18-bookworm").start();
    client = postgres(container.getConnectionUri(), { max: 5 });
    state.db = drizzle(client, { schema });
    await migrate(state.db, { migrationsFolder: "drizzle" });
    // Origin rules depend on the environment: pin it so the run does not depend on the host.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SITE_URL", "https://artka.dev");
  }, 180_000);
  afterAll(async () => {
    vi.unstubAllEnvs();
    await client?.end();
    await container?.stop();
  });
  beforeEach(async () => {
    await client`truncate content_api_requests, content_publications, content_articles, content_assets, content_api_keys, post_revisions, posts_meta, users cascade`;
    await state
      .db!.insert(schema.users)
      .values(
        Object.entries(USER_IDS).map(([label, id]) => ({ id, email: `${label}@test.local` })),
      );
    await seedAdminSession();
    await state.db!.insert(schema.contentApiKeys).values({
      name: "test",
      tokenHash: createHash("sha256").update(token).digest("hex"),
      scopes: ["articles:read", "articles:write"],
    });
  });

  it("lets a signed-in admin write, attributed to the admin-session key", async () => {
    const result = await create({ locals: admin("a1") });
    expect(result.status).toBe(201);
    const [article] = await state.db!.select().from(schema.contentArticles);
    expect(article?.id).toBe(result.body.id);
    const [stored] = await state.db!.select().from(schema.contentApiRequests);
    expect(stored?.keyId).toBe((await adminSessionRow())?.id);
  });

  it("records the admin session key and the person on every version, restore included", async () => {
    const created = await create({ locals: admin("a1") });
    const options = { locals: admin("a2"), origin: "https://artka.dev" };
    await call("PUT", `articles/${created.body.id}`, {
      ...options,
      key: "put",
      body: { article: { ...document, title: "Second title" }, expectedVersion: 1 },
    });
    const restored = await call("POST", `articles/${created.body.id}/versions/1/restore`, {
      ...options,
      key: "restore",
      body: { expectedVersion: 2 },
    });
    expect(restored.status).toBe(200);
    const sessionKey = (await adminSessionRow())!.id;
    const rows = await state
      .db!.select()
      .from(schema.contentArticleVersions)
      .orderBy(schema.contentArticleVersions.version);
    expect(rows.map((r) => [r.version, r.actorKeyId, r.actorUserId])).toEqual([
      [1, sessionKey, USER_IDS.a1],
      [2, sessionKey, USER_IDS.a2],
      [3, sessionKey, USER_IDS.a2],
    ]);
  });

  it("rejects a non-admin role, an anonymous caller and a foreign or missing Origin on writes", async () => {
    expect((await create({ locals: reader })).status).toBe(403);
    expect((await create({ locals: { user: null, session: null } })).status).toBe(401);
    for (const origin of ["https://evil.test", "null", null]) {
      const result = await create({ locals: admin("a1"), origin });
      expect(result.status).toBe(403);
      expect(result.body.error.code).toBe("origin_mismatch");
    }
    expect(await state.db!.select().from(schema.contentArticles)).toHaveLength(0);
  });

  it("does not require an Origin to read", async () => {
    const created = await create({ locals: admin("a1") });
    const read = await call("GET", `articles/${created.body.id}`, {
      locals: admin("a1"),
      origin: "https://evil.test",
    });
    expect(read.status).toBe(200);
  });

  it("does not rate-limit a session and does not touch its counter", async () => {
    await state
      .db!.update(schema.contentApiKeys)
      .set({ windowCount: 1000 })
      .where(eq(schema.contentApiKeys.tokenHash, schema.ADMIN_SESSION_TOKEN_HASH));
    expect((await create({ locals: admin("a1") })).status).toBe(201);
    expect((await adminSessionRow())?.windowCount).toBe(1000);
  });

  it("never falls back to the cookie when an Authorization header is present", async () => {
    const result = await create({ locals: admin("a1"), bearer: `artka_${"b".repeat(43)}` });
    expect(result.status).toBe(401);
    expect(await state.db!.select().from(schema.contentArticles)).toHaveLength(0);
  });

  it("answers whoami for both kinds of principal", async () => {
    expect((await call("GET", "whoami", { locals: admin("a1") })).body).toEqual({
      kind: "session",
      keyName: "admin-session",
      scopes: scopeSchema.options,
    });
    expect((await call("GET", "whoami", { bearer: token })).body).toEqual({
      kind: "key",
      keyName: "test",
      scopes: ["articles:read", "articles:write"],
    });
    expect((await call("GET", "whoami")).status).toBe(401);
  });

  it("namespaces idempotency per admin: the same Idempotency-Key from two admins does not collide", async () => {
    const first = await create({ locals: admin("a1"), key: "same" });
    const second = await create(
      { locals: admin("a2"), key: "same" },
      { externalId: "second-source", slug: "second-article" },
    );
    expect([first.status, second.status]).toEqual([201, 201]);
    expect(first.body.id).not.toBe(second.body.id);
    const stored = await state.db!.select().from(schema.contentApiRequests);
    expect(stored.map((row) => row.idempotencyKey).sort()).toEqual(
      [`${USER_IDS.a1}:same`, `${USER_IDS.a2}:same`].sort(),
    );
    // The same admin retrying still replays.
    const replay = await create({ locals: admin("a1"), key: "same" });
    expect(replay.body.id).toBe(first.body.id);
  });

  it("refuses publication with 503 when the admin-session row is missing or revoked", async () => {
    await state
      .db!.update(schema.contentApiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(schema.contentApiKeys.tokenHash, schema.ADMIN_SESSION_TOKEN_HASH));
    const revoked = await create({ locals: admin("a1") });
    expect(revoked.status).toBe(503);
    expect(revoked.body.error.code).toBe("admin_session_key_missing");
    await state
      .db!.delete(schema.contentApiKeys)
      .where(eq(schema.contentApiKeys.tokenHash, schema.ADMIN_SESSION_TOKEN_HASH));
    expect((await create({ locals: admin("a1") })).body.error.code).toBe(
      "admin_session_key_missing",
    );
  });

  it("ignores the scope list stored on the admin-session row: a session holds every scope, the worker agrees", async () => {
    await state
      .db!.update(schema.contentApiKeys)
      .set({ scopes: ["articles:read"] })
      .where(eq(schema.contentApiKeys.tokenHash, schema.ADMIN_SESSION_TOKEN_HASH));
    const whoami = await call("GET", "whoami", { locals: admin("a1") });
    expect(whoami.body.scopes).toEqual(scopeSchema.options);
    const queued = await call("POST", "articles", {
      locals: admin("a1"),
      origin: "https://artka.dev",
      key: "pub",
      body: { article: document, mode: "publish" },
    });
    expect(queued.status).toBe(202);
    // The job's key is the same row, now with a reduced list: the worker must not call it revoked.
    const step = await processPublication();
    expect(step).toMatchObject({ worked: true });
    expect(step).not.toHaveProperty("error");
    const [job] = await state.db!.select().from(schema.contentPublications);
    expect([job?.state, job?.error]).toEqual(["publishing", null]);
  });

  it("a revoked admin-session row still fails its queued job with key_revoked", async () => {
    const queued = await call("POST", "articles", {
      locals: admin("a1"),
      origin: "https://artka.dev",
      key: "pub3",
      body: { article: document, mode: "publish" },
    });
    expect(queued.status).toBe(202);
    await state
      .db!.update(schema.contentApiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(schema.contentApiKeys.tokenHash, schema.ADMIN_SESSION_TOKEN_HASH));
    expect(await processPublication()).toMatchObject({ worked: true, error: "key_revoked" });
  });

  it("names the admin as provenance agent when a session omits it, and keeps the externalId default", async () => {
    const { externalId: _e, provenance: _p, ...bare } = document;
    const result = await call("POST", "articles", {
      locals: admin("a1"),
      origin: "https://artka.dev",
      key: "bare",
      body: { article: bare },
    });
    expect(result.status).toBe(201);
    expect(result.body.article).toMatchObject({
      externalId: document.slug,
      provenance: { agent: "admin" },
    });
  });

  describe("/keys", () => {
    const session = (method: string, path: string, body?: unknown, who: "a1" | "a2" = "a1") =>
      call(method, path, { locals: admin(who), origin: "https://artka.dev", body });
    const issue = async (scopes: string[], name = "agent-key") => {
      const result = await session("POST", "keys", { name, scopes });
      expect(result.status).toBe(201);
      return createdKeySchema.parse(result.body);
    };

    it("answers a Bearer key 403 key_cannot_manage_keys on every /keys route and changes nothing", async () => {
      const before = await state.db!.select().from(schema.contentApiKeys);
      const [target] = before;
      const attempts = [
        call("GET", "keys", { bearer: token }),
        call("POST", "keys", {
          bearer: token,
          body: { name: "sneaky", scopes: ["articles:read"] },
        }),
        call("DELETE", `keys/${target!.id}`, { bearer: token }),
      ];
      for (const result of await Promise.all(attempts)) {
        expect(result.status).toBe(403);
        expect(result.body.error.code).toBe("key_cannot_manage_keys");
      }
      const after = await state.db!.select().from(schema.contentApiKeys);
      expect(after.map((row) => [row.id, row.revokedAt])).toEqual(
        before.map((row) => [row.id, row.revokedAt]),
      );
    });

    it("returns the token once; the issued token works and the list never shows it or any hash", async () => {
      const created = await issue(["articles:read"]);
      expect(created.token).toMatch(/^artka_[A-Za-z0-9_-]{43}$/);
      const whoami = await call("GET", "whoami", { bearer: created.token });
      expect(whoami.body).toMatchObject({ kind: "key", keyName: "agent-key" });
      const list = await session("GET", "keys");
      const parsed = keyListSchema.parse(list.body);
      expect(parsed.items.map((item) => item.name).sort()).toEqual(["agent-key", "test"]);
      const text = JSON.stringify(list.body);
      expect(text).not.toContain(created.token);
      expect(text).not.toContain("tokenHash");
      expect(text).not.toContain(schema.ADMIN_SESSION_TOKEN_HASH);
      expect(text).not.toContain(schema.ADMIN_SESSION_KEY_NAME);
    });

    it("issues any scope, including the social ones, and refuses reserved names and unknown scopes", async () => {
      const social = await issue(["social:read", "social:write", "social:publish"], "social-key");
      expect(social.scopes).toEqual(["social:read", "social:write", "social:publish"]);
      expect(
        (await session("POST", "keys", { name: "Admin", scopes: ["articles:read"] })).status,
      ).toBe(422);
      expect((await session("POST", "keys", { name: "k", scopes: ["keys:manage"] })).status).toBe(
        422,
      );
      expect(await state.db!.select().from(schema.contentApiKeys)).toHaveLength(3);
    });

    it("revokes without deleting: the token stops working, the row stays, a repeat is unchanged", async () => {
      const created = await issue(["articles:read"]);
      const revoked = await session("DELETE", `keys/${created.id}`);
      expect([revoked.status, revoked.body.unchanged, typeof revoked.body.revokedAt]).toEqual([
        200,
        false,
        "string",
      ]);
      expect((await call("GET", "whoami", { bearer: created.token })).status).toBe(401);
      const again = await session("DELETE", `keys/${created.id}`);
      expect([again.status, again.body.unchanged]).toEqual([200, true]);
      const listed = keyListSchema.parse((await session("GET", "keys")).body);
      expect(listed.items.find((item) => item.id === created.id)?.revokedAt).not.toBeNull();
      const missing = await session("DELETE", "keys/5d1a0c52-3a0f-4a53-a0e0-8a2e4d6b7f10");
      expect([missing.status, missing.body.error.code]).toEqual([404, "not_found"]);
    });

    it("cannot revoke the admin-session key: 403 system_key_protected and sessions keep working", async () => {
      const row = await adminSessionRow();
      const result = await session("DELETE", `keys/${row!.id}`);
      expect([result.status, result.body.error.code]).toEqual([403, "system_key_protected"]);
      expect((await adminSessionRow())?.revokedAt).toBeNull();
      expect((await session("GET", "whoami")).status).toBe(200);
    });
  });
});
