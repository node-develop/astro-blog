import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { bootTestDb, type TestDb } from "../setup";
import { socialPosts, users } from "~/lib/db/schema";

vi.mock("~/lib/social/critic", async () => {
  const actual = await vi.importActual<typeof import("~/lib/social/critic")>("~/lib/social/critic");
  return {
    ...actual,
    runCritic: vi.fn().mockResolvedValue({
      x_en: [{ severity: "warn", kind: "tone", message: "looks fine" }],
      li_en: [],
      tg_ru: [],
    }),
  };
});

vi.mock("~/actions/_social", async () => {
  const actual = await vi.importActual<typeof import("~/actions/_social")>("~/actions/_social");
  return {
    ...actual,
    loadArticle: vi.fn().mockResolvedValue({
      collection: "posts",
      slug: "test-pub-26",
      title: "T",
      summary: "S",
      body: "B",
      tags: [],
      pubDate: new Date("2026-01-01"),
      cover: null,
      lang: "ru",
      sourceUrl: "https://artka.dev/blog/test-pub-26",
      hasEnTwin: true,
    }),
  };
});

vi.mock("~/lib/social/pipeline", () => ({
  runPipeline: vi.fn().mockResolvedValue({
    drafts: { x_en: { ok: true, value: { body: "x", mediaUrl: null } } },
    annotations: { x_en: [], li_en: [], tg_ru: [] },
  }),
}));

const TEST_USER_ID = "00000000-0000-0000-0000-000000000003";
const SLUG = "test-pub-26";

let env: TestDb;

beforeAll(async () => {
  env = await bootTestDb();
  process.env.DATABASE_URL = env.container.getConnectionUri();
  process.env.SOCIAL_DRAFTS_ENABLED = "true";
}, 180_000);
afterAll(async () => {
  await env.teardown();
});
beforeEach(async () => {
  await env.db.delete(socialPosts).where(eq(socialPosts.postSlug, SLUG));
  await env.db
    .insert(users)
    .values({ id: TEST_USER_ID, email: "26@x.com", role: "admin" })
    .onConflictDoNothing();
  vi.clearAllMocks();
});

const ctx = () =>
  ({
    locals: { user: { id: TEST_USER_ID, role: "admin" as const } },
    request: new Request("http://test/"),
    cookies: { get: () => undefined, set: () => {} },
    url: new URL("http://test/"),
  }) as never;

const makePending = async (channel: "x_en" | "li_en" | "tg_ru" = "x_en") => {
  const [row] = await env.db
    .insert(socialPosts)
    .values({
      postCollection: "posts",
      postSlug: SLUG,
      channel,
      sourceHash: "h",
      status: "pending",
      body: "old body",
      createdById: TEST_USER_ID,
    })
    .returning();
  return row!;
};

describe("socialDrafts.save", () => {
  it("updates body of a pending row", async () => {
    const row = await makePending();
    const { saveHandler } = await import("~/actions/socialDrafts");
    const r = await saveHandler({ id: row.id, body: "new body", threadTail: undefined }, ctx());
    expect(r.ok).toBe(true);
    const [after] = await env.db.select().from(socialPosts).where(eq(socialPosts.id, row.id));
    expect(after?.body).toBe("new body");
  });

  it("does NOT touch a sent row", async () => {
    const row = await makePending();
    await env.db.update(socialPosts).set({ status: "sent" }).where(eq(socialPosts.id, row.id));
    const { saveHandler } = await import("~/actions/socialDrafts");
    await saveHandler({ id: row.id, body: "should not change" }, ctx());
    const [after] = await env.db.select().from(socialPosts).where(eq(socialPosts.id, row.id));
    expect(after?.body).toBe("old body");
  });
});

describe("socialDrafts.skip", () => {
  it("marks pending row skipped and stores reason", async () => {
    const row = await makePending();
    const { skipHandler } = await import("~/actions/socialDrafts");
    await skipHandler({ id: row.id, reason: "irrelevant" }, ctx());
    const [after] = await env.db.select().from(socialPosts).where(eq(socialPosts.id, row.id));
    expect(after?.status).toBe("skipped");
    expect(after?.errorMessage).toBe("irrelevant");
  });
});

describe("socialDrafts.recheck", () => {
  it("re-runs critic and updates annotations", async () => {
    const row = await makePending();
    const { recheckHandler } = await import("~/actions/socialDrafts");
    const r = await recheckHandler({ id: row.id }, ctx());
    expect(r.ok).toBe(true);
    const [after] = await env.db.select().from(socialPosts).where(eq(socialPosts.id, row.id));
    const notes = after?.criticAnnotations as Array<{ kind: string }> | null;
    expect(notes?.length).toBe(1); // mocked critic returned 1 warn for x_en
  });
});

describe("socialDrafts.regenerate", () => {
  it("supersedes existing rows and triggers fresh generate", async () => {
    await makePending("x_en");
    await makePending("li_en");
    const { regenerateHandler } = await import("~/actions/socialDrafts");
    const r = await regenerateHandler({ slug: SLUG, collection: "posts" }, ctx());
    expect(r.ok).toBe(true);
    const allRows = await env.db.select().from(socialPosts).where(eq(socialPosts.postSlug, SLUG));
    const superseded = allRows.filter((r) => r.status === "superseded");
    expect(superseded.length).toBeGreaterThanOrEqual(2); // old x_en + li_en
  });
});
