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
