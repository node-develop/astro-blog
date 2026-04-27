import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { load as parseYaml } from "js-yaml";
import { sha256 } from "./lib/hash";
import { detectDrift, isFixtureSlug, type FileState } from "./lib/sync-check";
import { PATHS } from "./lib/site-config";

interface FrontmatterPeek {
  readonly draft?: boolean;
  readonly sourceHash?: string;
  readonly manuallyEdited?: boolean;
}

const peekFrontmatter = (src: string): FrontmatterPeek => {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const data = parseYaml(m[1] ?? "") as FrontmatterPeek | null;
  return data ?? {};
};

const main = async (): Promise<void> => {
  const ruFiles = (await readdir(PATHS.postsDir)).filter(
    (f) => /\.(md|mdx)$/.test(f) && !f.startsWith("."),
  );
  const states: FileState[] = [];

  for (const file of ruFiles) {
    const slug = file.replace(/\.(md|mdx)$/, "");
    if (isFixtureSlug(slug)) continue;
    const ruSrc = await readFile(join(PATHS.postsDir, file), "utf8");
    const ruHash = sha256(ruSrc);
    const ruFm = peekFrontmatter(ruSrc);
    const ruDraft = ruFm.draft === true;
    const enPath = join(PATHS.postsEnDir, file);
    if (!existsSync(enPath)) {
      states.push({ slug, ruHash, enHash: null, enExists: false, enManual: false, ruDraft });
      continue;
    }
    const enSrc = await readFile(enPath, "utf8");
    const enFm = peekFrontmatter(enSrc);
    states.push({
      slug,
      ruHash,
      enHash: typeof enFm.sourceHash === "string" ? enFm.sourceHash : null,
      enExists: true,
      enManual: enFm.manuallyEdited === true,
      ruDraft,
    });
  }

  const report = detectDrift(states);

  if (report.warnings.length) {
    console.warn(`⚠ Manually-edited EN files with stale RU source: ${report.warnings.join(", ")}`);
  }
  if (report.missing.length) console.error(`✗ Missing EN twins: ${report.missing.join(", ")}`);
  if (report.drift.length) console.error(`✗ EN twins out of date: ${report.drift.join(", ")}`);

  if (report.missing.length || report.drift.length) {
    console.error("\nRun `pnpm translate` and commit the result.");
    process.exit(1);
  }
  console.warn("✓ All EN translations in sync");
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
