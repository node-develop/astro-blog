// socialDrafts.* Actions against a real Postgres (one Testcontainers boot for
// the whole module). The LLM pipeline, critic, article loader and the three
// channel clients are mocked at the module boundary; everything that touches
// `social_posts` — status transitions, supersede, locking — runs for real.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { bootTestDb, type TestDb } from "../setup";
import { socialPosts, users } from "~/lib/db/schema";
import { ok, err, transportError } from "~/lib/social/errors";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000019";
const TEST_SLUG = "test-social-drafts";

// ── Module mocks (hoisted above the imports of ~/actions/socialDrafts) ───────

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
      slug: "test-social-drafts",
      title: "T",
      summary: "S",
      body: "B",
      tags: [],
      pubDate: new Date("2026-01-01T00:00:00Z"),
      cover: null,
      lang: "ru",
      sourceUrl: "https://artka.dev/blog/test-social-drafts",
      hasEnTwin: true,
    }),
  };
});

vi.mock("~/lib/social/clients/x", () => ({
  postTweet: vi.fn(),
  postThread: vi.fn(),
}));
vi.mock("~/lib/social/clients/linkedin", () => ({
  postShare: vi.fn(),
}));
vi.mock("~/lib/social/clients/telegram", () => ({
  sendMessage: vi.fn(),
}));

// ── Test state ───────────────────────────────────────────────────────────────

let env: TestDb;

beforeAll(async () => {
  env = await bootTestDb();
  // Point the app-level db singleton at the test container before its lazy
  // proxy makes the first call.
  process.env.DATABASE_URL = env.container.getConnectionUri();
}, 180_000);

afterAll(async () => {
  await env.teardown();
});

beforeEach(async () => {
  process.env.SOCIAL_DRAFTS_ENABLED = "true";
  await env.db.delete(socialPosts).where(eq(socialPosts.postSlug, TEST_SLUG));
  // FK target for createdById.
  await env.db
    .insert(users)
    .values({ id: TEST_USER_ID, email: "social-drafts@example.com", role: "admin" })
    .onConflictDoNothing();
  vi.clearAllMocks();
});

afterEach(() => {
  delete process.env.SOCIAL_DRAFTS_ENABLED;
});

// Minimal ActionAPIContext-like object: what assertAdmin and the handlers read.
const mockCtx = (role: "admin" | "editor" = "admin") =>
  ({
    locals: { user: { id: TEST_USER_ID, role } },
    request: new Request("http://test/"),
    cookies: { get: () => undefined, set: () => {} },
    url: new URL("http://test/"),
  }) as never;

const insertPending = async (channel: "x_en" | "li_en" | "tg_ru" = "x_en", body = "old body") => {
  const [row] = await env.db
    .insert(socialPosts)
    .values({
      postCollection: "posts",
      postSlug: TEST_SLUG,
      channel,
      sourceHash: "h",
      status: "pending",
      body,
      createdById: TEST_USER_ID,
    })
    .returning();
  return row!;
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("socialDrafts.generate", () => {
  it("inserts 3 generating rows transactionally then pipeline writes pending", async () => {
    const { generateHandler } = await import("~/actions/socialDrafts");
    const r = await generateHandler(
      { slug: TEST_SLUG, collection: "posts", channels: undefined },
      mockCtx(),
    );
    expect(r.ok).toBe(true);
    // The pipeline runs as a detached promise; a fixed sleep raced it under
    // full-suite load (flaked locally in pre-push). Poll for the eventual
    // state instead, bounded so a stuck pipeline still fails loudly.
    const readRows = () =>
      env.db.select().from(socialPosts).where(eq(socialPosts.postSlug, TEST_SLUG));
    const deadline = Date.now() + 5_000;
    let rows = await readRows();
    while (
      Date.now() < deadline &&
      !(rows.length === 3 && rows.every((row) => row.status === "pending"))
    ) {
      await new Promise((res) => setTimeout(res, 50));
      rows = await readRows();
    }
    expect(rows.length).toBe(3);
    // After pipeline resolves they should be "pending" (mock ok:true).
    expect(rows.every((row) => row.status === "pending")).toBe(true);
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
    } as never;
    await expect(
      generateHandler({ slug: TEST_SLUG, collection: "posts", channels: undefined }, badCtx),
    ).rejects.toThrow("Admins only");
  });
});

