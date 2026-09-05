/**
 * Atomic writer for home.md / en/home.md.
 *
 * Reads the existing file, merges the incoming patch (merge-semantics: only
 * supplied fields are overwritten, the rest survive untouched), then writes
 * atomically via tmp + rename in the same directory.
 *
 * Invariants:
 *   - Never overwrites fields not present in `patch`.
 *   - Always serialises with KEY_ORDER for stable diffs.
 *   - Callers are responsible for path resolution (SITE_DIR or SITE_EN_DIR).
 */
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import * as yaml from "~/lib/yaml";
import { KEY_ORDER, homeFrontmatterSchema, type HomeFrontmatter } from "./home-schema";

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

const readExistingFrontmatter = async (filePath: string): Promise<Record<string, unknown>> => {
  if (!existsSync(filePath)) return {};
  const raw = await readFile(filePath, "utf8");
  const m = FENCE.exec(raw);
  if (!m || !m[1]) return {};
  const parsed = yaml.load(m[1]);
  return parsed !== null && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
};

/**
 * Reads and validates the current on-disk frontmatter of home.md / en/home.md.
 *
 * The admin editor must use this instead of `getEntry("site", …)`: the
 * content layer is a build-time snapshot and goes stale in the SSR runtime
 * as soon as the editor writes to disk.
 *
 * Returns null when the file does not exist. Throws (fail loud) when the
 * file exists but does not satisfy `homeFrontmatterSchema`.
 */
export const readHomeFromDisk = async (filePath: string): Promise<HomeFrontmatter | null> => {
  if (!existsSync(filePath)) return null;
  const raw = await readExistingFrontmatter(filePath);
  const parsed = homeFrontmatterSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`invalid home frontmatter in ${filePath}: ${parsed.error.message}`);
  }
  return parsed.data;
};

const buildOrderedObject = (data: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const key of KEY_ORDER) {
    if (key in data) out[key] = data[key];
  }
  // Carry through any unexpected keys not in KEY_ORDER (forward-compat).
  for (const [k, v] of Object.entries(data)) {
    if (!(k in out)) out[k] = v;
  }
  return out;
};

export type HomePatch = Partial<Omit<HomeFrontmatter, "title">> & Pick<HomeFrontmatter, "title">;

/**
 * Merge `patch` into the existing frontmatter at `filePath` and write
 * atomically. Creates parent directories if needed.
 *
 * Returns the absolute path of the written file.
 */
export const writeHomeToDisk = async (
  filePath: string,
  patch: Partial<HomeFrontmatter>,
): Promise<string> => {
  const existing = await readExistingFrontmatter(filePath);

  // Merge: existing fields survive, patch fields override.
  const merged: Record<string, unknown> = { ...existing };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) {
      // undefined means "caller passed optional field as empty string normalised
      // to undefined" — we preserve the existing value rather than deleting it.
      // If you truly want to clear a field, pass an empty string before normalisation.
    } else {
      merged[k] = v;
    }
  }

  const ordered = buildOrderedObject(merged);
  const rawYml = yaml.dump(ordered, { lineWidth: 120 });
  const content = `---\n${rawYml}---\n`;

  await mkdir(dirname(filePath), { recursive: true });
  const tmp =
    filePath + ".tmp." + process.pid.toString() + "." + Math.random().toString(36).slice(2, 8);
  await writeFile(tmp, content, "utf8");
  await rename(tmp, filePath);
  return filePath;
};
