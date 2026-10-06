import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { APIContext } from "astro";
import type { Database } from "../../src/lib/db";
import * as schema from "../../src/lib/db/schema";

const state = vi.hoisted(() => ({ db: undefined as Database | undefined }));
// ~/lib/fs/paths reads UPLOADS_DIR once, so it is set before any import below runs.
const uploadsDir = await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "content-api-uploads-"));
  process.env.UPLOADS_DIR = dir;
  return dir;
});
// The legacy file fallbacks (TODO(cutover), prompt 3.6) read POSTS_DIR: the test owns its files, and
// they are written before any API call because editorial-gates caches them per directory.
const postsDir = await vi.hoisted(async () => {
  const { writeLegacyPosts } = await import("../support/legacy-posts");
  return writeLegacyPosts({ "legacy-related.md": { title: "Legacy related post" } });
});
vi.mock("~/lib/fs/paths", async (original) => ({
  ...(await original<typeof import("~/lib/fs/paths")>()),
  POSTS_DIR: postsDir,
}));
// getOrderedPosts reads Astro's collection: a fixed list of fake entries stands in for it.
const collection = vi.hoisted(() => ({ ids: [] as string[] }));
vi.mock("astro:content", () => ({
  getCollection: async (_name: string, filter: (entry: unknown) => boolean) =>
    collection.ids
      .map((id, index) => ({
        id,
        data: {
          draft: false,
          pubDate: new Date(Date.UTC(2026, 0, 10 - index)),
          _meta: { order: index, pinned: false, hiddenFromList: false },
        },
      }))
      .filter(filter),
}));
vi.mock("~/lib/db", () => ({
  get db() {
    return state.db;
  },
}));
const remote = vi.hoisted(() => ({
  /** The page body; `null` is a 404. */
  live: "" as string | null,
  sitemap: "",
}));
vi.mock("../../src/lib/content-api/rebuild", async (original) => ({
  ...(await original<typeof import("../../src/lib/content-api/rebuild")>()),
  requestRebuild: vi.fn(async () => undefined),
}));

import { articleDocumentSchema } from "../../src/lib/content-api/contract";
import {
  compliantArticle,
  insertCoverAsset,
  withFixtureAssets,
} from "../support/editorial-fixture";
import { ALL } from "../../src/pages/api/v1/[...path]";
import { processPublication } from "../../src/lib/content-api/worker";
import { requestRebuild } from "../../src/lib/content-api/rebuild";
import { searchPostsMeta } from "../../src/lib/db/repo/posts-meta";
import { getOrderedPosts } from "../../src/lib/content/loader";

