import { rename, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveSafe } from "./paths";

const SLUG_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

/**
 * Atomically writes `content` into `<baseDir>/<slug>.md`. Writes to a
 * tmp file in the same directory first, then renames. Guards against
 * slug path traversal.
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
  await mkdir(dirname(target), { recursive: true });
  const tmp = target + ".tmp." + process.pid + "." + Math.random().toString(36).slice(2, 8);
  await writeFile(tmp, content, "utf8");
  await rename(tmp, target);
  return target;
}
