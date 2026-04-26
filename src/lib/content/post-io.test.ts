import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPostFromDisk, listPostFiles } from "./post-io";

describe("post-io", () => {
  it("reads frontmatter + body from a file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "post-io-"));
    try {
      await writeFile(
        join(dir, "foo.md"),
        ["---", "title: Foo", "description: bar", "pubDate: 2026-01-01", "---", "", "body"].join(
          "\n",
        ),
      );
      const result = await readPostFromDisk(dir, "foo");
      expect(result?.frontmatter.title).toBe("Foo");
      expect(result?.body).toBe("body");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns null for missing file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "post-io-"));
    try {
      expect(await readPostFromDisk(dir, "missing")).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("lists only .md and .mdx files (ignores others)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "post-io-"));
    try {
      await writeFile(
        join(dir, "a.md"),
        "---\ntitle: a\ndescription: a\npubDate: 2026-01-01\n---\n",
      );
      await writeFile(
        join(dir, "b.mdx"),
        "---\ntitle: b\ndescription: b\npubDate: 2026-01-01\n---\n",
      );
      await writeFile(join(dir, "readme.txt"), "x");
      const slugs = await listPostFiles(dir);
      expect([...slugs].sort()).toEqual(["a", "b"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
