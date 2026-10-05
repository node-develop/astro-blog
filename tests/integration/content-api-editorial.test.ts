import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { APIContext } from "astro";
import type { Database } from "../../src/lib/db";
import * as schema from "../../src/lib/db/schema";

const state = vi.hoisted(() => ({ db: undefined as Database | undefined }));
// legacyFilePeers (TODO(cutover), prompt 3.6) reads POSTS_DIR, and caches what it parsed per
// directory: the file exists before the first save of the run.
const { LEGACY_TITLE, postsDir } = await vi.hoisted(async () => {
  const LEGACY_TITLE = "Title of a legacy file post";
  const { writeLegacyPosts } = await import("../support/legacy-posts");
  return {
    LEGACY_TITLE,
    postsDir: writeLegacyPosts({ "legacy-title.md": { title: LEGACY_TITLE } }),
  };
});
vi.mock("~/lib/fs/paths", async (original) => ({
  ...(await original<typeof import("~/lib/fs/paths")>()),
  POSTS_DIR: postsDir,
}));
vi.mock("~/lib/db", () => ({
  get db() {
    return state.db;
  },
}));
vi.mock("../../src/lib/content-api/github", async (original) => ({
  ...(await original<typeof import("../../src/lib/content-api/github")>()),
  commitArticle: vi.fn(async () => "commit-1"),
}));

/** The critic's SDK boundary: the notes it "emits", or a failure. Never the real API. */
const critic = vi.hoisted(() => ({
  calls: 0,
  notes: [] as { severity: string; quote: string; reason: string }[],
  fail: false,
}));
vi.mock("@anthropic-ai/sdk", () => ({
  APIConnectionTimeoutError: function APIConnectionTimeoutError() {},
  default: vi.fn(function () {
    return {
      messages: {
        create: async () => {
          critic.calls += 1;
          if (critic.fail) throw new Error("upstream down");
          return { content: [{ type: "tool_use", input: { notes: critic.notes } }] };
        },
      },
    };
  }),
}));

import { ALL } from "../../src/pages/api/v1/[...path]";
import { processPublication } from "../../src/lib/content-api/worker";
import { enqueuePublication } from "../../src/lib/content-api/service";
import {
  compliantArticle,
  insertCoverAsset,
  withFixtureAssets,
} from "../support/editorial-fixture";

