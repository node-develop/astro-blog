import { access, rename, writeFile, mkdir, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveSafe } from "./paths";

const SLUG_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

/**
 * Atomically writes `content` into `<baseDir>/<slug>.md`. Writes to a
 * tmp file in the same directory first, then renames. Guards against
 * slug path traversal.
 *
 * If a stale `<slug>.mdx` exists alongside, it is removed after a
 * successful write — Astro Content Collections cannot tolerate two
 * files producing the same entry id, and the admin always serializes
 * to `.md`, so the `.mdx` would silently shadow user edits.
 *
 * Returns the absolute path of the written file.
 */
export async function writePostAtomically(
  baseDir: string,
  slug: string,
  content: string,
): Promise<string> {
  if (!SLUG_RE.test(slug)) {
    throw new Error(`invalid slug: ${JSON.stringify(slug)}`);
  }
  const target = resolveSafe(baseDir, `${slug}.md`);
  const mdxSibling = resolveSafe(baseDir, `${slug}.mdx`);
  await mkdir(dirname(target), { recursive: true });
  const tmp = target + ".tmp." + process.pid + "." + Math.random().toString(36).slice(2, 8);
  await writeFile(tmp, content, "utf8");
  await rename(tmp, target);
  try {
    await access(mdxSibling);
    await unlink(mdxSibling);
  } catch {
    // No mdx sibling — nothing to clean up.
  }
  return target;
}
