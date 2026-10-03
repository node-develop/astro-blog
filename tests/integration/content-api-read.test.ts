import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { APIContext } from "astro";
import type { z } from "zod";
import type { Database } from "../../src/lib/db";
import * as schema from "../../src/lib/db/schema";

const state = vi.hoisted(() => ({ db: undefined as Database | undefined }));
vi.mock("~/lib/db", () => ({
  get db() {
    return state.db;
  },
}));

import { ALL } from "../../src/pages/api/v1/[...path]";
import {
  articleBySlugSchema,
  articleListSchema,
  articleVersionSchema,
  mediaListSchema,
  postMetaSchema,
  publicationListSchema,
  versionListSchema,
} from "../../src/lib/content-api/contract";

const tokenOf = (letter: string) => `artka_${letter.repeat(43)}`;
const READER = tokenOf("r");
const WRITER = tokenOf("w");
const UPLOADER = tokenOf("m");
const call = async (path: string, token = READER) => {
  const response = await ALL({
    // Astro passes the path without the query string.
    params: { path: path.split("?")[0] },
    request: new Request(`https://artka.dev/api/v1/${path}`, {
      headers: { authorization: `Bearer ${token}` },
    }),
    locals: undefined,
  } as unknown as APIContext);
  return { status: response.status, body: await response.json() };
};
/** Reads through the real route and asserts the body against the strict contract schema. */
const read = async <S extends z.ZodType>(path: string, contract: S): Promise<z.infer<S>> => {
  const result = await call(path);
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  return contract.parse(result.body);
};

