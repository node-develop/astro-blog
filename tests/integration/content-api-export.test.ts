import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
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

import { exportSchema } from "../../src/lib/content-api/contract";
import { ALL } from "../../src/pages/api/v1/[...path]";
import { processPublication } from "../../src/lib/content-api/worker";
import { requestRebuild } from "../../src/lib/content-api/rebuild";
import {
  compliantArticle,
  insertCoverAsset,
  withFixtureAssets,
} from "../support/editorial-fixture";

const token = `artka_${"a".repeat(43)}`;
const exportToken = `artka_${"e".repeat(43)}`;
const document = {
  ...compliantArticle({ slug: "export-article", title: "Export article" }),
  externalId: "export-source",
};
const call = async (method: string, path: string, body?: unknown, key = "request-1") => {
  const response = await ALL({
    params: { path },
    request: new Request(`https://artka.dev/api/v1/${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "idempotency-key": key,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  } as unknown as APIContext);
  return { status: response.status, body: await response.json() };
};
const rawExport = (bearer = exportToken) =>
  ALL({
    params: { path: "export/" },
    request: new Request("https://artka.dev/api/v1/export/", {
      headers: { authorization: `Bearer ${bearer}` },
    }),
  } as unknown as APIContext);

describe("GET /export/ with PostgreSQL", () => {
  let container: StartedPostgreSqlContainer;
  let client: ReturnType<typeof postgres>;
  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18-bookworm").start();
    client = postgres(container.getConnectionUri(), { max: 5 });
    state.db = drizzle(client, { schema });
    await migrate(state.db, { migrationsFolder: "drizzle" });
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
    const hash = (value: string) => createHash("sha256").update(value).digest("hex");
    const keys = await state
      .db!.insert(schema.contentApiKeys)
      .values([
        {
          name: "test",
          tokenHash: hash(token),
          scopes: ["articles:read", "articles:write", "articles:publish", "media:write"],
        },
        { name: "exporter", tokenHash: hash(exportToken), scopes: ["content:export"] },
      ])
      .returning();
    await insertCoverAsset(state.db!, keys[0]!.id);
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
  const due = () =>
    client`update content_publications set next_attempt_at = now() - interval '1 second'`;
  const age = () =>
    client`update content_publications set dispatched_at = now() - interval '31 minutes' where state = 'publishing' and dispatched_at is not null`;
  const liveHtml = (url: string, revision: string) =>
    `<html><head><link rel="canonical" href="${url}"><meta name="description" content="Description"></head><article data-content-revision="${revision}"></article></html>`;
  const sitemapOf = (...urls: string[]) =>
    `<?xml version="1.0"?><urlset>${urls.map((u) => `<url><loc>${u}</loc></url>`).join("")}</urlset>`;
  const OTHER_URL = "https://artka.dev/blog/some-other-post/";
  const goLive = async (url: string, publicationId: string) => {
    await processPublication(); // pointer moves
    await processPublication(); // rebuild requested
    remote.live = liveHtml(url, publicationId);
    remote.sitemap = sitemapOf(url, OTHER_URL);
    await due();
    await processPublication();
  };
  const make = async (
    over: Record<string, unknown> = {},
    mode = "draft",
    key = `make-${String(over.slug ?? "x")}-${String(over.lang ?? "ru")}-${mode}`,
  ) => {
    // Titles are unique among published articles: every slug gets its own compliant document.
    const base = compliantArticle({
      slug: String(over.slug ?? document.slug),
      lang: over.lang === "en" ? "en" : "ru",
    });
    const result = await call(
      "POST",
      "articles",
      { article: { ...base, externalId: document.externalId, ...over }, mode },
      key,
    );
    expect(result.status).toBe(mode === "draft" ? 201 : 202);
    return result.body;
  };
  const publishedArticle = async () => {
    const article = await make({}, "publish");
    await goLive(article.url, article.publication.id);
    return article;
  };
  const exported = async () => {
    const response = await rawExport();
    expect(response.status).toBe(200);
    return exportSchema.parse(JSON.parse(await response.text()));
  };
  const articleRow = async (id: string) =>
    (
      await state.db!.select().from(schema.contentArticles).where(eq(schema.contentArticles.id, id))
    )[0]!;

  it("hands the waiting version to the build, not publishedContent, and goes back after a failure", async () => {
    const first = await publishedArticle();
    const v1 = (await exported()).articles[0]!;
    expect(v1).toMatchObject({ slug: document.slug, lang: "ru", revision: first.publication.id });
    const second = await call(
      "PUT",
      `articles/${first.id}`,
      {
        article: {
          ...document,
          body: compliantArticle({ slug: document.slug, lead: "The second version." }).body,
        },
        expectedVersion: 1,
        mode: "publish",
      },
      "v2",
    );
    expect(second.status).toBe(202);
    const v2Id = second.body.publication.id;
    // Queued: nothing is dispatched, the build still gets v1.
    expect((await exported()).articles[0]!.revision).toBe(first.publication.id);
    await processPublication();
    await processPublication(); // rebuild requested
    const waiting = (await exported()).articles[0]!;
    expect(waiting.revision).toBe(v2Id);
    expect(waiting.content).toContain("The second version.");
    // The live page is still v1: publishedContent has not moved.
    expect((await articleRow(first.id)).publishedContent).toBe(v1.content);
    expect(waiting.content).not.toBe(v1.content);
    // The deployment never shows v2: 504, and the build goes back to v1.
    await age();
    await due();
    await processPublication();
    const [failed] = await state
      .db!.select()
      .from(schema.contentPublications)
      .where(eq(schema.contentPublications.id, v2Id));
    expect(failed).toMatchObject({ state: "failed", error: { code: "deployment_timeout" } });
    expect(await exported()).toMatchObject({ articles: [v1] });
  });

  it("keeps the pointer after a transient rebuild error", async () => {
    const article = await publishedArticle();
    await call(
      "PUT",
      `articles/${article.id}`,
      {
        article: {
          ...document,
          body: compliantArticle({ slug: document.slug, lead: "Second." }).body,
        },
        expectedVersion: 1,
        mode: "publish",
      },
      "v2",
    );
    await processPublication(); // pointer moves
    vi.mocked(requestRebuild).mockRejectedValueOnce(new Error("GitHub is down"));
    expect(await processPublication()).toMatchObject({
      worked: true,
      error: "upstream_unavailable",
    });
    // The pointer was committed before the request: a lost request does not take it back, the
    // job stays `publishing` and asks again.
    const [second] = (await state.db!.select().from(schema.contentPublications)).filter(
      (p) => p.state === "publishing",
    );
    expect(second).toMatchObject({ dispatchedAt: null, error: { code: "upstream_unavailable" } });
    expect((await exported()).articles[0]!.revision).toBe(second!.id);
  });

  it("does not return drafts, a first publication that is only queued, or unpublished articles", async () => {
    const live = await publishedArticle();
    expect((await exported()).count).toBe(1);
    await call("POST", `articles/${live.id}/unpublish`, { expectedVersion: 1 }, "unpublish");
    await processPublication();
    await processPublication();
    remote.live = null;
    remote.sitemap = sitemapOf(OTHER_URL);
    await due();
    await processPublication();
    expect((await articleRow(live.id)).unpublishedAt).not.toBeNull();
    await make({ slug: "just-a-draft", externalId: "draft" });
    await make({ slug: "queued-first", externalId: "queued" }, "publish");
    expect((await exported()).articles).toEqual([]);
  });

  it("drops an article from the export when its unpublication is dispatched and restores it on failure", async () => {
    const article = await publishedArticle();
    const queued = await call(
      "POST",
      `articles/${article.id}/unpublish`,
      { expectedVersion: 1 },
      "u1",
    );
    expect(queued.status).toBe(202);
    expect((await exported()).count).toBe(1);
    await processPublication();
    expect((await exported()).count).toBe(0);
    await processPublication(); // rebuild requested
    // The page never goes away within 30 minutes.
    await age();
    await due();
    await processPublication();
    expect((await exported()).articles.map((a) => a.revision)).toEqual([article.publication.id]);
  });

  it("requires the content:export scope", async () => {
    const denied = await rawExport(token);
    expect([denied.status, (await denied.json()).error.code]).toEqual([403, "forbidden"]);
    expect((await rawExport()).status).toBe(200);
  });

  it("takes meta from posts_meta, the defaults when the row is missing", async () => {
    await publishedArticle();
    await state
      .db!.update(schema.postsMeta)
      .set({ order: 7, pinned: true, hiddenFromList: true })
      .where(eq(schema.postsMeta.slug, document.slug));
    expect((await exported()).articles[0]!.meta).toEqual({
      order: 7,
      pinned: true,
      hiddenFromList: true,
    });
    await state.db!.delete(schema.postsMeta).where(eq(schema.postsMeta.slug, document.slug));
    expect((await exported()).articles[0]!.meta).toEqual({
      order: Number.MAX_SAFE_INTEGER,
      pinned: false,
      hiddenFromList: false,
    });
  });

  it("serves the stored content with its sha256, sorted, and the same bytes twice", async () => {
    await publishedArticle();
    const en = await make({ lang: "en" }, "publish", "english");
    await goLive("https://artka.dev/en/blog/export-article/", en.publication.id);
    await make({ slug: "another-post", externalId: "another" }, "publish", "another");
    const first = await rawExport();
    expect(first.headers.get("x-request-id")).toBeTruthy();
    const text = await first.text();
    const snapshot = exportSchema.parse(JSON.parse(text));
    expect(snapshot.articles.map((a) => [a.slug, a.lang])).toEqual([
      ["export-article", "en"],
      ["export-article", "ru"],
    ]);
    const rows = await state.db!.select().from(schema.contentPublications);
    for (const article of snapshot.articles) {
      const stored = rows.find((row) => row.id === article.revision)!;
      expect(article.content).toBe(stored.content);
      expect(article.contentSha256).toBe(createHash("sha256").update(stored.content).digest("hex"));
    }
    const strip = (value: string) => value.replace(/"generatedAt":"[^"]+"/, "");
    expect(strip(await (await rawExport()).text())).toBe(strip(text));
  });

  it("refuses to unpublish an article that a queued or dispatched publication links to", async () => {
    const target = await publishedArticle();
    await make(
      { slug: "linking-article", externalId: "linking", relatedSlugs: [document.slug] },
      "publish",
      "linking",
    );
    const refused = await call(
      "POST",
      `articles/${target.id}/unpublish`,
      { expectedVersion: 1 },
      "u",
    );
    expect([refused.status, refused.body.error.code]).toEqual([409, "referenced_by_related"]);
  });

  it("does not accept a link to an article whose unpublication is queued", async () => {
    const target = await publishedArticle();
    expect(
      (await call("POST", `articles/${target.id}/unpublish`, { expectedVersion: 1 }, "u")).status,
    ).toBe(202);
    const linking = await call(
      "POST",
      "articles/validate",
      {
        article: {
          ...document,
          slug: "linking-article",
          externalId: "l",
          relatedSlugs: [document.slug],
        },
      },
      "v",
    );
    expect(linking.status).toBe(422);
  });
});
