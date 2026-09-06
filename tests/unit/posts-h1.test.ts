import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { visit } from "unist-util-visit";
import type { Root } from "mdast";

const POST_DIRS = ["src/content/posts", "src/content/posts/en"];

interface PostFile {
  readonly path: string;
  readonly body: string;
}

const stripFrontmatter = (raw: string): string => raw.replace(/^---\n[\s\S]*?\n---\s*\n?/, "");

const collectPosts = async (): Promise<ReadonlyArray<PostFile>> => {
  const out: PostFile[] = [];
  for (const dir of POST_DIRS) {
    let entries: string[] = [];
    try {
      entries = await readdir(dir);
    } catch {
      continue; // dir may not exist in some test contexts
    }
    for (const f of entries) {
      if (!f.endsWith(".md") && !f.endsWith(".mdx")) continue;
      if (f.startsWith("e2e-")) continue; // Playwright fixtures/scratch posts (CLAUDE.md: e2e-* prefix)
      const path = join(dir, f);
      const raw = await readFile(path, "utf8");
      out.push({ path, body: stripFrontmatter(raw) });
    }
  }
  return out;
};

describe("post bodies must not contain a top-level h1", () => {
  it("scans every *.md/*.mdx under src/content/posts and reports offenders", async () => {
    const posts = await collectPosts();
    expect(posts.length).toBeGreaterThan(0); // sanity — guard against dir typo

    const offenders: string[] = [];
    for (const post of posts) {
      const tree = unified().use(remarkParse).parse(post.body) as Root;
      visit(tree, "heading", (node) => {
        if (node.depth === 1) {
          offenders.push(post.path);
        }
      });
    }

    if (offenders.length > 0) {
      const msg = [
        "These post bodies contain a top-level h1 (`# Heading`). The post layout",
        "already renders frontmatter.title as <h1>; remove or downgrade these to ##.",
        "",
        ...new Set(offenders).values(),
      ].join("\n");
      throw new Error(msg);
    }
  });
});
