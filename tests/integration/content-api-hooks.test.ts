// Post-publication hooks (IndexNow, social kickoff) of the worker, against a real Postgres.
// The two network-facing calls are mocked; claiming, leasing, batching and the social rows run for real.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
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
vi.mock("~/lib/seo/indexnow", async (original) => ({
  ...(await original<typeof import("~/lib/seo/indexnow")>()),
  pingIndexNow: vi.fn(),
}));
vi.mock("~/lib/social/service", async (original) => ({
  ...(await original<typeof import("~/lib/social/service")>()),
  kickoffSocial: vi.fn(),
}));

import { ALL } from "../../src/pages/api/v1/[...path]";
import { runPublicationHooks, HOOK_ATTEMPTS } from "../../src/lib/content-api/hooks";
import { apiError } from "../../src/lib/content-api/errors";
import { pingIndexNow } from "../../src/lib/seo/indexnow";
import { kickoffSocial } from "../../src/lib/social/service";
import type { ArticleDocument } from "../../src/lib/content-api/contract";

const ping = vi.mocked(pingIndexNow);
const kickoff = vi.mocked(kickoffSocial);

const document = (lang: "ru" | "en", slug: string): ArticleDocument => ({
  externalId: slug,
  lang,
  slug,
  title: "T",
  description: "D".repeat(40),
  summary: "S".repeat(40),
  body: "B",
  tags: ["ai"],
  keywords: [],
  sources: [{ url: "https://example.com/s", title: "S" }],
  faq: [],
  relatedSlugs: [],
  provenance: { agent: "integration" },
});

