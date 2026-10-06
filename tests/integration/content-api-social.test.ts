// Social drafts through /api/v1/social against a real Postgres. The model pipeline, the critic,
// the three channel clients and the env check are mocked at the module boundary; everything that
// reads articles and writes `social_posts` runs for real.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
// The file-post fallback (TODO(cutover), prompt 3.6) reads POSTS_DIR: a legacy post with an EN twin.
const postsDir = await vi.hoisted(async () => {
  const { writeLegacyPosts } = await import("../support/legacy-posts");
  return writeLegacyPosts({
    "legacy-twin.md": { title: "Legacy twin" },
    "en/legacy-twin.md": { title: "Legacy twin" },
  });
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
vi.mock("~/lib/social/config", async (original) => ({
  ...(await original<typeof import("~/lib/social/config")>()),
  validateSocialEnv: vi.fn().mockReturnValue({ ok: true, env: {} }),
}));
vi.mock("~/lib/social/pipeline", () => ({ runPipeline: vi.fn() }));
vi.mock("~/lib/social/critic", async (original) => ({
  ...(await original<typeof import("~/lib/social/critic")>()),
  runCritic: vi.fn(),
}));
vi.mock("~/lib/social/clients/x", () => ({ postTweet: vi.fn(), postThread: vi.fn() }));
vi.mock("~/lib/social/clients/linkedin", () => ({ postShare: vi.fn() }));
vi.mock("~/lib/social/clients/telegram", () => ({ sendMessage: vi.fn() }));

import { ALL } from "../../src/pages/api/v1/[...path]";
import { socialDraftListSchema, socialDraftSchema } from "../../src/lib/content-api/contract";
import { serializeArticle } from "../../src/lib/content-api/markdown";
import { runPipeline } from "../../src/lib/social/pipeline";
import { runCritic } from "../../src/lib/social/critic";
import { postTweet } from "../../src/lib/social/clients/x";
import { sendMessage as tgSend } from "../../src/lib/social/clients/telegram";
import { ok } from "../../src/lib/social/errors";
import type { ArticleDocument } from "../../src/lib/content-api/contract";
import type { SocialChannel } from "../../src/lib/social/types";

const tokenOf = (letter: string) => `artka_${letter.repeat(43)}`;
const KEYS = {
  full: tokenOf("a"),
  read: tokenOf("b"),
  write: tokenOf("c"),
} as const;
const SLUG = "social-api-article";

const document: ArticleDocument = {
  externalId: SLUG,
  lang: "ru",
  slug: SLUG,
  title: "Draft title that is not live",
  description: "Description of the social API integration test article.",
  summary: "Summary of the social API integration test article for the drafts.",
  body: "## Draft body\n\nText nobody has published.",
  tags: ["ai"],
  keywords: [],
  sources: [{ url: "https://example.com/s", title: "Source" }],
  faq: [],
  relatedSlugs: [],
  provenance: { agent: "integration" },
};

const call = async (method: string, path: string, bearer: string, body?: unknown) => {
  const response = await ALL({
    params: { path: path.split("?")[0] },
    request: new Request(`https://artka.dev/api/v1/${path}`, {
      method,
      headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  } as unknown as APIContext);
  return { status: response.status, body: await response.json() };
};

describe("social drafts through the content API", () => {
  let container: StartedPostgreSqlContainer;
  let client: ReturnType<typeof postgres>;
  let keyId: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:18-bookworm").start();
    client = postgres(container.getConnectionUri(), { max: 5 });
    state.db = drizzle(client, { schema });
    await migrate(state.db, { migrationsFolder: "drizzle" });
    vi.stubEnv("SITE_URL", "https://artka.dev");
  }, 180_000);
  afterAll(async () => {
    vi.unstubAllEnvs();
    await client?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    vi.stubEnv("SOCIAL_DRAFTS_ENABLED", "true");
    await client`truncate social_posts, content_publications, content_articles, content_assets, content_api_keys cascade`;
    const rows = await state
      .db!.insert(schema.contentApiKeys)
      .values(
        (
          [
            ["full", KEYS.full, ["social:read", "social:write", "social:publish"]],
            ["read", KEYS.read, ["social:read"]],
            ["write", KEYS.write, ["social:read", "social:write"]],
          ] as const
        ).map(([name, token, scopes]) => ({
          name,
          tokenHash: createHash("sha256").update(token).digest("hex"),
          scopes: [...scopes],
        })),
      )
      .returning();
    keyId = rows[0]!.id;
    vi.clearAllMocks();
    // The pipeline answers for exactly the channels it was asked for.
    vi.mocked(runPipeline).mockImplementation(async ({ channels }) => ({
      drafts: Object.fromEntries(
        channels.map((channel: SocialChannel) => [
          channel,
          { ok: true as const, value: { body: `body ${channel}`, mediaUrl: null } },
        ]),
      ),
      annotations: { x_en: [], li_en: [], tg_ru: [] },
    }));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("SITE_URL", "https://artka.dev");
  });

  /** A live article: `publishedContent` is what the worker verified, `document` may be a later draft. */
  const seedArticle = async (
    lang: "ru" | "en",
    options: {
      live?: boolean;
      title?: string;
      cover?: ArticleDocument["cover"];
      assets?: { id: string; url: string; width: number; height: number }[];
    } = {},
  ) => {
    const live = options.live ?? true;
    const published = {
      ...document,
      lang,
      title: options.title ?? `Live ${lang} title`,
      body: "## Live body\n\nThe published text.",
      ...(options.cover ? { cover: options.cover } : {}),
    };
    const content = await serializeArticle(
      published,
      options.assets ?? [],
      "00000000-0000-4000-8000-000000000001",
      new Date("2026-02-03T00:00:00Z"),
    );
    await state.db!.insert(schema.contentArticles).values({
      externalId: SLUG,
      lang,
      slug: SLUG,
      version: 2,
      document: { ...document, lang },
      publishedContent: live ? content : null,
      publishedVersion: live ? 1 : null,
      firstPublishedAt: live ? new Date("2026-02-03T00:00:00Z") : null,
      keyId,
    });
  };
  const rowsOf = (slug = SLUG) =>
    state.db!.select().from(schema.socialPosts).where(eq(schema.socialPosts.postSlug, slug));
  const settled = async (count: number) => {
    const deadline = Date.now() + 5_000;
    for (;;) {
      const rows = await rowsOf();
      if (rows.length >= count && rows.every((row) => row.status !== "generating")) return rows;
      if (Date.now() > deadline) throw new Error(`drafts did not settle: ${JSON.stringify(rows)}`);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  };
  const channelsOf = (rows: readonly { channel: string; status: string }[], status?: string) =>
    rows
      .filter((row) => (status ? row.status === status : true))
      .map((row) => row.channel)
      .sort();

  it("creates tg_ru for a RU article; when EN goes live later, a second generate adds x_en and li_en and no second tg_ru", async () => {
    await seedArticle("ru");
    const first = await call("POST", "social/generate", KEYS.full, { slug: SLUG });
    expect([first.status, first.body]).toEqual([202, { channels: ["tg_ru"] }]);
    await settled(1);

    await seedArticle("en");
    const second = await call("POST", "social/generate", KEYS.full, { slug: SLUG });
    expect(second.status).toBe(202);
    expect([...second.body.channels].sort()).toEqual(["li_en", "x_en"]);
    const rows = await settled(3);
    expect(channelsOf(rows)).toEqual(["li_en", "tg_ru", "x_en"]);
    expect(channelsOf(rows, "pending")).toEqual(["li_en", "tg_ru", "x_en"]);
    // The pipeline was asked for the missing channels only.
    expect(vi.mocked(runPipeline).mock.calls.map(([input]) => [...input.channels].sort())).toEqual([
      ["tg_ru"],
      ["li_en", "x_en"],
    ]);

    // Nothing is missing now: 200 with no channels, no pipeline run.
    const third = await call("POST", "social/generate", KEYS.full, { slug: SLUG });
    expect([third.status, third.body]).toEqual([200, { channels: [] }]);
    expect(runPipeline).toHaveBeenCalledTimes(2);
  });

  it("does not bring back a channel a person skipped; naming it does", async () => {
    await seedArticle("ru");
    await call("POST", "social/generate", KEYS.full, { slug: SLUG });
    const [tg] = await settled(1);
    const skipped = await call("POST", `social/${tg!.id}/skip`, KEYS.full, { reason: "not now" });
    expect([skipped.status, skipped.body.status]).toEqual([200, "skipped"]);

    await seedArticle("en");
    const implicit = await call("POST", "social/generate", KEYS.full, { slug: SLUG });
    expect([...implicit.body.channels].sort()).toEqual(["li_en", "x_en"]);
    const rows = await settled(3);
    expect(channelsOf(rows, "skipped")).toEqual(["tg_ru"]);
    expect(channelsOf(rows, "pending")).toEqual(["li_en", "x_en"]);

    const explicit = await call("POST", "social/generate", KEYS.full, {
      slug: SLUG,
      channels: ["tg_ru"],
    });
    expect(explicit.body).toEqual({ channels: ["tg_ru"] });
  });

  it("drafts from the published text, never from a later unpublished draft", async () => {
    await seedArticle("ru", { title: "Live RU title" });
    await call("POST", "social/generate", KEYS.full, { slug: SLUG });
    await settled(1);
    const { article } = vi.mocked(runPipeline).mock.calls[0]![0]!;
    expect(article.title).toBe("Live RU title");
    expect(article.body).toContain("The published text.");
    expect(article.body).not.toContain("Text nobody has published");
    expect(article.pubDate.toISOString()).toBe("2026-02-03T00:00:00.000Z");
  });

  it("hands the pipeline an absolute URL for an asset cover", async () => {
    const assetId = "11111111-1111-4111-8111-111111111111";
    await seedArticle("ru", {
      cover: { assetId, alt: "A cat" },
      assets: [{ id: assetId, url: "/uploads/2026/10/cat.png", width: 800, height: 600 }],
    });
    await call("POST", "social/generate", KEYS.full, { slug: SLUG });
    await settled(1);
    const { article } = vi.mocked(runPipeline).mock.calls[0]![0]!;
    expect(article.cover).toEqual({
      src: "https://artka.dev/uploads/2026/10/cat.png",
      alt: "A cat",
    });
  });

  it("refuses an API article that is not published (409), without falling back to a file", async () => {
    await seedArticle("ru", { live: false });
    const result = await call("POST", "social/generate", KEYS.full, { slug: SLUG });
    expect([result.status, result.body.error.code]).toEqual([409, "article_not_published"]);
    expect(runPipeline).not.toHaveBeenCalled();
    expect(await rowsOf()).toHaveLength(0);
  });

  it("falls back to the file post for a slug with no article row, and 404s an unknown slug", async () => {
    const result = await call("POST", "social/generate", KEYS.full, { slug: "legacy-twin" });
    expect(result.status).toBe(202);
    expect([...result.body.channels].sort()).toEqual(["li_en", "tg_ru", "x_en"]); // it has an EN twin file
    await vi.waitFor(() => expect(runPipeline).toHaveBeenCalled());
    const missing = await call("POST", "social/generate", KEYS.full, { slug: "no-such-slug-xyz" });
    expect([missing.status, missing.body.error.code]).toEqual([404, "article_not_found"]);
    // A slug that is not a slug never reaches the file system.
    const traversal = await call("POST", "social/generate", KEYS.full, { slug: "../../CLAUDE" });
    expect(traversal.status).toBe(422);
  });

  it("answers generate with 403 social_disabled when the flag is off, while reading still works", async () => {
    vi.stubEnv("SOCIAL_DRAFTS_ENABLED", "false");
    await seedArticle("ru");
    const generate = await call("POST", "social/generate", KEYS.full, { slug: SLUG });
    expect([generate.status, generate.body.error.code]).toEqual([403, "social_disabled"]);
    const list = await call("GET", "social", KEYS.read);
    expect([list.status, list.body]).toEqual([200, { items: [], nextCursor: null }]);
  });

  describe("publish, save, skip, recheck", () => {
    const seedDraft = async (over: Partial<typeof schema.socialPosts.$inferInsert> = {}) => {
      const [row] = await state
        .db!.insert(schema.socialPosts)
        .values({
          postCollection: "posts",
          postSlug: SLUG,
          channel: "tg_ru",
          sourceHash: "h",
          status: "pending",
          body: "draft body",
          ...over,
        })
        .returning();
      return row!;
    };
    const status = async (id: string) =>
      (await state.db!.select().from(schema.socialPosts).where(eq(schema.socialPosts.id, id)))[0]!
        .status;
    const BLOCK = [{ severity: "block", kind: "fact", message: "wrong claim" }];

    it("refuses a critic-blocked draft without force and leaves it pending; force sends it once", async () => {
      vi.mocked(tgSend).mockResolvedValue(ok({ id: "1", url: "https://t.me/c/1" }));
      const draft = await seedDraft({ criticAnnotations: BLOCK as never });

      const blocked = await call("POST", `social/${draft.id}/publish`, KEYS.full, {});
      expect([blocked.status, blocked.body.error.code]).toEqual([409, "critic_block"]);
      expect(await status(draft.id)).toBe("pending");
      expect(tgSend).not.toHaveBeenCalled();

      const forced = await call("POST", `social/${draft.id}/publish`, KEYS.full, { force: true });
      expect(forced.status).toBe(200);
      expect(forced.body.url).toBe("https://t.me/c/1");
      expect(socialDraftSchema.parse(forced.body.draft)).toMatchObject({
        status: "sent",
        externalUrl: "https://t.me/c/1",
        blocked: true,
      });

      // A repeat must not post again.
      const again = await call("POST", `social/${draft.id}/publish`, KEYS.full, { force: true });
      expect([again.status, again.body.error.code]).toEqual([409, "draft_not_pending"]);
      expect(tgSend).toHaveBeenCalledTimes(1);
    });

    it("answers 502 social_send_failed when the network refuses, and records the failure", async () => {
      const { err, transportError } = await import("../../src/lib/social/errors");
      vi.mocked(postTweet).mockResolvedValue(err(transportError("x_en", 422, "bad input")));
      const draft = await seedDraft({ channel: "x_en" });
      const result = await call("POST", `social/${draft.id}/publish`, KEYS.full, {});
      expect([result.status, result.body.error.code]).toEqual([502, "social_send_failed"]);
      expect(result.body.error.details.draft.status).toBe("failed");
      expect(await status(draft.id)).toBe("failed");
    });

    it("edits a pending draft; a sent one is 409 and an unknown id 404", async () => {
      const draft = await seedDraft();
      const saved = await call("PUT", `social/${draft.id}`, KEYS.write, {
        body: "new body",
        threadTail: ["tail"],
      });
      expect(socialDraftSchema.parse(saved.body)).toMatchObject({
        body: "new body",
        threadTail: ["tail"],
      });
      await state
        .db!.update(schema.socialPosts)
        .set({ status: "sent" })
        .where(eq(schema.socialPosts.id, draft.id));
      const sent = await call("PUT", `social/${draft.id}`, KEYS.write, { body: "again" });
      expect([sent.status, sent.body.error.code]).toEqual([409, "draft_not_pending"]);
      const unknown = await call("PUT", "social/99999999-9999-4999-8999-999999999999", KEYS.write, {
        body: "x",
      });
      expect([unknown.status, unknown.body.error.code]).toEqual([404, "not_found"]);
    });

    it("rechecks with the critic and reports the new notes", async () => {
      await seedArticle("ru");
      vi.mocked(runCritic).mockResolvedValue({ tg_ru: BLOCK } as never);
      const draft = await seedDraft();
      const result = await call("POST", `social/${draft.id}/recheck`, KEYS.write);
      expect(result.status).toBe(200);
      expect(socialDraftSchema.parse(result.body)).toMatchObject({
        criticNotes: BLOCK,
        blocked: true,
      });
    });

    it("rechecks a draft made from a file post while an unpublished API row shares its slug", async () => {
      const fileSlug = "legacy-twin";
      await state.db!.insert(schema.contentArticles).values({
        externalId: fileSlug,
        lang: "ru",
        slug: fileSlug,
        version: 1,
        document: { ...document, slug: fileSlug, externalId: fileSlug },
        keyId,
      });
      vi.mocked(runCritic).mockResolvedValue({ tg_ru: BLOCK } as never);
      const draft = await seedDraft({ postSlug: fileSlug });
      const result = await call("POST", `social/${draft.id}/recheck`, KEYS.write);
      expect([result.status, result.body.blocked]).toEqual([200, true]);
    });

    it("lists drafts newest first, filtered by slug and status, in strict shape", async () => {
      const a = await seedDraft({ channel: "tg_ru" });
      const b = await seedDraft({ channel: "x_en", status: "skipped" });
      await seedDraft({ postSlug: "other-slug" });
      const all = await call("GET", `social?slug=${SLUG}`, KEYS.read);
      const parsed = socialDraftListSchema.parse(all.body);
      expect(parsed.items.map((item) => item.id)).toEqual([b.id, a.id]);
      const skipped = await call("GET", `social?slug=${SLUG}&status=skipped`, KEYS.read);
      expect(socialDraftListSchema.parse(skipped.body).items.map((item) => item.id)).toEqual([
        b.id,
      ]);
      const paged = await call("GET", `social?slug=${SLUG}&limit=1`, KEYS.read);
      expect(paged.body.items).toHaveLength(1);
      expect(typeof paged.body.nextCursor).toBe("string");
    });
  });

  it("enforces the three scopes", async () => {
    await seedArticle("ru");
    const draft = (
      await state
        .db!.insert(schema.socialPosts)
        .values({
          postCollection: "posts",
          postSlug: SLUG,
          channel: "tg_ru",
          sourceHash: "h",
          status: "pending",
          body: "b",
        })
        .returning()
    )[0]!;
    const readOnly = await Promise.all([
      call("GET", "social", KEYS.read),
      call("POST", "social/generate", KEYS.read, { slug: SLUG }),
      call("PUT", `social/${draft.id}`, KEYS.read, { body: "x" }),
      call("POST", `social/${draft.id}/skip`, KEYS.read, {}),
      call("POST", `social/${draft.id}/recheck`, KEYS.read),
      call("POST", `social/${draft.id}/publish`, KEYS.read, {}),
    ]);
    expect(readOnly.map((r) => r.status)).toEqual([200, 403, 403, 403, 403, 403]);
    // write is not publish
    const writeOnly = await call("POST", `social/${draft.id}/publish`, KEYS.write, {});
    expect([writeOnly.status, writeOnly.body.error.message]).toEqual([
      403,
      "Required scope: social:publish",
    ]);
    expect(runPipeline).not.toHaveBeenCalled();
    expect(await status(draft.id)).toBe("pending");

    async function status(id: string) {
      return (
        await state.db!.select().from(schema.socialPosts).where(eq(schema.socialPosts.id, id))
      )[0]!.status;
    }
  });
});
