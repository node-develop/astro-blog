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
vi.mock("../../src/lib/content-api/github", async (original) => {
  const actual = await original<typeof import("../../src/lib/content-api/github")>();
  return {
    ...actual,
    // The same contract as the real adapter: identical content is a recovery, a file at the path
    // is overwritten only for an article that owns it.
    commitArticle: vi.fn(
      async (
        _path: string,
        content: string,
        { overwrite, ownedRevisions = [] }: { overwrite: boolean; ownedRevisions?: string[] },
      ) => {
        if (remote.content === content) return "commit-1";
        const revision = remote.content === null ? null : actual.fileApiRevision(remote.content);
        const owns = overwrite || (revision !== null && ownedRevisions.includes(revision));
        if (remote.content !== null && !owns)
          throw Object.assign(new Error("Existing file"), { status: 409, code: "slug_conflict" });
        remote.content = content;
        remote.commits++;
        return `commit-${remote.commits}`;
      },
    ),
  };
});

import { articleDocumentSchema } from "../../src/lib/content-api/contract";
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
  } as unknown as APIContext);
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
  it("ignores manual revisions: a publish goes through and the read has no manual fields", async () => {
    const article = await make();
    const [user] = await state
      .db!.insert(schema.users)
      .values({ email: "manual@test.local" })
      .returning();
    await state
      .db!.insert(schema.postRevisions)
      .values({ slug: document.slug, frontmatter: {}, body: "Manual edit", authorId: user!.id });
    const saved = await call(
      "PUT",
      `articles/${article.id}`,
      { article: document, expectedVersion: 1, mode: "publish" },
      "publish-over-revision",
    );
    expect(saved.status).toBe(202);
    const read = (await call("GET", `articles/${article.id}`)).body;
    expect(read).not.toHaveProperty("manualRevision");
    expect(read).not.toHaveProperty("remote");
    // The database trigger stays until migration B: the admin cannot save during a publication.
    await expect(
      state
        .db!.insert(schema.postRevisions)
        .values({ slug: document.slug, frontmatter: {}, body: "Too late", authorId: user!.id }),
    ).rejects.toThrow();
  });
  it("rejects the fields removed from the update contract", async () => {
    const article = await make();
    const stale = await call(
      "PUT",
      `articles/${article.id}`,
      { article: document, expectedVersion: 1, acknowledgedManualRevisionId: 0 },
      "removed-field",
    );
    expect(stale.status).toBe(422);
  });
  it("lets exactly one of two concurrent writers with the same expectedVersion win", async () => {
    const article = await make();
    const put = (key: string, title: string) =>
      call(
        "PUT",
        `articles/${article.id}`,
        { article: { ...document, title }, expectedVersion: 1 },
        key,
      );
    const results = await Promise.all([put("writer-a", "Title A"), put("writer-b", "Title B")]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409)!.body.error.code).toBe("version_conflict");
    const [row] = await state.db!.select().from(schema.contentArticles);
    expect(row!.version).toBe(2);
  });
  it("confirms the exact deployed version and sitemap before reporting published", async () => {
    const article = await make("publish");
    const busy = await call(
      "PUT",
      `articles/${article.id}`,
      { article: document, expectedVersion: 1 },
      "busy",
    );
    expect(busy.status).toBe(409);
    expect(busy.body.error).toMatchObject({
      code: "publication_in_progress",
      details: { publicationId: article.publication.id },
    });
    const republish = await call(
      "POST",
      `articles/${article.id}/publish`,
      { expectedVersion: 1 },
      "busy-publish",
    );
    expect(republish.status).toBe(409);
    expect(republish.body.error.code).toBe("publication_in_progress");
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
  it("serialises concurrent workers: one commit for one publication", async () => {
    const article = await make("publish");
    await Promise.all([processPublication(), processPublication()]);
    expect(remote.commits).toBe(1);
    expect((await call("GET", `publications/${article.publication.id}`)).body.state).toBe(
      "publishing",
    );
  });
  it("never overwrites a file the article has not committed before", async () => {
    const article = await make("publish");
    remote.content = "A legacy post pushed to the same path";
    await processPublication();
    expect(remote.commits).toBe(0);
    expect(remote.content).toBe("A legacy post pushed to the same path");
    expect((await call("GET", `publications/${article.publication.id}`)).body).toMatchObject({
      state: "failed",
      error: { code: "slug_conflict" },
    });
  });
  it("overwrites a reformatted file once the article has been committed before", async () => {
    const article = await make("publish");
    await processPublication();
    await client`update content_publications set updated_at = now() - interval '31 minutes', next_attempt_at = now() - interval '1 second'`;
    await processPublication();
    expect((await call("GET", `publications/${article.publication.id}`)).body.state).toBe("failed");
    remote.content = "---\ntitle: 'reformatted by prettier'\n---\n";
    const retry = await call(
      "POST",
      `articles/${article.id}/publish`,
      { expectedVersion: 1 },
      "retry-reformatted",
    );
    await processPublication();
    expect(remote.commits).toBe(2);
    expect(remote.content).not.toContain("reformatted by prettier");
    expect((await call("GET", `publications/${retry.body.publication.id}`)).body.state).toBe(
      "publishing",
    );
  });
  it("overwrites the file of an already published article even without an earlier commit row", async () => {
    const article = await make("publish");
    await state.db!.update(schema.contentArticles).set({ publishedVersion: 1 });
    remote.content = "Reformatted copy of the live article";
    await processPublication();
    expect(remote.commits).toBe(1);
    expect((await call("GET", `publications/${article.publication.id}`)).body.state).toBe(
      "publishing",
    );
  });
  it("checks related slugs against the database first and the legacy files second", async () => {
    const validate = (relatedSlugs: string[]) =>
      call("POST", "articles/validate", { article: { ...document, relatedSlugs } }, "related");
    // A legacy file post that has no row in the database.
    expect((await validate(["json-ld-graph-astro"])).status).toBe(200);
    expect((await validate(["no-such-article"])).status).toBe(422);
    const draft = await call(
      "POST",
      "articles",
      { article: { ...document, externalId: "related-draft", slug: "related-draft" } },
      "related-draft",
    );
    const rejected = await validate(["related-draft"]);
    expect(rejected.status).toBe(422);
    expect(rejected.body.error.code).toBe("invalid_related_article");
    await state
      .db!.update(schema.contentArticles)
      .set({ publishedVersion: 1 })
      .where(eq(schema.contentArticles.id, draft.body.id));
    expect((await validate(["related-draft"])).status).toBe(200);
    // A row wins over the file: an unpublished row hides a published file with the same slug.
    await state.db!.insert(schema.contentArticles).values({
      document: articleDocumentSchema.parse({ ...document, slug: "json-ld-graph-astro" }),
      externalId: "shadow",
      slug: "json-ld-graph-astro",
      lang: "ru",
      keyId,
    });
    expect((await validate(["json-ld-graph-astro"])).status).toBe(422);
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
  it("recovers an article whose only commit was accepted by GitHub but never recorded", async () => {
    const article = await make("publish");
    const normal = vi.mocked(commitArticle).getMockImplementation()!;
    vi.mocked(commitArticle).mockImplementation(async (...args) => {
      await normal(...args);
      throw new Error("connection reset after commit");
    });
    await client`update content_publications set attempts = 4`;
    await processPublication();
    vi.mocked(commitArticle).mockImplementation(normal);
    const failed = (await call("GET", `publications/${article.publication.id}`)).body;
    expect(failed.state).toBe("failed");
    expect(failed.commitSha ?? null).toBeNull();
    expect(remote.content).toContain(article.publication.id);
    const retry = await call(
      "POST",
      `articles/${article.id}/publish`,
      { expectedVersion: 1 },
      "retry-lost",
    );
    await processPublication();
    expect((await call("GET", `publications/${retry.body.publication.id}`)).body.state).toBe(
      "publishing",
    );
    expect(remote.content).toContain(retry.body.publication.id);
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
  it("a publication waiting for its next attempt does not block the one queued behind it", async () => {
    const first = await make("publish");
    const second = await call(
      "POST",
      "articles",
      {
        article: { ...document, externalId: "integration-second", slug: "integration-second" },
        mode: "publish",
      },
      "second",
    );
    expect(second.status).toBe(202);
    await state
      .db!.update(schema.contentPublications)
      .set({ nextAttemptAt: new Date(Date.now() + 60 * 60_000) })
      .where(eq(schema.contentPublications.id, first.publication.id));
    expect(await processPublication()).toMatchObject({
      worked: true,
      publicationId: second.body.publication.id,
    });
    expect((await call("GET", `publications/${second.body.publication.id}`)).body.state).toBe(
      "publishing",
    );
    expect((await call("GET", `publications/${first.publication.id}`)).body.state).toBe("queued");
    expect(remote.commits).toBe(1);
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
