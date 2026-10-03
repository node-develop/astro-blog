import { beforeEach, describe, expect, it, vi } from "vitest";

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
const owned = { overwrite: true } as const;
const fresh = { overwrite: false } as const;

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
    expect(await commitArticle("src/content/posts/new.md", "new content", fresh)).toBe(
      "new-commit",
    );
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
    expect(await commitArticle("src/content/posts/new.md", "already saved", fresh)).toBe("parent");
    expect(mock.createCommit).not.toHaveBeenCalled();
  });
  it("overwrites a reformatted file of an article that was published before", async () => {
    // Prettier rewrote the committed file after the API published it: the bytes differ.
    mock.getContent.mockImplementation(async ({ path }: { path: string }) => {
      if (path.endsWith(".mdx")) throw { status: 404 };
      return { data: { content: Buffer.from('title: "reformatted"').toString("base64") } };
    });
    expect(await commitArticle("src/content/posts/new.md", "agent", owned)).toBe("new-commit");
    expect(mock.createBlob).toHaveBeenCalledWith(expect.objectContaining({ content: "agent" }));
    expect(mock.updateRef).toHaveBeenCalledWith(expect.objectContaining({ force: false }));
  });
  it("overwrites a file that carries one of the article's own publication ids", async () => {
    const id = "3f2b8c1e-6d4a-4e7b-9a10-1c2d3e4f5a6b";
    mock.getContent.mockImplementation(async ({ path }: { path: string }) => {
      if (path.endsWith(".mdx")) throw { status: 404 };
      const file = `---\ntitle: "lost response"\napiRevision: ${id}\n---\nold`;
      return { data: { content: Buffer.from(file).toString("base64") } };
    });
    expect(
      await commitArticle("src/content/posts/new.md", "agent", {
        overwrite: false,
        ownedRevisions: [id],
      }),
    ).toBe("new-commit");
    // The same marker owned by another article is not ours.
    await expect(
      commitArticle("src/content/posts/new.md", "agent", {
        overwrite: false,
        ownedRevisions: ["00000000-0000-4000-8000-000000000000"],
      }),
    ).rejects.toMatchObject({ code: "slug_conflict" });
  });
  it("refuses the first commit over a file the article never owned", async () => {
    mock.getContent.mockImplementation(async ({ path }: { path: string }) => {
      if (path.endsWith(".mdx")) throw { status: 404 };
      return { data: { content: Buffer.from("legacy post").toString("base64") } };
    });
    await expect(commitArticle("src/content/posts/new.md", "agent", fresh)).rejects.toMatchObject({
      code: "slug_conflict",
    });
    expect(mock.createBlob).not.toHaveBeenCalled();
    expect(mock.updateRef).not.toHaveBeenCalled();
  });
  it("rebuilds the commit on the new parent after the branch advances", async () => {
    let moved = false;
    mock.getRef.mockImplementation(async () => ({
      data: { object: { sha: moved ? "parent-2" : "parent" } },
    }));
    mock.updateRef.mockImplementationOnce(async () => {
      moved = true;
      throw { status: 422 };
    });
    expect(await commitArticle("src/content/posts/new.md", "agent", owned)).toBe("new-commit");
    expect(mock.getContent).toHaveBeenLastCalledWith(expect.objectContaining({ ref: "parent-2" }));
    expect(mock.createCommit).toHaveBeenCalledTimes(2);
    expect(mock.createCommit).toHaveBeenLastCalledWith(
      expect.objectContaining({ parents: ["parent-2"] }),
    );
    expect(mock.updateRef).toHaveBeenCalledTimes(2);
  });
  it("gives up after three lost races and never forces the ref", async () => {
    mock.updateRef.mockRejectedValue({ status: 422 });
    await expect(commitArticle("src/content/posts/new.md", "agent", owned)).rejects.toMatchObject({
      status: 422,
    });
    expect(mock.updateRef).toHaveBeenCalledTimes(3);
    for (const [args] of mock.updateRef.mock.calls) expect(args).toMatchObject({ force: false });
  });
  it("rejects an existing MDX file at the same public slug", async () => {
    mock.getContent.mockImplementation(async ({ path }: { path: string }) => {
      if (path.endsWith(".md")) throw { status: 404 };
      return { data: { content: Buffer.from("existing MDX").toString("base64") } };
    });
    await expect(commitArticle("src/content/posts/new.md", "agent", owned)).rejects.toMatchObject({
      code: "slug_conflict",
    });
    expect(mock.updateRef).not.toHaveBeenCalled();
  });
});