describe("worker hooks with PostgreSQL", () => {
  let container: StartedPostgreSqlContainer;
  let client: ReturnType<typeof postgres>;
  let keyId: string;

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
    vi.stubEnv("SOCIAL_DRAFTS_ENABLED", "true");
    await client`truncate social_posts, content_publications, content_articles, content_api_keys cascade`;
    const [key] = await state
      .db!.insert(schema.contentApiKeys)
      .values({ name: "k", tokenHash: "h", scopes: ["articles:publish"] })
      .returning();
    keyId = key!.id;
    vi.resetAllMocks();
    ping.mockResolvedValue("sent");
    kickoff.mockResolvedValue({ ok: true, channels: ["tg_ru"] });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const seed = async (
    lang: "ru" | "en",
    slug: string,
    over: Partial<typeof schema.contentPublications.$inferInsert> = {},
  ) => {
    const [article] = await state
      .db!.insert(schema.contentArticles)
      .values({
        externalId: `${slug}-${lang}`,
        lang,
        slug,
        document: document(lang, slug),
        publishedVersion: over.kind === "unpublish" ? null : 1,
        keyId,
      })
      .returning();
    const [job] = await state
      .db!.insert(schema.contentPublications)
      .values({
        articleId: article!.id,
        version: 1,
        content: "x",
        state: "published",
        keyId,
        ...over,
      })
      .returning();
    return job!;
  };
  const jobOf = async (id: string) =>
    (
      await state
        .db!.select()
        .from(schema.contentPublications)
        .where(eq(schema.contentPublications.id, id))
    )[0]!;
  const run = () => runPublicationHooks({ backoffMs: 0 });

  it("runs each hook exactly once when two worker calls race for one publication", async () => {
    const job = await seed("ru", "race");
    // The ping parks until released: a second call that could claim the same row would reach it now.
    let release!: () => void;
    const parked = new Promise<void>((resolve) => (release = resolve));
    ping.mockImplementation(async () => {
      await parked;
      return "sent";
    });
    const first = run();
    await vi.waitFor(() => expect(ping).toHaveBeenCalledTimes(1));
    const second = run();
    // The second call has had every chance to claim; give it time to finish its (empty) query.
    expect(await second).toBeNull();
    release();
    const report = await first;
    expect(report?.publicationIds).toEqual([job.id]);
    expect(ping).toHaveBeenCalledTimes(1);
    expect(kickoff).toHaveBeenCalledTimes(1);
    expect(kickoff).toHaveBeenCalledWith({ slug: "race", actor: { userId: null } });
    expect((await jobOf(job.id)).hooksDoneAt).not.toBeNull();
    expect(await run()).toBeNull();
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it("does not touch updated_at or the publication state, and ignores finished, failed and not-yet-published rows", async () => {
    const waiting = await seed("ru", "plain");
    const done = await seed("ru", "done", { hooksDoneAt: new Date() });
    const failed = await seed("ru", "failed", { state: "failed" });
    const active = await seed("ru", "active", { state: "publishing" });
    const report = await run();
    expect(report?.publicationIds).toEqual([waiting.id]);
    const after = await jobOf(waiting.id);
    expect([after.state, after.updatedAt.getTime()]).toEqual([
      "published",
      waiting.updatedAt.getTime(),
    ]);
    for (const other of [done, failed, active]) {
      expect((await jobOf(other.id)).hooksDoneAt?.getTime() ?? null).toBe(
        other.hooksDoneAt?.getTime() ?? null,
      );
    }
    expect(await run()).toBeNull();
  });

  it("retries a failed ping: failed, failed, sent is three attempts", async () => {
    await seed("ru", "retry");
    ping
      .mockResolvedValueOnce("failed")
      .mockResolvedValueOnce("failed")
      .mockResolvedValueOnce("sent");
    const report = await run();
    expect(ping).toHaveBeenCalledTimes(3);
    expect(report?.slugs[0]?.indexNow).toBe("sent");
  });

  it("gives up after three attempts when every hook throws, and still marks the publication done and published", async () => {
    const job = await seed("ru", "broken");
    ping.mockRejectedValue(new Error("network down"));
    kickoff.mockRejectedValue(new Error("llm down"));
    const report = await run();
    expect(ping).toHaveBeenCalledTimes(HOOK_ATTEMPTS);
    expect(kickoff).toHaveBeenCalledTimes(HOOK_ATTEMPTS);
    expect(report?.slugs[0]).toMatchObject({ indexNow: "failed", social: "failed" });
    const after = await jobOf(job.id);
    expect([after.state, after.hooksDoneAt]).toEqual(["published", expect.any(Date)]);
    expect(await run()).toBeNull();
  });

  it("does not retry a refusal (4xx) from the social kickoff", async () => {
    await seed("ru", "refused");
    kickoff.mockRejectedValue(apiError(409, "article_not_published", "gone"));
    const report = await run();
    expect(kickoff).toHaveBeenCalledTimes(1);
    expect(report?.slugs[0]?.social).toBe("skipped");
  });

  it("skips the kickoff, not the ping, when the feature flag is off", async () => {
    vi.stubEnv("SOCIAL_DRAFTS_ENABLED", "false");
    await seed("ru", "flag-off");
    const report = await run();
    expect(ping).toHaveBeenCalledWith("posts", "flag-off", false);
    expect(kickoff).not.toHaveBeenCalled();
    expect(report?.slugs[0]?.social).toBe("none");
  });

  it("pings an unpublished EN page with its twin, starts no kickoff and supersedes the EN drafts only", async () => {
    await seed("en", "gone", { kind: "unpublish" });
    const draft = (
      channel: "x_en" | "li_en" | "tg_ru",
      status: "pending" | "generating" | "sent",
    ) => ({
      postCollection: "posts",
      postSlug: "gone",
      channel,
      status,
      sourceHash: "h",
      body: "b",
    });
    await state
      .db!.insert(schema.socialPosts)
      .values([draft("x_en", "pending"), draft("li_en", "generating"), draft("tg_ru", "pending")]);
    await run();
    expect(ping).toHaveBeenCalledWith("posts", "gone", true);
    expect(kickoff).not.toHaveBeenCalled();
    const rows = await state.db!.select().from(schema.socialPosts);
    expect(Object.fromEntries(rows.map((r) => [r.channel, r.status]))).toEqual({
      x_en: "superseded",
      li_en: "superseded",
      tg_ru: "pending",
    });
  });

  it("an unpublished RU page supersedes every unfinished draft but not a sent one", async () => {
    await seed("ru", "gone-ru", { kind: "unpublish" });
    await state.db!.insert(schema.socialPosts).values(
      (["x_en", "li_en", "tg_ru"] as const).map((channel) => ({
        postCollection: "posts",
        postSlug: "gone-ru",
        channel,
        status: channel === "tg_ru" ? ("sent" as const) : ("pending" as const),
        sourceHash: "h",
        body: "b",
      })),
    );
    await run();
    const rows = await state.db!.select().from(schema.socialPosts);
    expect(Object.fromEntries(rows.map((r) => [r.channel, r.status]))).toEqual({
      x_en: "superseded",
      li_en: "superseded",
      tg_ru: "sent",
    });
  });

  it("an EN publication after RU runs the kickoff again, so x_en and li_en can be created", async () => {
    await seed("ru", "pair");
    await run();
    await seed("en", "pair");
    await run();
    expect(kickoff).toHaveBeenCalledTimes(2);
    // The EN page now exists: the second ping covers both languages.
    expect(ping.mock.calls.map((c) => c[2])).toEqual([false, true]);
  });

  it("a batch waits for its last member, then pings and kicks off once for the pair", async () => {
    const batchId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const ru = await seed("ru", "batch", { batchId });
    const en = await seed("en", "batch", { batchId, state: "publishing" });
    expect(await run()).toBeNull();
    expect(ping).not.toHaveBeenCalled();

    await state
      .db!.update(schema.contentPublications)
      .set({ state: "published" })
      .where(eq(schema.contentPublications.id, en.id));
    const report = await run();
    expect([...(report?.publicationIds ?? [])].sort()).toEqual([ru.id, en.id].sort());
    expect(ping).toHaveBeenCalledTimes(1);
    expect(ping).toHaveBeenCalledWith("posts", "batch", true);
    expect(kickoff).toHaveBeenCalledTimes(1);
    expect(await run()).toBeNull();
  });

  it("a crashed call leaves the lease: the hooks are not handed out again before it expires", async () => {
    const job = await seed("ru", "leased");
    ping.mockImplementation(async () => {
      throw new Error("process died");
    });
    await run();
    // Simulate a call that died before marking done: clear the mark, keep the lease.
    await state
      .db!.update(schema.contentPublications)
      .set({ hooksDoneAt: null })
      .where(eq(schema.contentPublications.id, job.id));
    const leased = await jobOf(job.id);
    expect(leased.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 60_000);
    expect(await run()).toBeNull();
    await state
      .db!.update(schema.contentPublications)
      .set({ nextAttemptAt: new Date(Date.now() - 1_000) })
      .where(eq(schema.contentPublications.id, job.id));
    expect((await run())?.publicationIds).toEqual([job.id]);
  });

  it("the worker route answers {worked:false} with no hooks key when nothing is waiting, and reports the hooks it ran", async () => {
    const secret = "w".repeat(40);
    vi.stubEnv("CONTENT_WORKER_SECRET", secret);
    const tick = async () => {
      const response = await ALL({
        params: { path: "_worker" },
        request: new Request("https://artka.dev/api/v1/_worker/", {
          method: "POST",
          headers: { authorization: `Bearer ${secret}` },
        }),
      } as unknown as APIContext);
      return { status: response.status, body: await response.json() };
    };
    expect(await tick()).toEqual({ status: 200, body: { worked: false } });
    const job = await seed("ru", "via-route");
    const result = await tick();
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      worked: false,
      hooks: {
        publicationIds: [job.id],
        slugs: [{ slug: "via-route", indexNow: "sent", social: "done" }],
      },
    });
    expect(await tick()).toEqual({ status: 200, body: { worked: false } });
  });
});