const token = `artka_${"d".repeat(43)}`;
const remote = vi.hoisted(() => ({ live: "", sitemap: "" }));
let counter = 0;
const call = async (method: string, path: string, payload?: unknown, key?: string) => {
  counter += 1;
  const response = await ALL({
    params: { path },
    request: new Request(`https://artka.dev/api/v1/${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "idempotency-key": key ?? `key-${counter}`,
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    }),
    locals: undefined,
  } as unknown as APIContext);
  return { status: response.status, body: await response.json() };
};
const codesOf = (body: { error: { details: { code: string }[] } }) =>
  body.error.details.map((d) => d.code);

describe("editorial gates and article review with PostgreSQL", () => {
  let container: StartedPostgreSqlContainer;
  let client: ReturnType<typeof postgres>;
  let keyId: string;

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
    await client?.end();
    await container?.stop();
  });
  beforeEach(async () => {
    await client`truncate content_api_requests, content_publications, content_articles, content_assets, content_api_keys, post_revisions, posts_meta, users cascade`;
    const [key] = await state
      .db!.insert(schema.contentApiKeys)
      .values({
        name: "editorial-test",
        tokenHash: createHash("sha256").update(token).digest("hex"),
        scopes: ["articles:read", "articles:write", "articles:publish", "media:write"],
      })
      .returning();
    keyId = key!.id;
    await insertCoverAsset(state.db!, keyId);
    critic.calls = 0;
    critic.notes = [];
    critic.fail = false;
    remote.live = "";
    remote.sitemap = "";
    vi.stubEnv("ANTHROPIC_API_KEY", "fake-for-tests");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        withFixtureAssets(async (url: string | URL) =>
          String(url).includes("sitemap-")
            ? new Response(remote.sitemap, { headers: { "content-type": "application/xml" } })
            : new Response(remote.live, { headers: { "content-type": "text/html" } }),
        ),
      ),
    );
  });

  const short = (slug: string) => ({
    ...compliantArticle({ slug }),
    body: "## Short\n\nA short body.",
    sources: [{ url: "https://example.com/one", title: "One" }],
    cover: undefined,
  });
  const publicationsOf = () => state.db!.select().from(schema.contentPublications);
  const articlesOf = () => state.db!.select().from(schema.contentArticles);
  const liveHtml = (url: string, revision: string) =>
    `<html><head><link rel="canonical" href="${url}"><meta name="description" content="D"></head><article data-content-revision="${revision}"></article></html>`;
  const goLive = async (url: string, publicationId: string) => {
    await processPublication();
    remote.live = liveHtml(url, publicationId);
    remote.sitemap = `<?xml version="1.0"?><urlset><url><loc>${url}</loc></url></urlset>`;
    await client`update content_publications set next_attempt_at = now() - interval '1 second'`;
    await processPublication();
  };

  describe("deterministic gates", () => {
    it("saves a non-compliant draft and reports every finding as a `<code>: <message>` warning", async () => {
      const created = await call("POST", "articles", { article: short("short-draft") });
      expect(created.status).toBe(201);
      const warnings = created.body.warnings as string[];
      expect(warnings.every((w) => typeof w === "string")).toBe(true);
      for (const code of [
        "too_short",
        "too_few_sources",
        "too_few_internal_links",
        "cover_missing",
      ])
        expect(
          warnings.some((w) => w.startsWith(`${code}: `)),
          code,
        ).toBe(true);
      expect(await articlesOf()).toHaveLength(1);
    });

    it("refuses to publish a non-compliant article with ALL failed gates at once and saves nothing", async () => {
      const result = await call("POST", "articles", {
        article: short("short-publish"),
        mode: "publish",
      });
      expect(result.status).toBe(422);
      expect(result.body.error.code).toBe("editorial_gates_failed");
      expect(codesOf(result.body).sort()).toEqual(
        ["cover_missing", "too_few_internal_links", "too_few_sources", "too_short"].sort(),
      );
      expect(result.body.error.details[0]).toMatchObject({ message: expect.any(String) });
      expect(await articlesOf()).toHaveLength(0);
      const validated = await call("POST", "articles/validate", {
        article: short("short-publish"),
        mode: "publish",
      });
      expect([validated.status, validated.body.error.code]).toEqual([
        422,
        "editorial_gates_failed",
      ]);
    });

    it("publishes a compliant article", async () => {
      const result = await call("POST", "articles", {
        article: compliantArticle({ slug: "good-one" }),
        mode: "publish",
      });
      expect(result.status, JSON.stringify(result.body)).toBe(202);
      expect(result.body.warnings).toEqual([]);
    });

    it("gates POST /articles/{id}/publish and lists the failures of both items of a batch", async () => {
      const ru = await call("POST", "articles", { article: short("batch-slug") });
      const en = await call("POST", "articles", {
        article: { ...short("batch-slug"), lang: "en" },
      });
      const single = await call("POST", `articles/${ru.body.id}/publish`, { expectedVersion: 1 });
      expect([single.status, single.body.error.code]).toEqual([422, "editorial_gates_failed"]);
      const batch = await call("POST", "publish", {
        items: [
          { id: ru.body.id, expectedVersion: 1 },
          { id: en.body.id, expectedVersion: 1 },
        ],
      });
      expect(batch.status).toBe(422);
      const ids = new Set(batch.body.error.details.map((d: { articleId: string }) => d.articleId));
      expect(ids).toEqual(new Set([ru.body.id, en.body.id]));
      expect(await publicationsOf()).toHaveLength(0);
    });

    it("applies the English phrase list to an English article and not the Russian one", async () => {
      const en = compliantArticle({ slug: "en-phrases", lang: "en", lead: "We delve into this." });
      const blocked = await call("POST", "articles", { article: en, mode: "publish" });
      expect(codesOf(blocked.body)).toEqual(["banned_phrase"]);
      const ruPhraseInEn = compliantArticle({
        slug: "en-ru-phrase",
        lang: "en",
        lead: "Это про всё.",
      });
      const ok = await call("POST", "articles", { article: ruPhraseInEn, mode: "publish" });
      expect(ok.status).toBe(202);
    });

    it("rejects a cover given as an https URL that is not one of our assets", async () => {
      const result = await call("POST", "articles", {
        article: {
          ...compliantArticle({ slug: "url-cover" }),
          cover: { url: "https://cdn.example.com/c.png", alt: "Cover" },
        },
        mode: "publish",
      });
      expect(codesOf(result.body)).toEqual(["cover_width_unknown"]);
    });

    it("compares titles with published articles only: a draft with the same title does not block", async () => {
      const draft = await call("POST", "articles", {
        article: compliantArticle({ slug: "abandoned", title: "Shared title" }),
      });
      expect(draft.status).toBe(201);
      const published = await call("POST", "articles", {
        article: compliantArticle({ slug: "real-one", title: "Shared title" }),
        mode: "publish",
      });
      expect(published.status).toBe(202);
      await state
        .db!.update(schema.contentArticles)
        .set({ publishedVersion: 1 })
        .where(eq(schema.contentArticles.id, published.body.id));
      const clash = await call("POST", "articles", {
        article: compliantArticle({ slug: "third-one", title: "shared TITLE" }),
        mode: "publish",
      });
      expect(codesOf(clash.body)).toEqual(["title_duplicate"]);
    });

    it("treats the title of a legacy file post as taken, but never the article's own file or twin", async () => {
      // TODO(cutover): delete this test together with legacyFilePeers (prompt 3.6).
      const clash = await call("POST", "articles", {
        article: compliantArticle({ slug: "file-title-clash", title: LEGACY_TITLE }),
        mode: "publish",
      });
      expect(codesOf(clash.body)).toEqual(["title_duplicate"]);
      // The same title on the slug of that very file is its own: no duplicate.
      const own = await call("POST", "articles/validate", {
        article: compliantArticle({ slug: "legacy-title", title: LEGACY_TITLE }),
      });
      expect(own.status).toBe(200);
      expect((own.body.warnings as string[]).some((w) => w.startsWith("title_duplicate"))).toBe(
        false,
      );
    });
  });

  describe("the worker", () => {
    it("completes a publication that was queued before the gates, whatever the document looks like", async () => {
      const draft = await call("POST", "articles", { article: short("legacy-queued") });
      expect(draft.status).toBe(201);
      const [article] = await articlesOf();
      // The state of an article queued by an older deployment: enqueue only, no editorial gate.
      const job = await state.db!.transaction((tx) =>
        enqueuePublication(tx, article!, { keyId, userId: null }),
      );
      await goLive(draft.body.url, job.id);
      const [after] = await articlesOf();
      expect(after).toMatchObject({ publishedVersion: 1 });
      const [published] = await publicationsOf();
      expect([published?.state, published?.error]).toEqual(["published", null]);
    });
  });

  describe("the ratchet for an article that is already live", () => {
    it("lets a correction through when only findings the live version had remain, and blocks a new one", async () => {
      // Like a Mailu article: live, 0 internal links.
      const live = {
        ...compliantArticle({ slug: "live-one" }),
        externalId: "live-one",
      };
      live.body = live.body.replaceAll("(/blog/", "(https://example.com/blog/");
      const [row] = await state
        .db!.insert(schema.contentArticles)
        .values({
          externalId: "live-one",
          slug: "live-one",
          lang: "ru",
          version: 1,
          publishedVersion: 1,
          document: live as never,
          keyId,
        })
        .returning();
      await state.db!.insert(schema.contentArticleVersions).values({
        articleId: row!.id,
        version: 1,
        document: live as never,
        actorKeyId: keyId,
      });
      const phrase = await call("PUT", `articles/${row!.id}`, {
        article: { ...live, body: `Это про инженерию.\n\n${live.body}` },
        expectedVersion: 1,
        mode: "publish",
      });
      expect([phrase.status, codesOf(phrase.body)]).toEqual([422, ["banned_phrase"]]);
      // The failed request saved nothing.
      expect((await articlesOf())[0]!.version).toBe(1);
      const fixed = await call("PUT", `articles/${row!.id}`, {
        article: { ...live, body: `Corrected paragraph.\n\n${live.body}` },
        expectedVersion: 1,
        mode: "publish",
      });
      expect(fixed.status, JSON.stringify(fixed.body)).toBe(202);
      expect(
        (fixed.body.warnings as string[]).some((w) => w.startsWith("too_few_internal_links")),
      ).toBe(true);
    });

    it("re-saving a published API article as a draft does not report its own title as a duplicate", async () => {
      const doc = compliantArticle({ slug: "self-title" });
      const created = await call("POST", "articles", { article: doc, mode: "publish" });
      await state
        .db!.update(schema.contentArticles)
        .set({ publishedVersion: 1 })
        .where(eq(schema.contentArticles.id, created.body.id));
      await state.db!.update(schema.contentPublications).set({ state: "published" });
      const saved = await call("PUT", `articles/${created.body.id}`, {
        article: { ...doc, description: `${doc.description} Edited.` },
        expectedVersion: 1,
      });
      expect(saved.status).toBe(200);
      expect((saved.body.warnings as string[]).some((w) => w.startsWith("title_duplicate"))).toBe(
        false,
      );
    });
  });

  describe("POST /articles/{id}/review/", () => {
    const create = async (slug: string, lead = "A claim that the sources do not support.") => {
      const doc = compliantArticle({ slug, lead });
      const created = await call("POST", "articles", { article: doc });
      expect(created.status).toBe(201);
      return { id: created.body.id as string, doc };
    };
    const block = (quote: string) => ({ severity: "block", quote, reason: "Not supported." });
    const versionRow = async (id: string, version: number) =>
      (
        await state
          .db!.select()
          .from(schema.contentArticleVersions)
          .where(
            and(
              eq(schema.contentArticleVersions.articleId, id),
              eq(schema.contentArticleVersions.version, version),
            ),
          )
      )[0]!;

    it("stores the notes with the version, then 409 without force and 202 with it", async () => {
      const { id } = await create("reviewed");
      critic.notes = [block("A claim that the sources do not support.")];
      const review = await call("POST", `articles/${id}/review`, { expectedVersion: 1 });
      expect(review.status, JSON.stringify(review.body)).toBe(200);
      expect(review.body).toMatchObject({ articleId: id, version: 1, blocked: true });
      expect((await versionRow(id, 1)).review?.notes).toHaveLength(1);

      const refused = await call("POST", `articles/${id}/publish`, { expectedVersion: 1 });
      expect([refused.status, refused.body.error.code]).toEqual([409, "editorial_block"]);
      expect(refused.body.error.details.items[0]).toMatchObject({ articleId: id, version: 1 });
      expect(await publicationsOf()).toHaveLength(0);

      const forced = await call("POST", `articles/${id}/publish`, {
        expectedVersion: 1,
        force: true,
      });
      expect(forced.status).toBe(202);
    });

    it("also blocks PUT mode=publish with the reviewed text, and batch publish", async () => {
      const { id, doc } = await create("reviewed-put");
      critic.notes = [block("A claim that the sources do not support.")];
      await call("POST", `articles/${id}/review`, { expectedVersion: 1 });
      // A new version with the same content must not shed the block.
      const put = await call("PUT", `articles/${id}`, {
        article: doc,
        expectedVersion: 1,
        mode: "publish",
      });
      expect([put.status, put.body.error.code]).toEqual([409, "editorial_block"]);
      const batch = await call("POST", "publish", { items: [{ id, expectedVersion: 1 }] });
      expect([batch.status, batch.body.error.code]).toEqual([409, "editorial_block"]);
      const forced = await call("POST", "publish", {
        items: [{ id, expectedVersion: 1 }],
        force: true,
      });
      expect(forced.status).toBe(202);
    });

    it("does not let a review of version N block version N+1 with different content", async () => {
      const { id, doc } = await create("reviewed-edit");
      critic.notes = [block("A claim that the sources do not support.")];
      await call("POST", `articles/${id}/review`, { expectedVersion: 1 });
      const fixed = await call("PUT", `articles/${id}`, {
        article: compliantArticle({ slug: doc.slug, lead: "A corrected claim." }),
        expectedVersion: 1,
      });
      expect(fixed.status).toBe(200);
      const published = await call("POST", `articles/${id}/publish`, { expectedVersion: 2 });
      expect(published.status, JSON.stringify(published.body)).toBe(202);
    });

    it("never blocks an article that was not reviewed, nor one with warnings only", async () => {
      const { id } = await create("warn-only");
      critic.notes = [{ severity: "warn", quote: "Lead paragraph.", reason: "Filler." }];
      const review = await call("POST", `articles/${id}/review`, { expectedVersion: 1 });
      expect(review.body.blocked).toBe(false);
      expect((await call("POST", `articles/${id}/publish`, { expectedVersion: 1 })).status).toBe(
        202,
      );
    });

    it("downgrades a block note whose quote is not in the article", async () => {
      const { id } = await create("hallucinated");
      critic.notes = [block("A sentence the article never contained.")];
      const review = await call("POST", `articles/${id}/review`, { expectedVersion: 1 });
      expect(review.body).toMatchObject({ blocked: false, notes: [{ severity: "warn" }] });
    });

    it("answers 409 for a stale version, 503 without a key, 502 on a failed model, and stores nothing then", async () => {
      const { id } = await create("failing");
      expect(
        (await call("POST", `articles/${id}/review`, { expectedVersion: 7 })).body.error.code,
      ).toBe("version_conflict");
      expect(critic.calls).toBe(0);
      critic.fail = true;
      const failed = await call("POST", `articles/${id}/review`, { expectedVersion: 1 });
      expect([failed.status, failed.body.error.code]).toEqual([502, "review_failed"]);
      expect((await versionRow(id, 1)).review).toBeNull();
      vi.stubEnv("ANTHROPIC_API_KEY", "");
      const off = await call("POST", `articles/${id}/review`, { expectedVersion: 1 });
      expect([off.status, off.body.error.code]).toEqual([503, "review_not_configured"]);
    });

    it("does not call the model again for a replayed Idempotency-Key", async () => {
      const { id } = await create("replayed");
      const first = await call("POST", `articles/${id}/review`, { expectedVersion: 1 }, "same-key");
      const second = await call(
        "POST",
        `articles/${id}/review`,
        { expectedVersion: 1 },
        "same-key",
      );
      expect(second.body).toEqual(first.body);
      expect(critic.calls).toBe(1);
    });
  });
});
