import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { APIContext } from "astro";
import type { Database } from "../../src/lib/db";
import * as schema from "../../src/lib/db/schema";

const state = vi.hoisted(() => ({ db: undefined as Database | undefined }));
vi.mock("~/lib/db", () => ({
  get db() {
    return state.db;
  },
}));
const remote = vi.hoisted(() => ({
  content: null as string | null,
  commits: 0,
  live: "",
  sitemap: "",
}));
vi.mock("../../src/lib/content-api/github", async (original) => ({
  ...(await original<typeof import("../../src/lib/content-api/github")>()),
  readRemoteArticle: vi.fn(async () => ({
    content: remote.content,
    hash:
      remote.content === null ? null : createHash("sha256").update(remote.content).digest("hex"),
  })),
  commitArticle: vi.fn(async (_path: string, content: string, expected: string | null) => {
    if (remote.content === content) return "commit-1";
    const actual =
      remote.content === null ? null : createHash("sha256").update(remote.content).digest("hex");
    if (actual !== expected)
      throw Object.assign(new Error("Remote changed"), {
        status: 409,
        code: "remote_edit_conflict",
      });
    remote.content = content;
    remote.commits++;
    return `commit-${remote.commits}`;
  }),
}));

import { ALL } from "../../src/pages/api/v1/[...path]";
import { processPublication } from "../../src/lib/content-api/worker";
import { commitArticle } from "../../src/lib/content-api/github";