describe("content API reads with PostgreSQL", () => {
  let container: StartedPostgreSqlContainer;
  let client: ReturnType<typeof postgres>;
  let keyId: string;
  let counter = 0;

  const seedArticle = async (
    over: Partial<typeof schema.contentArticles.$inferInsert> & {
      title?: string;
      tags?: string[];
      agent?: string;
      /** SQL literal, to control sub-millisecond digits that a JS Date cannot carry. */
      updatedAtSql?: string;
    } = {},
  ) => {
    counter += 1;
    const slug = over.slug ?? `post-${counter}`;
    const lang = over.lang ?? "ru";
    const [row] = await state
      .db!.insert(schema.contentArticles)
      .values({
        externalId: over.externalId ?? `ext-${slug}`,
        slug,
        lang,
        version: over.version ?? 1,
        publishedVersion: over.publishedVersion === undefined ? 1 : over.publishedVersion,
        unpublishedAt: over.unpublishedAt ?? null,
        sourceVersion: over.sourceVersion ?? null,
        document: {
          lang,
          slug,
          title: over.title ?? `Title ${slug}`,
          tags: over.tags ?? ["ai"],
          provenance: { agent: over.agent ?? "agent-a" },
          body: "BODY-MUST-NOT-LEAK",
        } as never,
        keyId,
        ...(over.updatedAtSql
          ? { updatedAt: sql`${over.updatedAtSql}::timestamptz` as never }
          : {}),
      })
      .returning();
    return row!;
  };
  const seedPublication = async (
    articleId: string,
    publicationState: "queued" | "publishing" | "published" | "failed",
    createdAt: Date,
    kind: "publish" | "unpublish" = "publish",
  ) =>
    (
      await state
        .db!.insert(schema.contentPublications)
        .values({
          articleId,
          version: 1,
          content: "FULL-MARKDOWN-MUST-NOT-LEAK",
          state: publicationState,
          kind,
          keyId,
          createdAt,
        })
        .returning()
    )[0]!;
  const ids = (body: { items: readonly { id: string }[] }) => body.items.map((item) => item.id);

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18-bookworm").start();
    client = postgres(container.getConnectionUri(), { max: 5 });
    state.db = drizzle(client, { schema });
    await migrate(state.db, { migrationsFolder: "drizzle" });
  }, 180_000);
  afterAll(async () => {
    await client?.end();
    await container?.stop();
  });
  beforeEach(async () => {
    await client`truncate content_article_versions, content_api_requests, content_publications, content_articles, content_assets, content_api_keys, posts_meta, users cascade`;
    const keys = await state
      .db!.insert(schema.contentApiKeys)
      .values(
        (
          [
            ["reader", READER, ["articles:read"]],
            ["writer", WRITER, ["articles:write"]],
            ["uploader", UPLOADER, ["media:write"]],
          ] as const
        ).map(([name, token, scopes]) => ({
          name,
          tokenHash: createHash("sha256").update(token).digest("hex"),
          scopes: [...scopes],
        })),
      )
      .returning();
    keyId = keys[0]!.id;
  });

  it("computes all six statuses and filters by them", async () => {
    const draft = await seedArticle({ publishedVersion: null });
    const published = await seedArticle({ version: 2, publishedVersion: 2 });
    const changed = await seedArticle({ version: 3, publishedVersion: 2 });
    const publishing = await seedArticle({});
    await seedPublication(publishing.id, "queued", new Date("2026-10-01T00:00:00Z"));
    const failed = await seedArticle({});
    await seedPublication(failed.id, "failed", new Date("2026-10-01T00:00:00Z"));
    const unpublished = await seedArticle({ unpublishedAt: new Date("2026-10-01T00:00:00Z") });

    const all = await read("articles", articleListSchema);
    const statusOf = Object.fromEntries(all.items.map((item) => [item.id, item.status]));
    expect(statusOf).toEqual({
      [draft.id]: "draft",
      [published.id]: "published",
      [changed.id]: "changed",
      [publishing.id]: "publishing",
      [failed.id]: "failed",
      [unpublished.id]: "unpublished",
    });
    for (const [wanted, row] of [
      ["draft", draft],
      ["changed", changed],
      ["publishing", publishing],
      ["failed", failed],
      ["unpublished", unpublished],
      ["published", published],
    ] as const)
      expect(ids(await read(`articles?status=${wanted}`, articleListSchema))).toEqual([row.id]);
  });

  it("uses only the newest publication for the status", async () => {
    const article = await seedArticle({});
    await seedPublication(article.id, "failed", new Date("2026-10-01T00:00:00Z"));
    await seedPublication(article.id, "published", new Date("2026-10-02T00:00:00Z"));
    const list = await read("articles", articleListSchema);
    expect(list.items[0]?.status).toBe("published");
  });

  it("filters by lang, tag, agent and q, treating % and _ literally", async () => {
    const a1 = await seedArticle({
      slug: "alpha-post",
      title: "Alpha 100% real",
      tags: ["ai", "news"],
      agent: "bot-a",
    });
    const a2 = await seedArticle({
      slug: "beta-post",
      lang: "en",
      title: "Beta_post",
      tags: ["ai"],
      agent: "bot-b",
    });
    const a3 = await seedArticle({
      slug: "gamma",
      title: "Gamma",
      tags: ["devops"],
      agent: "bot-a",
    });
    const sorted = (list: { items: readonly { id: string }[] }) => ids(list).sort();
    const of = async (query: string) => sorted(await read(`articles?${query}`, articleListSchema));
    expect(await of("lang=en")).toEqual([a2.id]);
    expect(await of("tag=ai")).toEqual([a1.id, a2.id].sort());
    expect(await of("tag=news")).toEqual([a1.id]);
    expect(await of("agent=bot-a")).toEqual([a1.id, a3.id].sort());
    expect(await of("q=alpha")).toEqual([a1.id]);
    expect(await of("q=GAMMA")).toEqual([a3.id]);
    expect(await of("q=%25")).toEqual([a1.id]);
    expect(await of("q=_")).toEqual([a2.id]);
    expect(await of("tag=ai&agent=bot-b&lang=en")).toEqual([a2.id]);
    expect(await of("tag=ai&agent=bot-b&lang=ru")).toEqual([]);
  });

  it("returns light fields only", async () => {
    await seedArticle({ title: "Light" });
    const result = await call("articles");
    expect(JSON.stringify(result.body)).not.toContain("BODY-MUST-NOT-LEAK");
  });

  describe("cursor pagination", () => {
    // Two rows share one microsecond-exact updated_at, a third sits 200 microseconds below
    // them in the same millisecond. A cursor kept at millisecond precision skips both.
    const seedFive = async (publishedVersion: number | null = null) => {
      const tie = "2026-10-01T00:00:00.123456Z";
      return Promise.all(
        [
          ["2026-10-01T00:00:00.500000Z", 1],
          [tie, publishedVersion],
          [tie, publishedVersion],
          ["2026-10-01T00:00:00.123200Z", publishedVersion],
          ["2026-10-01T00:00:00.100000Z", publishedVersion],
        ].map(([at, published]) =>
          seedArticle({ updatedAtSql: at as string, publishedVersion: published as number | null }),
        ),
      );
    };
    const walk = async (query: string, path = "articles") => {
      const pages: string[][] = [];
      let cursor: string | null = null;
      do {
        const body: z.infer<typeof articleListSchema> = await read(
          `${path}?${query}${cursor ? `&cursor=${cursor}` : ""}`,
          articleListSchema,
        );
        pages.push(ids(body));
        cursor = body.nextCursor;
      } while (cursor && pages.length < 10);
      return pages;
    };

    it("visits every row exactly once across a microsecond tie", async () => {
      const rows = await seedFive(1);
      const pages = await walk("limit=2");
      expect(pages.map((p) => p.length)).toEqual([2, 2, 1]);
      expect(pages.flat().sort()).toEqual(rows.map((r) => r.id).sort());
    });

    it("keeps pages full when a status filter drops rows", async () => {
      // rows[0] is published, the other four are drafts.
      const rows = await seedFive(null);
      const pages = await walk("limit=2&status=draft");
      expect(pages.map((p) => p.length)).toEqual([2, 2]);
      expect(pages.flat().sort()).toEqual(
        rows
          .slice(1)
          .map((r) => r.id)
          .sort(),
      );
    });

    it("answers 422 for a garbage cursor and for a cursor that Postgres would choke on", async () => {
      for (const cursor of [
        "garbage",
        Buffer.from(
          JSON.stringify({ at: "2026-13-45T99:00:00.000000Z", id: crypto.randomUUID() }),
        ).toString("base64url"),
        Buffer.from(
          JSON.stringify({ at: "2026-10-01T00:00:00.000000Z", id: "not-a-uuid" }),
        ).toString("base64url"),
      ]) {
        const result = await call(`articles?cursor=${cursor}`);
        expect(result.status).toBe(422);
        expect(result.body.error.code).toBe("validation_error");
      }
      expect((await call("articles?bogus=1")).status).toBe(422);
      expect((await call("articles?limit=101")).status).toBe(422);
      expect((await call("articles?q=%20")).status).toBe(422);
      expect((await call("articles?limit=1e1")).status).toBe(422);
    });
  });

  describe("by-slug", () => {
    it("reports a stale translation, with the reason when the source version is unknown", async () => {
      await seedArticle({ slug: "pair", version: 3 });
      await seedArticle({ slug: "pair", lang: "en", externalId: "ext-pair", sourceVersion: 2 });
      let body = await read("articles/by-slug/pair", articleBySlugSchema);
      expect(body.translation).toEqual({ sourceVersion: 2, stale: true });
      expect([body.ru?.lang, body.en?.lang]).toEqual(["ru", "en"]);

      await state.db!.execute(
        sql`update content_articles set source_version = 3 where lang = 'en'`,
      );
      body = await read("articles/by-slug/pair", articleBySlugSchema);
      expect(body.translation).toEqual({ sourceVersion: 3, stale: false });

      await state.db!.execute(
        sql`update content_articles set source_version = null where lang = 'en'`,
      );
      body = await read("articles/by-slug/pair", articleBySlugSchema);
      expect(body.translation).toEqual({ sourceVersion: null, stale: true });
    });

    it("returns one side with translation null, and 404 for an unknown slug", async () => {
      await seedArticle({ slug: "solo" });
      const body = await read("articles/by-slug/solo", articleBySlugSchema);
      expect(body.en).toBeNull();
      expect(body.translation).toBeNull();
      expect((await call("articles/by-slug/nothing")).status).toBe(404);
      expect((await call("articles/by-slug/Bad_Slug")).status).toBe(422);
    });
  });

  describe("versions", () => {
    const seedHistory = async () => {
      const article = await seedArticle({ version: 5, publishedVersion: 5 });
      await state.db!.insert(schema.contentArticleVersions).values(
        [3, 5].map((version) => ({
          articleId: article.id,
          version,
          document: { title: `v${version}` } as never,
          actorKeyId: keyId,
        })),
      );
      return article;
    };

    it("lists only the versions that exist, newest first, with the current one", async () => {
      const article = await seedHistory();
      const body = await read(`articles/${article.id}/versions`, versionListSchema);
      expect(body.currentVersion).toBe(5);
      expect(body.items.map((item) => item.version)).toEqual([5, 3]);
      expect(JSON.stringify(body)).not.toContain("document");
    });

    it("reads a version with its document, and 404s a gap with the current version", async () => {
      const article = await seedHistory();
      const v3 = await read(`articles/${article.id}/versions/3`, articleVersionSchema);
      expect(v3.document).toEqual({ title: "v3" });
      const gap = await call(`articles/${article.id}/versions/4`);
      expect(gap.status).toBe(404);
      expect(gap.body.error.code).toBe("not_found");
      expect(gap.body.error.details).toEqual({ version: 4, currentVersion: 5 });
      expect((await call(`articles/${article.id}/versions/abc`)).status).toBe(422);
      expect((await call(`articles/${article.id}/versions/0`)).status).toBe(422);
      expect((await call(`articles/${crypto.randomUUID()}/versions`)).status).toBe(404);
    });
  });

  it("filters publications and pages them newest first by createdAt", async () => {
    const a = await seedArticle({});
    const b = await seedArticle({});
    const p1 = await seedPublication(a.id, "failed", new Date("2026-10-01T00:00:00Z"));
    const p2 = await seedPublication(a.id, "published", new Date("2026-10-02T00:00:00Z"));
    const p3 = await seedPublication(b.id, "queued", new Date("2026-10-03T00:00:00Z"), "unpublish");
    const all = await read("publications", publicationListSchema);
    expect(ids(all)).toEqual([p3.id, p2.id, p1.id]);
    expect(all.items[0]?.kind).toBe("unpublish");
    expect(JSON.stringify(all)).not.toContain("FULL-MARKDOWN-MUST-NOT-LEAK");
    expect(ids(await read(`publications?articleId=${a.id}`, publicationListSchema))).toEqual([
      p2.id,
      p1.id,
    ]);
    expect(ids(await read("publications?state=queued", publicationListSchema))).toEqual([p3.id]);
    const first = await read("publications?limit=2", publicationListSchema);
    expect(ids(first)).toEqual([p3.id, p2.id]);
    const second = await read(
      `publications?limit=2&cursor=${first.nextCursor}`,
      publicationListSchema,
    );
    expect(ids(second)).toEqual([p1.id]);
    expect(second.nextCursor).toBeNull();
    expect((await call("publications?state=nope")).status).toBe(422);
  });

  it("lists media with public fields only and pages it", async () => {
    const [m1, m2, m3] = await state
      .db!.insert(schema.contentAssets)
      .values(
        [1, 2, 3].map((n) => ({
          hash: `hash-${n}`,
          url: `https://artka.dev/uploads/${n}.png`,
          objectKey: `secret-key-${n}`,
          mimeType: "image/png",
          width: 10,
          height: 10,
          byteSize: 100,
          keyId,
          createdAt: new Date(`2026-10-0${n}T00:00:00Z`),
        })),
      )
      .returning();
    const first = await read("media?limit=2", mediaListSchema);
    expect(ids(first)).toEqual([m3!.id, m2!.id]);
    const second = await read(`media?limit=2&cursor=${first.nextCursor}`, mediaListSchema);
    expect(ids(second)).toEqual([m1!.id]);
    expect(JSON.stringify([first, second])).not.toMatch(/secret-key|hash-/);
  });

  it("reads posts-meta by slug", async () => {
    await state.db!.insert(schema.postsMeta).values({ slug: "meta-post", order: 4, pinned: true });
    const body = await read("posts-meta/meta-post", postMetaSchema);
    expect(body).toMatchObject({
      slug: "meta-post",
      order: 4,
      pinned: true,
      hiddenFromList: false,
    });
    expect((await call("posts-meta/absent")).status).toBe(404);
  });

  describe("scopes", () => {
    const article = "349ad05b-41ae-4b63-93ab-d7679c82c886";
    const paths = [
      "articles",
      "articles/by-slug/x",
      `articles/${article}/versions`,
      `articles/${article}/versions/1`,
      "publications",
      "media",
      "posts-meta/x",
    ];
    it.each(paths)("GET %s needs articles:read: a write-only key gets 403", async (path) => {
      expect((await call(path, WRITER)).status).toBe(403);
    });
    it("does not let a media:write key list media", async () => {
      expect((await call("media", UPLOADER)).status).toBe(403);
    });
    it("lets an articles:read key list media", async () => {
      expect((await call("media", READER)).status).toBe(200);
    });
  });
});
