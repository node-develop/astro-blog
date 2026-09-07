import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const mock = vi.hoisted(() => ({
  getRef: vi.fn(),
  getCommit: vi.fn(),
  getContent: vi.fn(),
  createBlob: vi.fn(),
  createTree: vi.fn(),
  createCommit: vi.fn(),
  updateRef: vi.fn(),
}));
vi.mock("@octokit/rest", () => ({
  Octokit: function () {
    return {
      git: mock,
      repos: { getContent: mock.getContent },
    };
  },
}));
import { commitArticle } from "../../../src/lib/content-api/github";
const digest = (s: string) => createHash("sha256").update(s).digest("hex");

describe("atomic GitHub publication adapter", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("GITHUB_PAT", "fake-token");
    vi.stubEnv("GITHUB_REPO_OWNER", "test-owner");
    vi.stubEnv("GITHUB_REPO_NAME", "test-repo");
    mock.getRef.mockResolvedValue({ data: { object: { sha: "parent" } } });
    mock.getCommit.mockResolvedValue({ data: { tree: { sha: "tree" } } });
    mock.getContent.mockRejectedValue({ status: 404 });
    mock.createBlob.mockResolvedValue({ data: { sha: "blob" } });
    mock.createTree.mockResolvedValue({ data: { sha: "new-tree" } });
    mock.createCommit.mockResolvedValue({ data: { sha: "new-commit" } });
    mock.updateRef.mockResolvedValue({});
  });
  it("checks content at the immutable parent and never force-pushes", async () => {
    expect(await commitArticle("src/content/posts/new.md", "new content", null)).toBe("new-commit");
    expect(mock.getContent).toHaveBeenCalledWith(expect.objectContaining({ ref: "parent" }));
    expect(mock.createTree).toHaveBeenCalledWith(
      expect.objectContaining({
        base_tree: "tree",
        tree: [{ path: "src/content/posts/new.md", mode: "100644", type: "blob", sha: "blob" }],
      }),
    );
    expect(mock.updateRef).toHaveBeenCalledWith(expect.objectContaining({ force: false }));
  });
  it("recovers a previously accepted commit without producing another", async () => {
    mock.getContent.mockImplementation(async ({ path }: { path: string }) => {
      if (path.endsWith(".mdx")) throw { status: 404 };
      return { data: { content: Buffer.from("already saved").toString("base64") } };
    });
    expect(await commitArticle("src/content/posts/new.md", "already saved", null)).toBe("parent");
    expect(mock.createCommit).not.toHaveBeenCalled();
  });
  it("protects content edited by another publisher", async () => {
    mock.getContent.mockImplementation(async ({ path }: { path: string }) => {
      if (path.endsWith(".mdx")) throw { status: 404 };
      return { data: { content: Buffer.from("manual").toString("base64") } };
    });
    await expect(
      commitArticle("src/content/posts/new.md", "agent", digest("old")),
    ).rejects.toMatchObject({ code: "remote_edit_conflict" });
    expect(mock.createBlob).not.toHaveBeenCalled();
  });
  it("rechecks after the branch advances instead of overwriting a concurrent edit", async () => {
    let moved = false;
    mock.updateRef.mockImplementationOnce(async () => {
      moved = true;
      throw { status: 422 };
    });
    mock.getContent.mockImplementation(async ({ path }: { path: string }) => {
      if (path.endsWith(".mdx") || !moved) throw { status: 404 };
      return { data: { content: Buffer.from("concurrent edit").toString("base64") } };
    });
    await expect(commitArticle("src/content/posts/new.md", "agent", null)).rejects.toMatchObject({
      code: "remote_edit_conflict",
    });
    expect(mock.updateRef).toHaveBeenCalledTimes(1);
    expect(mock.getRef).toHaveBeenCalledTimes(2);
  });
  it("rejects an existing MDX file at the same public slug", async () => {
    mock.getContent.mockImplementation(async ({ path }: { path: string }) => {
      if (path.endsWith(".md")) throw { status: 404 };
      return { data: { content: Buffer.from("existing MDX").toString("base64") } };
    });
    await expect(commitArticle("src/content/posts/new.md", "agent", null)).rejects.toMatchObject({
      code: "slug_conflict",
    });
    expect(mock.updateRef).not.toHaveBeenCalled();
  });
});
