import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { bootTestDb, type TestDb } from "../setup";
import { socialPosts, users } from "~/lib/db/schema";

// ── Module mocks (must be hoisted before any dynamic imports of the module) ──

vi.mock("~/lib/social/config", async () => {
  const actual = await vi.importActual<typeof import("~/lib/social/config")>("~/lib/social/config");
  return {
    ...actual,
    validateSocialEnv: vi.fn().mockReturnValue({ ok: true, env: {} }),
  };
});

vi.mock("~/lib/social/pipeline", () => ({
  runPipeline: vi.fn().mockResolvedValue({
    drafts: {
      x_en: { ok: true, value: { body: "x out", mediaUrl: null } },
      li_en: { ok: true, value: { body: "li out".repeat(300), mediaUrl: null } },
      tg_ru: { ok: true, value: { body: "tg out".repeat(60), mediaUrl: null } },
    },
    annotations: { x_en: [], li_en: [], tg_ru: [] },
  }),
}));

vi.mock("~/actions/_social", async () => {
  const real = await vi.importActual<typeof import("~/actions/_social")>("~/actions/_social");
  return {
    ...real,
    loadArticle: vi.fn().mockResolvedValue({
      collection: "posts",
      slug: "test-post-19",
      title: "T",
      summary: "S",
      body: "B",
      tags: [],
      pubDate: new Date("2026-01-01T00:00:00Z"),
      cover: null,
      lang: "ru",
      sourceUrl: "https://artka.dev/blog/test-post-19",
      hasEnTwin: true,
    }),
  };
});

// ── Test state ───────────────────────────────────────────────────────────────

const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";
const TEST_SLUG = "test-post-19";

let env: TestDb;

beforeAll(async () => {
  env = await bootTestDb();
  // Point the app-level db singleton at the test container by setting
  // DATABASE_URL before the lazy proxy's first call.
  process.env.DATABASE_URL = env.container.getConnectionUri();
}, 180_000);

afterAll(async () => {
  await env.teardown();
});

beforeEach(async () => {
  process.env.SOCIAL_DRAFTS_ENABLED = "true";
  await env.db.delete(socialPosts).where(eq(socialPosts.postSlug, TEST_SLUG));

  // Ensure test user exists (FK target for createdById).
  await env.db
    .insert(users)
    .values({ id: TEST_USER_ID, email: "test-19@example.com", role: "admin" })
    .onConflictDoNothing();
});

afterEach(() => {
  delete process.env.SOCIAL_DRAFTS_ENABLED;
});

// Build a minimal ActionAPIContext-like object that satisfies assertAdmin and
// any field the handler reads.
const mockCtx = (role: "admin" | "editor" = "admin") =>
  ({
    locals: { user: { id: TEST_USER_ID, role } },
    request: new Request("http://test/"),
    cookies: { get: () => undefined, set: () => {} } as never,
    url: new URL("http://test/"),
  }) as never;

// ── Tests ────────────────────────────────────────────────────────────────────

describe("socialDrafts.generate", () => {
  it("inserts 3 generating rows transactionally then pipeline writes pending", async () => {
    const { generateHandler } = await import("~/actions/socialDrafts");
    const r = await generateHandler(
      { slug: TEST_SLUG, collection: "posts", channels: undefined },
      mockCtx(),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      // Give void pipeline a moment to complete (mock resolves instantly).
      await new Promise((res) => setTimeout(res, 50));
    }
    const rows = await env.db.select().from(socialPosts).where(eq(socialPosts.postSlug, TEST_SLUG));
    expect(rows.length).toBe(3);
    // After pipeline resolves they should be "pending" (mock ok:true).
    expect(rows.every((r) => r.status === "pending")).toBe(true);
  });

  it("supersedes old rows with a different sourceHash", async () => {
    // Pre-seed a stale row.
    await env.db.insert(socialPosts).values({
      postCollection: "posts",
      postSlug: TEST_SLUG,
      channel: "x_en",
      sourceHash: "OLD_HASH_THAT_WILL_NEVER_MATCH",
      status: "pending",
      body: "old draft",
      createdById: TEST_USER_ID,
    });

    const { generateHandler } = await import("~/actions/socialDrafts");
    await generateHandler({ slug: TEST_SLUG, collection: "posts", channels: undefined }, mockCtx());

    const stale = await env.db
      .select()
      .from(socialPosts)
      .where(eq(socialPosts.sourceHash, "OLD_HASH_THAT_WILL_NEVER_MATCH"));
    expect(stale[0]?.status).toBe("superseded");
  });

  it("returns ok:false when feature flag is off", async () => {
    process.env.SOCIAL_DRAFTS_ENABLED = "false";
    const { generateHandler } = await import("~/actions/socialDrafts");
    const r = await generateHandler(
      { slug: TEST_SLUG, collection: "posts", channels: undefined },
      mockCtx(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("flag");
  });

  it("throws FORBIDDEN when caller is not admin or editor", async () => {
    const { generateHandler } = await import("~/actions/socialDrafts");
    const badCtx = {
      locals: { user: { id: TEST_USER_ID, role: "reader" } },
    };
    await expect(
      generateHandler({ slug: TEST_SLUG, collection: "posts", channels: undefined }, badCtx),
    ).rejects.toThrow("Admins only");
  });
});
