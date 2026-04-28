import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const ROOTS = [join(process.cwd(), "src/content/posts"), join(process.cwd(), "src/content/site")];

const FENCE = /^(\s*)```/;

const isInternalUrl = (url: string): boolean => {
  if (/^https?:\/\//i.test(url)) return false;
  // Any scheme other than a path-like string → external
  if (/^[a-z][a-z0-9+\-.]*:/i.test(url) && !url.startsWith("/")) return false;
  return true;
};

const rewriteLine = (line: string, rewrites: string[]): string =>
  line.replace(/\]\(([^)]+?)\.md(#[^)]*)?\)/g, (full, url: string, anchor: string | undefined) => {
    if (!isInternalUrl(url)) return full;
    const next = `](${url}${anchor ?? ""})`;
    rewrites.push(`${full} → ${next}`);
    return next;
  });

const processFile = async (filePath: string): Promise<{ changed: boolean; rewrites: string[] }> => {
  const source = await readFile(filePath, "utf8");
  const lines = source.split("\n");
  const rewrites: string[] = [];
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const next = rewriteLine(line, rewrites);
    if (next !== line) lines[i] = next;
  }

  if (rewrites.length === 0) return { changed: false, rewrites };
  await writeFile(filePath, lines.join("\n"), "utf8");
  return { changed: true, rewrites };
};

const walk = async (dir: string): Promise<string[]> => {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    // Directory may not exist (e.g. src/content/site/en)
    return [];
  }
  const files: string[] = [];
  for (const e of entries) {
    if (e.startsWith(".")) continue;
    const p = join(dir, e);
    const s = await stat(p);
    if (s.isDirectory()) files.push(...(await walk(p)));
    else if (e.endsWith(".md") || e.endsWith(".mdx")) files.push(p);
  }
  return files;
};

const main = async (): Promise<void> => {
  const allFiles: string[] = [];
  for (const root of ROOTS) {
    allFiles.push(...(await walk(root)));
  }
  let totalChanged = 0;
  let totalRewrites = 0;
  for (const f of allFiles) {
    const { changed, rewrites } = await processFile(f);
    if (changed) {
      totalChanged++;
      totalRewrites += rewrites.length;
      console.warn(`[fixed ${rewrites.length}] ${f.replace(process.cwd() + "/", "")}`);
      for (const r of rewrites) console.warn(`  ${r}`);
    }
  }
  console.warn(
    `\nDone: ${totalChanged}/${allFiles.length} files modified, ${totalRewrites} links rewritten`,
  );
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