const token = `artka_${"a".repeat(43)}`;
const document = {
  ...compliantArticle({ slug: "integration-content-api", title: "Integration API article" }),
  externalId: "integration-source",
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
    rmSync(uploadsDir, { recursive: true, force: true });
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
    await insertCoverAsset(state.db!, keyId);
    remote.live = "";
    remote.sitemap = "";
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        withFixtureAssets(async (url: string | URL) =>
          String(url).includes("sitemap-")
            ? new Response(remote.sitemap, { headers: { "content-type": "application/xml" } })
            : remote.live === null
              ? new Response("", { status: 404 })
              : new Response(remote.live, { headers: { "content-type": "text/html" } }),
        ),
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
  /** The 30 minutes count from the rebuild request. */
  const ageDispatch = () =>
    client`update content_publications set dispatched_at = now() - interval '31 minutes', next_attempt_at = now() - interval '1 second' where dispatched_at is not null`;

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
    expect(requestRebuild).not.toHaveBeenCalled(); // the pointer moves first
    await processPublication();
    expect(requestRebuild).toHaveBeenCalledTimes(1);
    expect(requestRebuild).toHaveBeenCalledWith(expect.any(String));
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
  it("publishes a hidden article without waiting for the sitemap that leaves it out", async () => {
    const article = await make("publish");
    await state.db!.insert(schema.postsMeta).values({
      slug: document.slug,
      order: 1,
      hiddenFromList: true,
    });
    await processPublication(); // pointer moves
    await processPublication(); // rebuild requested
    remote.live = liveHtml(article.url, article.publication.id);
    remote.sitemap = sitemapOf(OTHER_URL);
    await due();
    await processPublication();
    expect((await call("GET", `publications/${article.publication.id}`)).body.state).toBe(
      "published",
    );
  });
  it("serialises concurrent workers: one rebuild request for one publication", async () => {
    const article = await make("publish");
    await Promise.all([processPublication(), processPublication()]);
    await Promise.all([processPublication(), processPublication()]);
    expect(requestRebuild).toHaveBeenCalledTimes(1);
    expect((await call("GET", `publications/${article.publication.id}`)).body.state).toBe(
      "publishing",
    );
  });
  it("checks related slugs against the database first and the legacy files second", async () => {
    const validate = (relatedSlugs: string[]) =>
      call("POST", "articles/validate", { article: { ...document, relatedSlugs } }, "related");
    // A legacy file post that has no row in the database.
    expect((await validate(["legacy-related"])).status).toBe(200);
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
      document: articleDocumentSchema.parse({ ...document, slug: "legacy-related" }),
      externalId: "shadow",
      slug: "legacy-related",
      lang: "ru",
      keyId,
    });
    expect((await validate(["legacy-related"])).status).toBe(422);
  });
  it("asks again when the answer to the rebuild request is lost", async () => {
    const article = await make("publish");
    await processPublication(); // pointer moves
    vi.mocked(requestRebuild).mockRejectedValueOnce(new Error("connection reset"));
    expect(await processPublication()).toMatchObject({
      worked: true,
      error: "upstream_unavailable",
    });
    expect(requestRebuild).toHaveBeenCalledTimes(1);
    const [lost] = await publicationRows();
    expect(lost).toMatchObject({
      state: "publishing",
      dispatchedAt: null,
      error: { code: "upstream_unavailable" },
    });
    expect((await articleRow(article.id)).buildPublicationId).toBe(article.publication.id);
    await due();
    await processPublication();
    expect(requestRebuild).toHaveBeenCalledTimes(2);
    expect((await publicationRows())[0]!.dispatchedAt).not.toBeNull();
    remote.live = liveHtml(article.url, article.publication.id);
    remote.sitemap = sitemapOf(article.url, OTHER_URL);
    await due();
    await processPublication();
    expect((await call("GET", `publications/${article.publication.id}`)).body.state).toBe(
      "published",
    );
  });
  it("fails a timed-out deployment and retries with a fresh build marker", async () => {
    const article = await make("publish");
    await processPublication();
    await processPublication();
    await ageDispatch();
    await processPublication();
    expect((await call("GET", `publications/${article.publication.id}`)).body.state).toBe("failed");
    expect((await articleRow(article.id)).buildPublicationId).toBeNull();
    const retry = await call(
      "POST",
      `articles/${article.id}/publish`,
      { expectedVersion: 1 },
      "retry",
    );
    expect(retry.status).toBe(202);
    expect(retry.body.publication.id).not.toBe(article.publication.id);
    await processPublication();
    await processPublication();
    expect(requestRebuild).toHaveBeenCalledTimes(2);
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
    expect(requestRebuild).not.toHaveBeenCalled();
  });
  it("does not request a rebuild for a publication whose key was revoked after the pointer moved", async () => {
    const article = await make("publish");
    await processPublication();
    await state
      .db!.update(schema.contentApiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(schema.contentApiKeys.id, keyId));
    await processPublication();
    expect(requestRebuild).not.toHaveBeenCalled();
    expect((await publicationRows())[0]).toMatchObject({
      state: "failed",
      error: { code: "key_revoked" },
    });
    expect((await articleRow(article.id)).buildPublicationId).toBeNull();
  });

  // ── Prompt 1.5: versions, restore, delete, unpublish, batch, status ──────────────────────────
  const liveHtml = (url: string, revision: string) =>
    `<html><head><link rel="canonical" href="${url}"><meta name="description" content="Description"></head><article data-content-revision="${revision}"></article></html>`;
  const sitemapOf = (...urls: string[]) =>
    `<?xml version="1.0"?><urlset>${urls.map((u) => `<url><loc>${u}</loc></url>`).join("")}</urlset>`;
  const OTHER_URL = "https://artka.dev/blog/some-other-post/";
  /** Runs one publication through the pointer, the rebuild request, live page and sitemap to `published`. */
  const goLive = async (url: string, publicationId: string) => {
    await processPublication(); // pointer moves
    await processPublication(); // rebuild requested
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

  it("treats a publication that failed after leaving queued as possibly built: unpublish first, then delete", async () => {
    const article = await make("publish");
    await processPublication(); // pointer moves: from here a build may carry the page
    vi.mocked(requestRebuild).mockRejectedValueOnce(new Error("GitHub is down"));
    await client`update content_publications set attempts = 4`;
    await processPublication(); // the rebuild request is exhausted
    expect((await publicationRows())[0]).toMatchObject({
      state: "failed",
      dispatchedAt: null,
      commitSha: null,
    });
    expect((await articleRow(article.id)).buildPublicationId).toBeNull();
    const del = () =>
      call("DELETE", `articles/${article.id}`, undefined, "d", token, { "if-match": '"1"' });
    const refused = await del();
    expect([refused.status, refused.body.error.code]).toEqual([409, "unpublish_first"]);
    // The lever: an unpublish that finishes proves the page is gone, then the draft can go.
    const unpublish = await call(
      "POST",
      `articles/${article.id}/unpublish`,
      { expectedVersion: 1 },
      "lever",
    );
    expect(unpublish.status).toBe(202);
    await processPublication();
    await processPublication();
    remote.live = null;
    remote.sitemap = sitemapOf(OTHER_URL);
    await due();
    await processPublication();
    const deleted = await del();
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

  it("refuses to delete a draft that was sent to a build, and an active publication", async () => {
    const article = await make("publish");
    const del = () =>
      call("DELETE", `articles/${article.id}`, undefined, "d", token, { "if-match": '"1"' });
    await processPublication(); // The pointer moves.
    await processPublication(); // The rebuild is requested.
    expect((await del()).body.error.code).toBe("publication_in_progress");
    await state.db!.update(schema.contentPublications).set({ state: "failed" });
    const refused = await del();
    expect([refused.status, refused.body.error.code]).toEqual([409, "unpublish_first"]);
    expect(await state.db!.select().from(schema.contentArticles)).toHaveLength(1);
    // Unpublishing the stray page frees the draft for deletion.
    const unpublish = await call(
      "POST",
      `articles/${article.id}/unpublish`,
      { expectedVersion: 1 },
      "stray",
    );
    expect(unpublish.status).toBe(202);
    await processPublication();
    await processPublication();
    remote.live = null;
    remote.sitemap = sitemapOf(OTHER_URL);
    await due();
    await processPublication();
    expect((await articleRow(article.id)).buildPublicationId).toBeNull();
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
    // The article leaves the export first, then the rebuild is requested; the page still answers 200.
    const requested = vi.mocked(requestRebuild).mock.calls.length;
    await processPublication();
    expect((await articleRow(article.id)).buildPublicationId).toBeNull();
    expect(requestRebuild).toHaveBeenCalledTimes(requested);
    await processPublication();
    expect(requestRebuild).toHaveBeenCalledTimes(requested + 1);
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
    // IndexNow still has to announce the removed url: the hooks wait for the next worker call.
    expect(unpublishRow!.hooksDoneAt).toBeNull();
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

  it("lets POST /publish restore a page whose unpublish failed after its rebuild request", async () => {
    const article = await publishedArticle();
    await call("POST", `articles/${article.id}/unpublish`, { expectedVersion: 1 }, "unpublish");
    await processPublication();
    await processPublication();
    expect((await articleRow(article.id)).buildPublicationId).toBeNull();
    // The page never disappears: the unpublish times out and fails; publishedVersion is intact.
    await client`update content_publications set dispatched_at = now() - interval '31 minutes', next_attempt_at = now() - interval '1 second' where kind = 'unpublish'`;
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
    expect((await articleRow(article.id)).buildPublicationId).toBe(retry.body.publication.id);
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

  it("requests one rebuild for a ru/en batch, and only once no member is still queued", async () => {
    const ru = await make();
    const en = await makeEnglish();
    const result = await call(
      "POST",
      "publish",
      {
        items: [
          { id: ru.id, expectedVersion: 1 },
          { id: en.id, expectedVersion: 1 },
        ],
      },
      "batch-rebuild",
    );
    const states = async () =>
      Object.fromEntries((await publicationRows()).map((r) => [r.articleId, r]));
    await processPublication(); // tick 1: ru moves its pointer
    expect((await states())[ru.id]).toMatchObject({ state: "publishing", dispatchedAt: null });
    await processPublication(); // tick 2: ru must wait, en is still queued
    expect(requestRebuild).not.toHaveBeenCalled();
    expect((await states())[en.id]!.state).toBe("queued");
    expect((await states())[ru.id]!.dispatchedAt).toBeNull();
    await processPublication(); // tick 3: en moves its pointer
    expect((await states())[en.id]).toMatchObject({ state: "publishing", dispatchedAt: null });
    expect(requestRebuild).not.toHaveBeenCalled();
    await processPublication(); // tick 4: the one request for the whole batch
    expect(requestRebuild).toHaveBeenCalledTimes(1);
    expect(requestRebuild).toHaveBeenCalledWith(result.body.batchId);
    await due();
    await processPublication(); // ru adopts the request en already made
    expect(requestRebuild).toHaveBeenCalledTimes(1);
    const rows = await states();
    expect(rows[ru.id]!.dispatchedAt).not.toBeNull();
    expect(rows[ru.id]!.dispatchedAt).toEqual(rows[en.id]!.dispatchedAt);
    const ruLive = liveHtml(ru.url, rows[ru.id]!.id);
    const enLive = liveHtml(en.url, rows[en.id]!.id);
    remote.live = ruLive + enLive;
    remote.sitemap = sitemapOf(ru.url, en.url, OTHER_URL);
    for (let i = 0; i < 2; i++) {
      await due();
      await processPublication();
    }
    expect(Object.values(await states()).map((r) => r.state)).toEqual(["published", "published"]);
    expect(requestRebuild).toHaveBeenCalledTimes(1);
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

  // ── Prompt 1.5, second part: contract defaults, covers, posts-meta, search vector ─────────────
  const bare = (({ externalId: _e, provenance: _p, ...rest }) => rest)(document);

  it("stores externalId = slug and the key name as agent when omitted, and a retry replays", async () => {
    const first = await call("POST", "articles", { article: bare }, "bare-1");
    expect(first.status).toBe(201);
    const retry = await call("POST", "articles", { article: bare }, "bare-1");
    expect([retry.status, retry.body.id]).toEqual([201, first.body.id]);
    const rows = await state.db!.select().from(schema.contentArticles);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.externalId).toBe(document.slug);
    expect(rows[0]!.document).toMatchObject({
      externalId: document.slug,
      provenance: { agent: "test" },
    });
    // The stored document is always complete: it satisfies the strict storage schema.
    expect(articleDocumentSchema.safeParse(rows[0]!.document).success).toBe(true);
  });

  it("completes an update and the English twin from the stored externalId, not from the slug", async () => {
    const created = await make(); // externalId "integration-source" differs from the slug
    const put = await call(
      "PUT",
      `articles/${created.id}`,
      { article: { ...bare, title: "Retitled" }, expectedVersion: 1 },
      "bare-put",
    );
    expect(put.status).toBe(200);
    // An omitted agent keeps the one on record.
    expect(put.body.article).toMatchObject({
      externalId: "integration-source",
      title: "Retitled",
      provenance: { agent: "integration" },
    });
    const twin = await call("POST", "articles", { article: { ...bare, lang: "en" } }, "bare-en");
    expect(twin.status).toBe(201);
    expect(twin.body.article.externalId).toBe("integration-source");
  });

  it("checks a /uploads/ cover file before saving", async () => {
    mkdirSync(join(uploadsDir, "2026"), { recursive: true });
    writeFileSync(join(uploadsDir, "2026", "cover.png"), "x");
    const validate = (url: string) =>
      call("POST", "articles/validate", { article: { ...document, cover: { url, alt: "Cover" } } });
    expect((await validate("/uploads/2026/cover.png")).status).toBe(200);
    const missing = await validate("/uploads/2026/typo.png");
    expect([missing.status, missing.body.error.code]).toEqual([422, "missing_cover_file"]);
  });

  it("probes an https cover before the commit: a page that is not an image never goes live", async () => {
    const coverUrl = "https://cdn.example/cover.webp";
    // The width of an https cover is only known when it is one of our assets.
    await state.db!.insert(schema.contentAssets).values({
      hash: "https-cover-asset",
      url: coverUrl,
      objectKey: "cover.webp",
      mimeType: "image/webp",
      width: 1600,
      height: 900,
      byteSize: 1000,
      keyId,
    });
    let coverAnswer = () => new Response("<html>", { headers: { "content-type": "text/html" } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) =>
        String(url) === coverUrl
          ? coverAnswer()
          : String(url).includes("sitemap-")
            ? new Response(remote.sitemap, { headers: { "content-type": "application/xml" } })
            : new Response(remote.live ?? "", { headers: { "content-type": "text/html" } }),
      ),
    );
    const created = await call(
      "POST",
      "articles",
      {
        article: { ...document, cover: { url: coverUrl, alt: "Cover" } },
        mode: "publish",
      },
      "https-cover",
    );
    expect(created.status).toBe(202);
    await processPublication();
    expect(requestRebuild).not.toHaveBeenCalled();
    expect((await call("GET", `publications/${created.body.publication.id}`)).body).toMatchObject({
      state: "queued",
      error: { code: "cover_unreachable" },
    });
    coverAnswer = () => new Response(null, { headers: { "content-type": "image/webp" } });
    await due();
    await goLive(created.body.url, created.body.publication.id);
    expect(requestRebuild).toHaveBeenCalledTimes(1);
    const [stored] = await publicationRows();
    expect(stored!.content).toContain(`cover: ${coverUrl}`);
    expect(stored!.content).not.toContain("socialImage");
    expect((await call("GET", `publications/${created.body.publication.id}`)).body.state).toBe(
      "published",
    );
  });

  describe("posts-meta", () => {
    const SLUGS = ["post-a", "post-b", "post-c"];
    const writeToken = `artka_${"b".repeat(43)}`;
    beforeEach(async () => {
      collection.ids = SLUGS;
      vi.stubEnv("DATABASE_URL", "postgres://unused-the-db-module-is-mocked");
      await state
        .db!.insert(schema.postsMeta)
        .values(SLUGS.map((slug, index) => ({ slug, order: index + 1 })));
      await state.db!.insert(schema.contentApiKeys).values({
        name: "writer",
        tokenHash: createHash("sha256").update(writeToken).digest("hex"),
        scopes: ["articles:read", "articles:write"],
      });
    });
    afterEach(() => vi.unstubAllEnvs());
    const listed = async () =>
      (await getOrderedPosts({ locale: "ru" })).map((post) => post.entry.id);

    it("hides a post from the SSR list at once, and shows it again", async () => {
      expect(await listed()).toEqual(SLUGS);
      const hidden = await call("PATCH", "posts-meta/post-b", { hiddenFromList: true }, "p1");
      expect(hidden.body).toMatchObject({ slug: "post-b", hiddenFromList: true, pinned: false });
      expect(await listed()).toEqual(["post-a", "post-c"]);
      await call("PATCH", "posts-meta/post-b", { hiddenFromList: false }, "p2");
      expect(await listed()).toEqual(SLUGS);
    });

    it("lets a write-only key pin but not hide, and never creates a row", async () => {
      const hide = await call(
        "PATCH",
        "posts-meta/post-a",
        { hiddenFromList: true },
        "p3",
        writeToken,
      );
      expect([hide.status, hide.body.error.code]).toEqual([403, "forbidden"]);
      const both = await call(
        "PATCH",
        "posts-meta/post-a",
        { pinned: true, hiddenFromList: true },
        "p4",
        writeToken,
      );
      expect(both.status).toBe(403);
      const pin = await call("PATCH", "posts-meta/post-a", { pinned: true }, "p5", writeToken);
      expect([pin.status, pin.body.pinned, pin.body.hiddenFromList]).toEqual([200, true, false]);
      expect(await listed()).toContain("post-a");
      const none = await call("PATCH", "posts-meta/no-such-post", { pinned: true }, "p6");
      expect(none.status).toBe(404);
      expect(await state.db!.select().from(schema.postsMeta)).toHaveLength(3);
      expect((await call("PATCH", "posts-meta/post-a", {}, "p7")).status).toBe(422);
    });

    it("lists every row by order, and that list is accepted back by PUT order", async () => {
      const listing = await call("GET", "posts-meta");
      const slugs = listing.body.items.map((i: { slug: string }) => i.slug);
      expect(slugs).toEqual(SLUGS);
      expect((await call("PUT", "posts-meta/order", { slugs }, "o0")).status).toBe(200);
    });

    it("reorders only with the complete list and answers in the requested order", async () => {
      const unknown = await call("PUT", "posts-meta/order", { slugs: [...SLUGS, "ghost"] }, "o1");
      expect([unknown.status, unknown.body.error.code, unknown.body.error.details]).toEqual([
        422,
        "unknown_slugs",
        { slugs: ["ghost"] },
      ]);
      const partial = await call("PUT", "posts-meta/order", { slugs: ["post-c", "post-a"] }, "o2");
      expect([partial.status, partial.body.error.code, partial.body.error.details]).toEqual([
        422,
        "incomplete_order",
        { missing: ["post-b"] },
      ]);
      const ok = await call(
        "PUT",
        "posts-meta/order",
        { slugs: ["post-c", "post-a", "post-b"] },
        "o3",
      );
      expect(ok.status).toBe(200);
      expect(ok.body.items.map((i: { slug: string; order: number }) => [i.slug, i.order])).toEqual([
        ["post-c", 1],
        ["post-a", 2],
        ["post-b", 3],
      ]);
      const stored = await state.db!.select().from(schema.postsMeta);
      expect(stored.map((row) => row.order).sort()).toEqual([1, 2, 3]);
    });
  });

  it("keeps one search vector per language: publishing English leaves the Russian one intact", async () => {
    const ru = await call(
      "POST",
      "articles",
      {
        article: {
          ...document,
          body: compliantArticle({ slug: document.slug, lead: "Сварите борщ с говядиной." }).body,
          tags: ["food"],
        },
        mode: "publish",
      },
      "vec-ru",
    );
    await goLive(ru.body.url, ru.body.publication.id);
    expect((await searchPostsMeta("борщ")).map((hit) => hit.slug)).toEqual([document.slug]);
    const en = await call(
      "POST",
      "articles",
      {
        article: {
          ...document,
          lang: "en",
          title: "Integration API article in English",
          body: compliantArticle({
            lang: "en",
            slug: document.slug,
            lead: "Boil the dumplings until golden.",
          }).body,
        },
        mode: "publish",
      },
      "vec-en",
    );
    expect(en.status).toBe(202);
    await goLive(en.body.url, en.body.publication.id);
    expect((await call("GET", `publications/${en.body.publication.id}`)).body.state).toBe(
      "published",
    );
    const slugs = async (query: string, lang?: "ru" | "en") =>
      (await searchPostsMeta(query, 20, lang)).map((hit) => hit.slug);
    expect(await slugs("борщ")).toEqual([document.slug]);
    expect(await slugs("dumplings", "en")).toEqual([document.slug]);
    // Neither vector holds the other language's text.
    expect(await slugs("dumplings", "ru")).toEqual([]);
    expect(await slugs("борщ", "en")).toEqual([]);
  });
});
