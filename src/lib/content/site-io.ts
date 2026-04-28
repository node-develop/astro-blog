import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { load as loadYaml } from "js-yaml";

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
