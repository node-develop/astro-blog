import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { bootTestDb, type TestDb } from "../setup";
import { socialPosts, users } from "~/lib/db/schema";
import { ok, err, transportError } from "~/lib/social/errors";

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

const TEST_USER_ID = "00000000-0000-0000-0000-000000000002";
const TEST_SLUG = "test-pub-25";

let env: TestDb;

beforeAll(async () => {
  env = await bootTestDb();
  process.env.DATABASE_URL = env.container.getConnectionUri();
}, 180_000);

afterAll(async () => {
  await env.teardown();
});

beforeEach(async () => {
  process.env.SOCIAL_DRAFTS_ENABLED = "true";
  await env.db.delete(socialPosts).where(eq(socialPosts.postSlug, TEST_SLUG));
  await env.db
    .insert(users)
    .values({
      id: TEST_USER_ID,
      email: "test-25@example.com",
      role: "admin",
    })
    .onConflictDoNothing();
  vi.clearAllMocks();
});

const mockCtx = (role: "admin" | "editor" = "admin") =>
  ({
    locals: { user: { id: TEST_USER_ID, role } },
    request: new Request("http://test/"),
    cookies: { get: () => undefined, set: () => {} },
    url: new URL("http://test/"),
  }) as never;

const insertPending = async (channel: "x_en" | "li_en" | "tg_ru", body = "hello") => {
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
