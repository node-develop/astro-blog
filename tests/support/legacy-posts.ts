import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Legacy file posts for the tests that still cover the file fallbacks (TODO(cutover), removed in
 * prompt 3.6). The tests own their files in a temporary POSTS_DIR instead of reading the repo's
 * `src/content/posts`, so they pass with that directory empty.
 *
 * Call it from `vi.hoisted` (through a dynamic import) so the files exist before the first API
 * call: editorial-gates caches the parsed files per directory.
 */
export type LegacyPost = Readonly<{
  title: string;
  /** Body after the frontmatter; defaults to one H2. */
  body?: string;
  draft?: boolean;
  cover?: string;
}>;

/** `files` is keyed by the path inside the posts directory, e.g. `a.md` or `en/a.md`. */
export const writeLegacyPosts = (files: Readonly<Record<string, LegacyPost>>): string => {
  // <tmp>/posts, so that <tmp>/outside.md is where a slug that leaves the directory would land.
  const dir = join(mkdtempSync(join(tmpdir(), "legacy-posts-")), "posts");
  mkdirSync(join(dir, "en"), { recursive: true });
  for (const [name, post] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(
      join(dir, name),
      [
        "---",
        `title: ${JSON.stringify(post.title)}`,
        `description: ${JSON.stringify(`Description of ${post.title}`)}`,
        "pubDate: 2026-01-01",
        "tags: []",
        `draft: ${post.draft === true}`,
        ...(post.cover === undefined ? [] : [`cover: ${post.cover}`]),
        "---",
        "",
        post.body ?? `## ${post.title} heading\n\nLegacy body.`,
        "",
      ].join("\n"),
    );
  }
  return dir;
};
