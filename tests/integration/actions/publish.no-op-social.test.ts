/**
 * Integration test: publish.one no-op path still triggers social kickoff.
 *
 * When local files already match the remote branch (dirty.length === 0),
 * publish.one must return status="no-op" AND still call generateSocialDrafts
 * so that drafts are created even without a new git commit.
 *
 * All I/O (FS, GitHub API, social pipeline, DB) is mocked — no test container
 * needed. This keeps the suite fast and focused on the control-flow logic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Module mocks — hoisted before any dynamic import ────────────────────────

vi.mock("~/lib/git/github-publisher", () => ({
  publishToGitHub: vi.fn(),
  // Return identical content to local → triggers no-op branch.
  getRemoteFileContent: vi.fn().mockResolvedValue("LOCAL_CONTENT"),
}));

vi.mock("~/lib/translate/site-config", () => ({
  resolveCollectionPaths: vi.fn().mockReturnValue({
    ruPath: "/fake/src/content/posts/test-noop.md",
    enPath: "/fake/src/content/posts/en/test-noop.md",
  }),
}));

// Mock fs so we don't need real files on disk.
vi.mock("node:fs/promises", async () => {
  const real = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  return {
    ...real,
    readFile: vi.fn().mockResolvedValue("LOCAL_CONTENT"),
  };
});

vi.mock("node:fs", async () => {
  const real = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...real,
    existsSync: vi.fn(
      (p: string) =>
        // RU exists; EN does not — keeps candidates array to one file.
        p.endsWith("test-noop.md") && !p.includes("/en/"),
    ),
  };
});

// Mock generateHandler so we don't hit the DB or social pipeline.
const mockGenerateSocialDrafts = vi.fn().mockResolvedValue({ ok: true, channels: ["x_en"] });
vi.mock("~/actions/socialDrafts.js", () => ({
  generateHandler: mockGenerateSocialDrafts,
}));

// ── Constants ────────────────────────────────────────────────────────────────

const TEST_USER_ID = "00000000-0000-0000-0000-000000000099";
const TEST_SLUG = "test-noop";

const mockCtx = () =>
  ({
    locals: { user: { id: TEST_USER_ID, role: "admin" } },
    request: new Request("http://test/"),
    cookies: { get: () => undefined, set: () => {} },
    url: new URL("http://test/"),
  }) as never;

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  process.env.SOCIAL_DRAFTS_ENABLED = "true";
  process.env.GITHUB_PAT = "fake-token";
  process.env.GITHUB_REPO_OWNER = "fake-owner";
  process.env.GITHUB_REPO_NAME = "fake-repo";
  mockGenerateSocialDrafts.mockResolvedValue({ ok: true, channels: ["x_en"] });
});

afterEach(() => {
  delete process.env.SOCIAL_DRAFTS_ENABLED;
  delete process.env.GITHUB_PAT;
  delete process.env.GITHUB_REPO_OWNER;
  delete process.env.GITHUB_REPO_NAME;
  vi.clearAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("publish.one — no-op path", () => {
  it("returns status=no-op when local content matches remote", async () => {
    const { publishOneHandler } = await import("~/actions/publish");
    const result = await publishOneHandler(
      { slug: TEST_SLUG, collection: "posts", message: undefined },
      mockCtx(),
    );
    expect(result.ok).toBe(true);
    expect(result.status).toBe("no-op");
  });

  it("calls generateSocialDrafts on no-op when social is enabled and collection=posts", async () => {
    const { publishOneHandler } = await import("~/actions/publish");
    await publishOneHandler(
      { slug: TEST_SLUG, collection: "posts", message: undefined },
      mockCtx(),
    );
    expect(mockGenerateSocialDrafts).toHaveBeenCalledOnce();
    expect(mockGenerateSocialDrafts).toHaveBeenCalledWith(
      { slug: TEST_SLUG, collection: "posts" },
      expect.anything(),
    );
  });

  it("does NOT call generateSocialDrafts on no-op when SOCIAL_DRAFTS_ENABLED=false", async () => {
    process.env.SOCIAL_DRAFTS_ENABLED = "false";
    const { publishOneHandler } = await import("~/actions/publish");
    const result = await publishOneHandler(
      { slug: TEST_SLUG, collection: "posts", message: undefined },
      mockCtx(),
    );
    expect(result.status).toBe("no-op");
    expect(mockGenerateSocialDrafts).not.toHaveBeenCalled();
  });

  it("does NOT call generateSocialDrafts on no-op when collection is not posts", async () => {
    const { publishOneHandler } = await import("~/actions/publish");
    const result = await publishOneHandler(
      { slug: TEST_SLUG, collection: "site", message: undefined },
      mockCtx(),
    );
    expect(result.status).toBe("no-op");
    expect(mockGenerateSocialDrafts).not.toHaveBeenCalled();
  });
});