describe("socialDrafts.publish", () => {
  it("transitions pending → sent on success", async () => {
    const { postTweet } = await import("~/lib/social/clients/x");
    (postTweet as ReturnType<typeof vi.fn>).mockResolvedValue(
      ok({ id: "abc", url: "https://x.com/u/status/abc" }),
    );

    const row = await insertPending("x_en");
    const { publishHandler } = await import("~/actions/socialDrafts");
    const r = await publishHandler({ id: row.id, force: false }, mockCtx());

    expect(r.ok).toBe(true);
    const [after] = await env.db.select().from(socialPosts).where(eq(socialPosts.id, row.id));
    expect(after?.status).toBe("sent");
    expect(after?.externalUrl).toContain("x.com");
    expect(after?.externalId).toBe("abc");
  });

  it("rejects publish when status is not pending (e.g. already sent)", async () => {
    const row = await insertPending("x_en");
    await env.db.update(socialPosts).set({ status: "sent" }).where(eq(socialPosts.id, row.id));
    const { publishHandler } = await import("~/actions/socialDrafts");
    await expect(publishHandler({ id: row.id, force: false }, mockCtx())).rejects.toThrow(
      /CONFLICT|not pending/i,
    );
  });

  it("rejects when block annotations present and force=false", async () => {
    const row = await insertPending("x_en");
    await env.db
      .update(socialPosts)
      .set({ criticAnnotations: [{ severity: "block", kind: "fact", message: "wrong" }] })
      .where(eq(socialPosts.id, row.id));
    const { publishHandler } = await import("~/actions/socialDrafts");
    await expect(publishHandler({ id: row.id, force: false }, mockCtx())).rejects.toThrow(
      /block|BAD_REQUEST/i,
    );

    // verify rolled back to pending
    const [after] = await env.db.select().from(socialPosts).where(eq(socialPosts.id, row.id));
    expect(after?.status).toBe("pending");
  });

  it("force=true bypasses block annotations", async () => {
    const { postTweet } = await import("~/lib/social/clients/x");
    (postTweet as ReturnType<typeof vi.fn>).mockResolvedValue(
      ok({ id: "f1", url: "https://x.com/u/status/f1" }),
    );

    const row = await insertPending("x_en");
    await env.db
      .update(socialPosts)
      .set({ criticAnnotations: [{ severity: "block", kind: "fact", message: "wrong" }] })
      .where(eq(socialPosts.id, row.id));
    const { publishHandler } = await import("~/actions/socialDrafts");
    const r = await publishHandler({ id: row.id, force: true }, mockCtx());
    expect(r.ok).toBe(true);
  });

  it("transitions to failed on non-retryable transport error", async () => {
    const { postTweet } = await import("~/lib/social/clients/x");
    (postTweet as ReturnType<typeof vi.fn>).mockResolvedValue(
      err(transportError("x_en", 422, "bad input")),
    );

    const row = await insertPending("x_en");
    const { publishHandler } = await import("~/actions/socialDrafts");
    const r = await publishHandler({ id: row.id, force: false }, mockCtx());
    expect(r.ok).toBe(false);
    const [after] = await env.db.select().from(socialPosts).where(eq(socialPosts.id, row.id));
    expect(after?.status).toBe("failed");
    expect(after?.errorMessage).toContain("422");
  });

  it("rejects with FORBIDDEN when feature flag is off", async () => {
    process.env.SOCIAL_DRAFTS_ENABLED = "false";
    const row = await insertPending("x_en");
    const { publishHandler, saveHandler, skipHandler, recheckHandler } =
      await import("~/actions/socialDrafts");
    await expect(publishHandler({ id: row.id, force: false }, mockCtx())).rejects.toThrow(
      /FORBIDDEN|disabled/i,
    );
    await expect(saveHandler({ id: row.id, body: "x" }, mockCtx())).rejects.toThrow(
      /FORBIDDEN|disabled/i,
    );
    await expect(skipHandler({ id: row.id }, mockCtx())).rejects.toThrow(/FORBIDDEN|disabled/i);
    await expect(recheckHandler({ id: row.id }, mockCtx())).rejects.toThrow(/FORBIDDEN|disabled/i);
  });
});

describe("socialDrafts.save", () => {
  it("updates body of a pending row", async () => {
    const row = await insertPending();
    const { saveHandler } = await import("~/actions/socialDrafts");
    const r = await saveHandler({ id: row.id, body: "new body", threadTail: undefined }, mockCtx());
    expect(r.ok).toBe(true);
    const [after] = await env.db.select().from(socialPosts).where(eq(socialPosts.id, row.id));
    expect(after?.body).toBe("new body");
  });

  it("does NOT touch a sent row", async () => {
    const row = await insertPending();
    await env.db.update(socialPosts).set({ status: "sent" }).where(eq(socialPosts.id, row.id));
    const { saveHandler } = await import("~/actions/socialDrafts");
    await saveHandler({ id: row.id, body: "should not change" }, mockCtx());
    const [after] = await env.db.select().from(socialPosts).where(eq(socialPosts.id, row.id));
    expect(after?.body).toBe("old body");
  });
});

describe("socialDrafts.skip", () => {
  it("marks pending row skipped and stores reason", async () => {
    const row = await insertPending();
    const { skipHandler } = await import("~/actions/socialDrafts");
    await skipHandler({ id: row.id, reason: "irrelevant" }, mockCtx());
    const [after] = await env.db.select().from(socialPosts).where(eq(socialPosts.id, row.id));
    expect(after?.status).toBe("skipped");
    expect(after?.errorMessage).toBe("irrelevant");
  });
});

describe("socialDrafts.recheck", () => {
  it("re-runs critic and updates annotations", async () => {
    const row = await insertPending();
    const { recheckHandler } = await import("~/actions/socialDrafts");
    const r = await recheckHandler({ id: row.id }, mockCtx());
    expect(r.ok).toBe(true);
    const [after] = await env.db.select().from(socialPosts).where(eq(socialPosts.id, row.id));
    const notes = after?.criticAnnotations as Array<{ kind: string }> | null;
    expect(notes?.length).toBe(1); // mocked critic returned 1 warn for x_en
  });
});

describe("socialDrafts.regenerate", () => {
  it("supersedes existing rows and triggers fresh generate", async () => {
    await insertPending("x_en");
    await insertPending("li_en");
    const { regenerateHandler } = await import("~/actions/socialDrafts");
    const r = await regenerateHandler({ slug: TEST_SLUG, collection: "posts" }, mockCtx());
    expect(r.ok).toBe(true);
    const allRows = await env.db
      .select()
      .from(socialPosts)
      .where(eq(socialPosts.postSlug, TEST_SLUG));
    const superseded = allRows.filter((r) => r.status === "superseded");
    expect(superseded.length).toBeGreaterThanOrEqual(2); // old x_en + li_en
  });
});