const token = `artka_${"a".repeat(43)}`;
const document = {
  externalId: "integration-source",
  lang: "ru",
  slug: "integration-content-api",
  title: "Integration API article",
  description: "Description of the API integration test publication.",
  summary:
    "This article tests durable publication, version conflicts and the complete API request lifecycle.",
  body: "## An example\n\nAn original explanation with useful details and $x^2$.",
  tags: ["ai"],
  sources: [{ url: "https://example.com/source", title: "Original source" }],
  provenance: { agent: "integration" },
};
const call = async (
  method: string,
  path: string,
  body?: unknown,
  key = "request-1",
  bearer = token,
) => {
  const response = await ALL({
    params: { path },
    request: new Request(`https://artka.dev/api/v1/${path}`, {
      method,
      headers: {
        authorization: `Bearer ${bearer}`,
        "content-type": "application/json",
        "idempotency-key": key,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  } as APIContext);
  return { status: response.status, body: await response.json() };
};

describe("content API with PostgreSQL", () => {
  let container: StartedPostgreSqlContainer;
  let client: ReturnType<typeof postgres>;
  let keyId: string;
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18-bookworm").start();
    client = postgres(container.getConnectionUri(), { max: 5 });
    state.db = drizzle(client, { schema });
    await migrate(state.db, { migrationsFolder: "drizzle" });
    await migrate(state.db, { migrationsFolder: "drizzle" }); // Same path as production, safe on restart.
    vi.stubEnv("SITE_URL", "https://artka.dev");
    vi.stubEnv("GITHUB_PAT", "fake-for-tests");
  }, 180_000);
  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await client?.end();
    await container?.stop();
  });
  beforeEach(async () => {
    await client`truncate content_api_requests, content_publications, content_articles, content_assets, content_api_keys, post_revisions, posts_meta, users cascade`;
    const [key] = await state
      .db!.insert(schema.contentApiKeys)
      .values({
        name: "test",
        tokenHash: createHash("sha256").update(token).digest("hex"),
        scopes: ["articles:read", "articles:write", "articles:publish", "media:write"],
      })
      .returning();
    keyId = key!.id;
    remote.content = null;
    remote.commits = 0;
    remote.live = "";
    remote.sitemap = "";
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) =>
        String(url).includes("sitemap-")
          ? new Response(remote.sitemap, { headers: { "content-type": "application/xml" } })
          : new Response(remote.live, { headers: { "content-type": "text/html" } }),
      ),
    );
  });
  const make = async (mode = "draft") => {
    const result = await call("POST", "articles", { article: document, mode });
    expect(result.status).toBe(mode === "draft" ? 201 : 202);
    return result.body;
  };
  const due = async () => {
    await client`update content_publications set next_attempt_at = now() - interval '1 second'`;
  };

  it("authenticates, enforces scopes, revocation and the rate limit", async () => {
    expect((await call("POST", "articles", { article: document }, "x", "bad")).status).toBe(401);
    await state
      .db!.update(schema.contentApiKeys)
      .set({ scopes: ["articles:read"] })
      .where(eq(schema.contentApiKeys.id, keyId));
    expect((await call("POST", "articles", { article: document })).status).toBe(403);
    await state
      .db!.update(schema.contentApiKeys)
      .set({ scopes: ["articles:write"], windowCount: 60 })
      .where(eq(schema.contentApiKeys.id, keyId));
    expect((await call("POST", "articles", { article: document })).status).toBe(429);
    await state
      .db!.update(schema.contentApiKeys)
      .set({ windowCount: 0, revokedAt: new Date() })
      .where(eq(schema.contentApiKeys.id, keyId));
    expect((await call("POST", "articles", { article: document })).status).toBe(401);
  });
  it("validates without saving and rejects unknown media", async () => {
    expect((await call("POST", "articles/validate", { article: document })).status).toBe(200);
    expect(await state.db!.select().from(schema.contentArticles)).toHaveLength(0);
    expect(
      (
        await call("POST", "articles", {
          article: {
            ...document,
            cover: { assetId: "349ad05b-41ae-4b63-93ab-d7679c82c886", alt: "Cover" },
          },
        })
      ).status,
    ).toBe(422);
  });
  it("saves one draft across concurrent retries and detects key reuse with different content", async () => {
    const results = await Promise.all([make(), make()]);
    expect(results[0].id).toBe(results[1].id);
    expect(await state.db!.select().from(schema.contentArticles)).toHaveLength(1);
    expect(await state.db!.select().from(schema.contentPublications)).toHaveLength(0);
    expect(
      (await call("POST", "articles", { article: { ...document, title: "Changed title" } })).body
        .error.code,
    ).toBe("idempotency_conflict");
    expect((await call("POST", "articles", { article: document }, "different-key")).status).toBe(
      409,
    );
  });
  it("rejects stale versions and identity changes; translations share slug and externalId", async () => {
    const article = await make();
    const input = { article: { ...document, title: "Updated title" }, expectedVersion: 1 };
    const updated = await call("PUT", `articles/${article.id}`, input, "update");
    expect(updated.body.version).toBe(2);
    expect((await call("PUT", `articles/${article.id}`, input, "stale")).body.error.code).toBe(
      "version_conflict",
    );
    expect(
      (
        await call(
          "PUT",
          `articles/${article.id}`,
          { ...input, expectedVersion: 2, article: { ...document, slug: "renamed" } },
          "rename",
        )
      ).status,
    ).toBe(409);
    expect(
      (await call("POST", "articles", { article: { ...document, lang: "en" } }, "english")).status,
    ).toBe(201);
    expect(
      (
        await call(
          "POST",
          "articles",
          { article: { ...document, lang: "en", slug: "wrong-twin" } },
          "bad-english",
        )
      ).status,
    ).toBe(409);
  });
  it("requires reconciliation of manual edits and blocks saves during publication", async () => {
    const article = await make();
    const [user] = await state
      .db!.insert(schema.users)
      .values({ email: "manual@test.local" })
      .returning();
    const [revision] = await state
      .db!.insert(schema.postRevisions)
      .values({ slug: document.slug, frontmatter: {}, body: "Manual edit", authorId: user!.id })
      .returning();
    const update = { article: document, expectedVersion: 1 };
    expect(
      (await call("PUT", `articles/${article.id}`, update, "stale-manual")).body.error.code,
    ).toBe("manual_edit_conflict");
    const read = await call("GET", `articles/${article.id}`);
    expect(read.body.manualRevision.body).toBe("Manual edit");
    expect(
      (
        await call(
          "PUT",
          `articles/${article.id}`,
          { ...update, acknowledgedManualRevisionId: revision!.id, mode: "publish" },
          "merged",
        )
      ).status,
    ).toBe(202);
    await expect(
      state
        .db!.insert(schema.postRevisions)
        .values({ slug: document.slug, frontmatter: {}, body: "Too late", authorId: user!.id }),
    ).rejects.toThrow();
  });
  it("confirms the exact deployed version and sitemap before reporting published", async () => {
    const article = await make("publish");
    expect(
      (
        await call(
          "PUT",
          `articles/${article.id}`,
          { article: document, expectedVersion: 1 },
          "busy",
        )
      ).status,
    ).toBe(409);
    await processPublication();
    expect(remote.commits).toBe(1);
    await due();
    await processPublication();
    expect((await call("GET", `publications/${article.publication.id}`)).body.state).toBe(
      "publishing",
    );
    remote.live = `<html><head><link rel="canonical" href="${article.url}"><meta name="description" content="Description"></head><article data-content-revision="${article.publication.id}"></article></html>`;
    await due();
    await processPublication();
    expect((await call("GET", `publications/${article.publication.id}`)).body.state).toBe(
      "publishing",
    );
    remote.sitemap = `<loc>${article.url}</loc>`;
    await due();
    await processPublication();
    expect((await call("GET", `publications/${article.publication.id}`)).body.state).toBe(
      "published",
    );
    expect((await call("GET", `articles/${article.id}`)).body.publishedVersion).toBe(1);
    expect(
      (
        await call(
          "POST",
          `articles/${article.id}/publish`,
          { expectedVersion: 1 },
          "already-published",
        )
      ).body.unchanged,
    ).toBe(true);
  });
  it("serialises concurrent workers and refuses remote overwrites", async () => {
    const article = await make("publish");
    remote.content = "Manually changed in GitHub";
    await Promise.all([processPublication(), processPublication()]);
    expect(remote.commits).toBe(0);
    expect((await call("GET", `publications/${article.publication.id}`)).body).toMatchObject({
      state: "failed",
      error: { code: "remote_edit_conflict" },
    });
  });
  it("resumes safely when a GitHub commit succeeds but the response is lost", async () => {
    await make("publish");
    const normal = vi.mocked(commitArticle).getMockImplementation()!;
    vi.mocked(commitArticle).mockImplementationOnce(async (...args) => {
      await normal(...args);
      throw new Error("connection reset after commit");
    });
    await processPublication();
    await due();
    await processPublication();
    expect(remote.commits).toBe(1);
    expect((await state.db!.select().from(schema.contentPublications))[0]?.state).toBe(
      "publishing",
    );
  });
  it("fails a timed-out deployment and retries with a fresh build marker", async () => {
    const article = await make("publish");
    await processPublication();
    await client`update content_publications set updated_at = now() - interval '31 minutes', next_attempt_at = now() - interval '1 second'`;
    await processPublication();
    expect((await call("GET", `publications/${article.publication.id}`)).body.state).toBe("failed");
    const retry = await call(
      "POST",
      `articles/${article.id}/publish`,
      { expectedVersion: 1 },
      "retry",
    );
    expect(retry.status).toBe(202);
    expect(retry.body.publication.id).not.toBe(article.publication.id);
    await processPublication();
    expect(remote.commits).toBe(2);
  });
  it("does not execute pending publications after revocation", async () => {
    await make("publish");
    await state
      .db!.update(schema.contentApiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(schema.contentApiKeys.id, keyId));
    await processPublication();
    expect(remote.commits).toBe(0);
    expect((await state.db!.select().from(schema.contentPublications))[0]?.error?.code).toBe(
      "key_revoked",
    );
  });
});
