import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseFrontmatter, type Frontmatter } from "./frontmatter";

export interface PostFile {
  readonly slug: string;
  readonly frontmatter: Frontmatter;
  readonly body: string;
}

export async function readPostFromDisk(baseDir: string, slug: string): Promise<PostFile | null> {
  for (const ext of [".md", ".mdx"]) {
    try {
      const raw = await readFile(join(baseDir, `${slug}${ext}`), "utf8");
      const { frontmatter, body } = parseFrontmatter(raw);
      return { slug, frontmatter, body };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }
  }
  return null;
}

export async function listPostFiles(baseDir: string): Promise<readonly string[]> {
  const entries = await readdir(baseDir);
  return entries
    .filter((f) => f.endsWith(".md") || f.endsWith(".mdx"))
    .map((f) => f.replace(/\.(md|mdx)$/, ""));
}

/**
 * Reads every top-level post in `baseDir` (RU only — `en/` twins live in a
 * subdirectory and are not listed) straight from disk.
 *
 * The admin list must use this instead of `getCollection("posts")`: the
 * content layer is a build-time snapshot and does not see posts created,
 * edited or deleted by the admin in the SSR runtime.
 */
export async function listPostsFromDisk(baseDir: string): Promise<readonly PostFile[]> {
  const slugs = await listPostFiles(baseDir);
  const files = await Promise.all(slugs.map((slug) => readPostFromDisk(baseDir, slug)));
  return files.filter((f): f is PostFile => f !== null);
}
