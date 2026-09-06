import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { dump as dumpYaml, load as loadYaml } from "~/lib/yaml";
import { writePostAtomically } from "~/lib/fs/post-writer";

export interface SiteFile {
  readonly slug: string;
  readonly title: string;
  readonly body: string;
  readonly mtime: Date;
}

export const readSiteFromDisk = async (baseDir: string, slug: string): Promise<SiteFile | null> => {
  const filePath = join(baseDir, `${slug}.md`);
  try {
    const [raw, stats] = await Promise.all([readFile(filePath, "utf8"), stat(filePath)]);
    const m = raw.match(/^---\r?\n([\s\S]*?)^---\r?\n([\s\S]*)$/m);
    if (!m) return null;
    const parsed = loadYaml(m[1] ?? "");
    const fm = (parsed !== null && typeof parsed === "object" ? parsed : {}) as { title?: string };
    return {
      slug,
      title: fm.title ?? slug,
      body: (m[2] ?? "").replace(/^\n/, ""),
      mtime: stats.mtime,
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
};

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Raw frontmatter of `<baseDir>/<slug>.md` as a plain object, `{}` when the
 * file does not exist or has no fence.
 */
const readSiteFrontmatter = async (
  baseDir: string,
  slug: string,
): Promise<Record<string, unknown>> => {
  let raw: string;
  try {
    raw = await readFile(join(baseDir, `${slug}.md`), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
  const m = FENCE.exec(raw);
  if (!m || !m[1]) return {};
  const parsed = loadYaml(m[1]);
  return parsed !== null && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
};

/**
 * Serialises `{ ...existingFrontmatter, title }` + body into a markdown file.
 * Pure — exported for unit tests.
 */
export const mergeSiteFile = (
  existing: Record<string, unknown>,
  patch: { readonly title: string },
  body: string,
): string => {
  const merged = { ...existing, title: patch.title };
  return `---\n${dumpYaml(merged, { lineWidth: 120 })}---\n\n${body}`;
};

/**
 * Read-merge-write for a site page (`about`, `now`, `uses`, …).
 *
 * The admin form only edits `title` + body; every other frontmatter field
 * (`description`, `sourceHash`, `manuallyEdited`, …) is read from the
 * existing file and carried through unchanged — writing `{ title }` as the
 * whole frontmatter would silently drop them and break `pnpm translate`
 * change tracking. Returns the absolute path written.
 */
export const writeSiteToDisk = async (
  baseDir: string,
  slug: string,
  patch: { readonly title: string; readonly body: string },
): Promise<string> => {
  const existing = await readSiteFrontmatter(baseDir, slug);
  const content = mergeSiteFile(existing, { title: patch.title }, patch.body);
  return writePostAtomically(baseDir, slug, content);
};

export const listSiteFiles = async (baseDir: string): Promise<readonly SiteFile[]> => {
  const entries = await readdir(baseDir, { withFileTypes: true });
  const mdFiles = entries.filter(
    (e) => e.isFile() && e.name.endsWith(".md") && e.name !== ".gitkeep",
  );
  const results = await Promise.all(
    mdFiles.map((e) => readSiteFromDisk(baseDir, e.name.replace(/\.md$/, ""))),
  );
  return results.filter((f): f is SiteFile => f !== null);
};
