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
  deletes: 0,
  /** The page body; `null` is a 404. */
  live: "" as string | null,
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
    // Same contract as the real adapter: a missing file is a recovery, a foreign file is refused.
    deleteArticle: vi.fn(
      async (
        _path: string,
        { overwrite, ownedRevisions = [] }: { overwrite: boolean; ownedRevisions?: string[] },
      ) => {
        if (remote.content === null) return "parent";
        const revision = actual.fileApiRevision(remote.content);
        const owns = overwrite || (revision !== null && ownedRevisions.includes(revision));
        if (!owns)
          throw Object.assign(new Error("Existing file"), { status: 409, code: "slug_conflict" });
        remote.content = null;
        remote.deletes++;
        return `delete-${remote.deletes}`;
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
  extra: Record<string, string> = {},
) => {
  const response = await ALL({
    params: { path },
    request: new Request(`https://artka.dev/api/v1/${path}`, {
      method,
      headers: {
        authorization: `Bearer ${bearer}`,
        "content-type": "application/json",
        "idempotency-key": key,
        ...extra,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  } as unknown as APIContext);
  return {
    status: response.status,
    body: await response.json(),
    headers: response.headers,
  };
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
    remote.deletes = 0;
    remote.live = "";
    remote.sitemap = "";
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) =>
        String(url).includes("sitemap-")
          ? new Response(remote.sitemap, { headers: { "content-type": "application/xml" } })
          : remote.live === null
            ? new Response("", { status: 404 })
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

  // ── Prompt 1.5: versions, restore, delete, unpublish, batch, status ──────────────────────────
  const liveHtml = (url: string, revision: string) =>
    `<html><head><link rel="canonical" href="${url}"><meta name="description" content="Description"></head><article data-content-revision="${revision}"></article></html>`;
  const sitemapOf = (...urls: string[]) =>
    `<?xml version="1.0"?><urlset>${urls.map((u) => `<url><loc>${u}</loc></url>`).join("")}</urlset>`;
  const OTHER_URL = "https://artka.dev/blog/some-other-post/";
  /** Runs one publication through commit, live page and sitemap to `published`. */
  const goLive = async (url: string, publicationId: string) => {
    await processPublication();
    remote.live = liveHtml(url, publicationId);
    remote.sitemap = sitemapOf(url, OTHER_URL);
    await due();
    await processPublication();
  };
  const publishedArticle = async () => {
    const article = await make("publish");
    await goLive(article.url, article.publication.id);
    const read = (await call("GET", `articles/${article.id}`)).body;
    expect(read.status).toBe("published");
    return { ...article, version: read.version as number };
  };
  const versionRows = (articleId: string) =>
    state
      .db!.select()
      .from(schema.contentArticleVersions)
      .where(eq(schema.contentArticleVersions.articleId, articleId))
      .orderBy(schema.contentArticleVersions.version);
  const publicationRows = () => state.db!.select().from(schema.contentPublications);
  const articleRow = async (id: string) =>
    (
      await state.db!.select().from(schema.contentArticles).where(eq(schema.contentArticles.id, id))
    )[0]!;
  const makeEnglish = async () => {
    const result = await call(
      "POST",
      "articles",
      { article: { ...document, lang: "en" } },
      "english",
    );
    expect(result.status).toBe(201);
    return result.body;
  };

  it("writes a version row with the actor for every save and exposes status", async () => {
    const created = await make();
    expect(created).toMatchObject({ status: "draft", state: "draft" });
    const updated = await call(
      "PUT",
      `articles/${created.id}`,
      { article: { ...document, title: "Second title" }, expectedVersion: 1 },
      "put-1",
    );
    expect(updated.body).toMatchObject({ status: "draft", version: 2 });
    const rows = await versionRows(created.id);
    expect(rows.map((r) => [r.version, r.document.title, r.actorKeyId, r.actorUserId])).toEqual([
      [1, "Integration API article", keyId, null],
      [2, "Second title", keyId, null],
    ]);
    const read = await call("GET", `articles/${created.id}`);
    expect(read.body.status).toBe("draft");
    expect(read.headers.get("etag")).toBe('"2"');
  });

  it("reports publishing in the 202 bodies of create, update, publish and unpublish", async () => {
    const created = await make("publish");
    expect(created.status).toBe("publishing");
    expect(created.publication.kind).toBe("publish");
    await goLive(created.url, created.publication.id);
    const put = await call(
      "PUT",
      `articles/${created.id}`,
      { article: { ...document, title: "Changed" }, expectedVersion: 1 },
      "put-changed",
    );
    expect(put.body.status).toBe("changed");
    const publish = await call(
      "POST",
      `articles/${created.id}/publish`,
      { expectedVersion: 2 },
      "publish-2",
    );
    expect([publish.status, publish.body.status]).toEqual([202, "publishing"]);
    expect((await call("GET", `articles/${created.id}`)).body.status).toBe("publishing");
    await state.db!.update(schema.contentPublications).set({ state: "failed" });
    expect((await call("GET", `articles/${created.id}`)).body.status).toBe("failed");
    const putPublish = await call(
      "PUT",
      `articles/${created.id}`,
      { article: { ...document, title: "Changed again" }, expectedVersion: 2, mode: "publish" },
      "put-publish",
    );
    expect([putPublish.status, putPublish.body.status]).toEqual([202, "publishing"]);
  });

  it("restores an old version as a new one, with the actor, and keeps the history", async () => {
    const created = await make();
    await call(
      "PUT",
      `articles/${created.id}`,
      { article: { ...document, title: "Second title" }, expectedVersion: 1 },
      "put-1",
    );
    const restored = await call(
      "POST",
      `articles/${created.id}/versions/1/restore`,
      { expectedVersion: 2 },
      "restore-1",
    );
    expect(restored.status).toBe(200);
    expect(restored.body).toMatchObject({
      version: 3,
      restoredFrom: 1,
      status: "draft",
      article: { title: "Integration API article" },
    });
    const rows = await versionRows(created.id);
    expect(rows.map((r) => [r.version, r.document.title])).toEqual([
      [1, "Integration API article"],
      [2, "Second title"],
      [3, "Integration API article"],
    ]);
    expect(rows[2]!.actorKeyId).toBe(keyId);
    expect((await articleRow(created.id)).version).toBe(3);
    // Stale expectedVersion, a version that was never saved, and a gap in old history.
    expect(
      (
        await call(
          "POST",
          `articles/${created.id}/versions/1/restore`,
          { expectedVersion: 2 },
          "restore-stale",
        )
      ).body.error.code,
    ).toBe("version_conflict");
    const missing = await call(
      "POST",
      `articles/${created.id}/versions/9/restore`,
      { expectedVersion: 3 },
      "restore-missing",
    );
    expect(missing.status).toBe(404);
    expect(missing.body.error.details).toEqual({ version: 9, currentVersion: 3 });
    await client`delete from content_article_versions where version = 2`;
    expect(
      (
        await call(
          "POST",
          `articles/${created.id}/versions/2/restore`,
          { expectedVersion: 3 },
          "restore-gap",
        )
      ).status,
    ).toBe(404);
    // A stored document that the contract no longer accepts is refused, not repaired.
    await client`update content_article_versions set document = document - 'sources' where version = 1`;
    const incompatible = await call(
      "POST",
      `articles/${created.id}/versions/1/restore`,
      { expectedVersion: 3 },
      "restore-old",
    );
    expect([incompatible.status, incompatible.body.error.code]).toEqual([
      422,
      "version_incompatible",
    ]);
  });

  it("deletes a draft together with its failed publication and history", async () => {
    const article = await make("publish");
    remote.content = "A legacy post pushed to the same path";
    await processPublication(); // slug_conflict: failed, nothing committed.
    expect((await publicationRows())[0]).toMatchObject({ state: "failed", commitSha: null });
    const deleted = await call("DELETE", `articles/${article.id}`, undefined, "d", token, {
      "if-match": '"1"',
    });
    expect([deleted.status, deleted.body]).toEqual([200, { id: article.id, deleted: true }]);
    expect(await state.db!.select().from(schema.contentArticles)).toHaveLength(0);
    expect(await publicationRows()).toHaveLength(0);
    expect(await versionRows(article.id)).toHaveLength(0);
    expect((await call("GET", `articles/${article.id}`)).status).toBe(404);
  });

  it("checks If-Match before deleting and refuses articles that are or were public", async () => {
    const draft = await make();
    const del = (id: string, ifMatch?: string) =>
      call(
        "DELETE",
        `articles/${id}`,
        undefined,
        "d",
        token,
        ifMatch ? { "if-match": ifMatch } : {},
      );
    expect((await del(draft.id)).status).toBe(428);
    expect((await del(draft.id, "*")).status).toBe(400);
    const stale = await del(draft.id, '"7"');
    expect([stale.status, stale.body.error.code, stale.body.error.details]).toEqual([
      412,
      "precondition_failed",
      { version: 1 },
    ]);
    expect(await state.db!.select().from(schema.contentArticles)).toHaveLength(1);
    // Published.
    await state.db!.update(schema.contentArticles).set({ publishedVersion: 1 });
    const published = await del(draft.id, '"1"');
    expect([published.status, published.body.error.code]).toEqual([409, "unpublish_first"]);
    // Went live once and was unpublished: the history stays.
    await state
      .db!.update(schema.contentArticles)
      .set({ publishedVersion: null, firstPublishedAt: new Date(), unpublishedAt: new Date() });
    const was = await del(draft.id, '"1"');
    expect([was.status, was.body.error.code]).toEqual([409, "was_published"]);
    expect(await state.db!.select().from(schema.contentArticles)).toHaveLength(1);
  });

  it("refuses to delete a draft whose file is already in git, and an active publication", async () => {
    const article = await make("publish");
    const del = () =>
      call("DELETE", `articles/${article.id}`, undefined, "d", token, { "if-match": '"1"' });
    await processPublication(); // The commit lands.
    expect((await del()).body.error.code).toBe("publication_in_progress");
    await state.db!.update(schema.contentPublications).set({ state: "failed" });
    const refused = await del();
    expect([refused.status, refused.body.error.code]).toEqual([409, "unpublish_first"]);
    expect(await state.db!.select().from(schema.contentArticles)).toHaveLength(1);
    // Unpublishing the stray file frees the draft for deletion.
    const unpublish = await call(
      "POST",
      `articles/${article.id}/unpublish`,
      { expectedVersion: 1 },
      "stray",
    );
    expect(unpublish.status).toBe(202);
    await processPublication();
    remote.live = null;
    remote.sitemap = sitemapOf(OTHER_URL);
    await due();
    await processPublication();
    expect(remote.content).toBeNull();
    expect((await del()).status).toBe(200);
  });

  it("unpublishes end to end: page and sitemap must both be clear, then a republication restores it", async () => {
    const article = await publishedArticle();
    const queued = await call(
      "POST",
      `articles/${article.id}/unpublish`,
      { expectedVersion: 1 },
      "unpublish",
    );
    expect(queued.status).toBe(202);
    expect(queued.body).toMatchObject({ status: "publishing", publication: { kind: "unpublish" } });
    const unpublishId = queued.body.publication.id;
    const state_ = async () => (await call("GET", `publications/${unpublishId}`)).body;
    // The file goes away in a commit; the page still answers 200.
    await processPublication();
    expect(remote.deletes).toBe(1);
    expect(remote.content).toBeNull();
    expect(await state_()).toMatchObject({ state: "publishing", kind: "unpublish" });
    await due();
    await processPublication();
    expect((await state_()).state).toBe("publishing");
    // The page is gone but the sitemap still lists it.
    remote.live = null;
    remote.sitemap = sitemapOf(article.url, OTHER_URL);
    await due();
    await processPublication();
    expect((await state_()).state).toBe("publishing");
    // An empty sitemap proves nothing.
    remote.sitemap = "";
    await due();
    await processPublication();
    expect((await state_()).state).toBe("publishing");
    remote.sitemap = sitemapOf(OTHER_URL);
    await due();
    await processPublication();
    expect((await state_()).state).toBe("published");
    const after = await call("GET", `articles/${article.id}`);
    expect(after.body).toMatchObject({ status: "unpublished", publishedVersion: null });
    const row = await articleRow(article.id);
    expect(row.unpublishedAt).not.toBeNull();
    expect(row.publishedContent).toBeNull();
    expect(row.firstPublishedAt).not.toBeNull();
    const [unpublishRow] = (await publicationRows()).filter((p) => p.id === unpublishId);
    expect(unpublishRow!.hooksDoneAt).not.toBeNull();
    // A second unpublish has nothing to do; a draft cannot be unpublished.
    const again = await call(
      "POST",
      `articles/${article.id}/unpublish`,
      { expectedVersion: 1 },
      "unpublish-again",
    );
    expect([again.status, again.body.unchanged]).toEqual([200, true]);
    const draft = await call(
      "POST",
      "articles",
      { article: { ...document, externalId: "other", slug: "other-draft" } },
      "other-draft",
    );
    const notPublished = await call(
      "POST",
      `articles/${draft.body.id}/unpublish`,
      { expectedVersion: 1 },
      "unpublish-draft",
    );
    expect([notPublished.status, notPublished.body.error.code]).toEqual([409, "not_published"]);
    // Publishing again clears unpublishedAt once the new version is live.
    const republish = await call(
      "POST",
      `articles/${article.id}/publish`,
      { expectedVersion: 1 },
      "republish",
    );
    expect(republish.status).toBe(202);
    expect((await articleRow(article.id)).unpublishedAt).not.toBeNull();
    await goLive(article.url, republish.body.publication.id);
    expect((await articleRow(article.id)).unpublishedAt).toBeNull();
    expect((await call("GET", `articles/${article.id}`)).body).toMatchObject({
      status: "published",
      publishedVersion: 1,
    });
  });

  it("lets POST /publish restore a page whose unpublish failed after its commit", async () => {
    const article = await publishedArticle();
    await call("POST", `articles/${article.id}/unpublish`, { expectedVersion: 1 }, "unpublish");
    await processPublication();
    expect(remote.content).toBeNull();
    // The page never disappears: the unpublish times out and fails; publishedVersion is intact.
    await client`update content_publications set updated_at = now() - interval '31 minutes', next_attempt_at = now() - interval '1 second' where kind = 'unpublish'`;
    await processPublication();
    expect((await call("GET", `articles/${article.id}`)).body).toMatchObject({
      status: "failed",
      publishedVersion: 1,
    });
    const retry = await call(
      "POST",
      `articles/${article.id}/publish`,
      { expectedVersion: 1 },
      "restore-page",
    );
    expect([retry.status, retry.body.unchanged]).toEqual([202, undefined]);
    await processPublication();
    expect(remote.content).toContain(retry.body.publication.id);
  });

  it("will not unpublish an article that a published article links to", async () => {
    const target = await publishedArticle();
    const linking = await call(
      "POST",
      "articles",
      {
        article: {
          ...document,
          externalId: "linking",
          slug: "linking-article",
          relatedSlugs: [document.slug],
        },
      },
      "linking",
    );
    expect(linking.status).toBe(201);
    const unpublish = () =>
      call("POST", `articles/${target.id}/unpublish`, { expectedVersion: 1 }, "u-related");
    // A draft does not count: only published articles carry a committed link.
    expect((await unpublish()).status).toBe(202);
    await state
      .db!.update(schema.contentPublications)
      .set({ state: "failed" })
      .where(eq(schema.contentPublications.kind, "unpublish"));
    // Published, but its live Markdown does not link (the draft does): nothing would die.
    await state
      .db!.update(schema.contentArticles)
      .set({ publishedVersion: 1, publishedContent: "# live, no links" })
      .where(eq(schema.contentArticles.id, linking.body.id));
    expect((await unpublish()).status).toBe(202);
    await state
      .db!.update(schema.contentPublications)
      .set({ state: "failed" })
      .where(eq(schema.contentPublications.kind, "unpublish"));
    // The live Markdown carries the hard link, whatever the current draft says.
    await state
      .db!.update(schema.contentArticles)
      .set({ publishedContent: `- [x](/blog/${document.slug}/)` })
      .where(eq(schema.contentArticles.id, linking.body.id));
    await client`update content_articles set document = jsonb_set(document, '{relatedSlugs}', '[]') where id = ${linking.body.id}`;
    const refused = await call(
      "POST",
      `articles/${target.id}/unpublish`,
      { expectedVersion: 1 },
      "u-related-2",
    );
    expect([refused.status, refused.body.error.code]).toEqual([409, "referenced_by_related"]);
    expect(refused.body.error.details).toEqual({ articleIds: [linking.body.id] });
  });

  it("publishes a ru/en pair in one batch with one batch id, ru first", async () => {
    const ru = await make();
    const en = await makeEnglish();
    const result = await call(
      "POST",
      "publish",
      {
        items: [
          { id: en.id, expectedVersion: 1 },
          { id: ru.id, expectedVersion: 1 },
        ],
      },
      "batch",
    );
    expect(result.status).toBe(202);
    expect(result.body.items.map((i: { id: string }) => i.id)).toEqual([ru.id, en.id]);
    expect(result.body.items.map((i: { status: string }) => i.status)).toEqual([
      "publishing",
      "publishing",
    ]);
    const rows = await publicationRows();
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.batchId))).toEqual(new Set([result.body.batchId]));
    expect(result.body.batchId).toEqual(expect.any(String));
    const [first, second] = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    expect([first!.articleId, second!.articleId]).toEqual([ru.id, en.id]);
    // The same key replays the same answer.
    const replay = await call(
      "POST",
      "publish",
      {
        items: [
          { id: en.id, expectedVersion: 1 },
          { id: ru.id, expectedVersion: 1 },
        ],
      },
      "batch",
    );
    expect(replay.body.batchId).toBe(result.body.batchId);
    expect(await publicationRows()).toHaveLength(2);
  });

  it("rejects a batch of different slugs, stale versions and a failing item without leaving rows", async () => {
    const ru = await make();
    const en = await makeEnglish();
    const other = await call(
      "POST",
      "articles",
      { article: { ...document, externalId: "other", slug: "other-slug" } },
      "other",
    );
    const mismatch = await call(
      "POST",
      "publish",
      {
        items: [
          { id: ru.id, expectedVersion: 1 },
          { id: other.body.id, expectedVersion: 1 },
        ],
      },
      "mismatch",
    );
    expect([mismatch.status, mismatch.body.error.code]).toEqual([422, "batch_slug_mismatch"]);
    expect(mismatch.body.error.details.slugs.sort()).toEqual([document.slug, "other-slug"].sort());
    const stale = await call(
      "POST",
      "publish",
      {
        items: [
          { id: ru.id, expectedVersion: 1 },
          { id: en.id, expectedVersion: 5 },
        ],
      },
      "stale",
    );
    expect([stale.status, stale.body.error.details]).toEqual([409, { id: en.id, version: 1 }]);
    // The second item fails while it is queued: the first item's row must roll back with it.
    await client`update content_articles set document = jsonb_set(document, '{relatedSlugs}', '["no-such-article"]') where lang = 'en'`;
    const failing = await call(
      "POST",
      "publish",
      {
        items: [
          { id: ru.id, expectedVersion: 1 },
          { id: en.id, expectedVersion: 1 },
        ],
      },
      "failing",
    );
    expect([failing.status, failing.body.error.code]).toEqual([422, "invalid_related_article"]);
    expect(await publicationRows()).toHaveLength(0);
  });

  it("skips unchanged batch items and answers 200 when nothing is queued", async () => {
    const ru = await make();
    const en = await makeEnglish();
    await client`update content_articles set published_version = 1 where lang = 'ru'`;
    const items = [
      { id: ru.id, expectedVersion: 1 },
      { id: en.id, expectedVersion: 1 },
    ];
    const mixed = await call("POST", "publish", { items }, "mixed");
    expect(mixed.status).toBe(202);
    expect(mixed.body.items[0]).toMatchObject({ id: ru.id, unchanged: true });
    expect(await publicationRows()).toHaveLength(1);
    await client`update content_articles set published_version = 1`;
    await client`delete from content_publications`;
    const none = await call("POST", "publish", { items }, "none");
    expect([none.status, none.body.batchId]).toEqual([200, null]);
    expect(await publicationRows()).toHaveLength(0);
  });
});
