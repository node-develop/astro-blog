import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { load as parseYaml } from "../src/lib/yaml";
import type { ZodError } from "zod";
import { contentHash } from "../src/lib/translate/hash";
import {
  detectDrift,
  detectMissingTwins,
  isFixtureSlug,
  shouldFail,
  type FileState,
  type TwinState,
} from "../src/lib/translate/sync-check";
import { PATHS } from "../src/lib/translate/site-config";
import { postSchema, siteSchema, projectSchema } from "../src/lib/content/schemas";

interface FrontmatterPeek {
  readonly draft?: boolean;
  readonly apiRevision?: string;
  readonly sourceHash?: string;
  readonly manuallyEdited?: boolean;
}

const peekFrontmatter = (src: string): FrontmatterPeek => {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const data = parseYaml(m[1] ?? "") as FrontmatterPeek | null;
  return data ?? {};
};

const parseFullFrontmatter = (src: string): Record<string, unknown> => {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const data = parseYaml(m[1] ?? "") as Record<string, unknown> | null;
  return data ?? {};
};

interface SchemaError {
  readonly collection: string;
  readonly slug: string;
  readonly issues: readonly { path: string; message: string }[];
}

const formatZodIssue = (issue: ZodError["issues"][number]): { path: string; message: string } => {
  const path = issue.path.join(".") || "<root>";
  // For length errors, surface "got N chars (max M)" / "got N chars (min M)" — most useful info.
  const msg =
    issue.code === "too_big" && "maximum" in issue
      ? `${path}: ${issue.message} (max ${issue.maximum})`
      : issue.code === "too_small" && "minimum" in issue
        ? `${path}: ${issue.message} (min ${issue.minimum})`
        : `${path}: ${issue.message}`;
  return { path, message: msg };
};

const validateEnDir = async (
  dir: string,
  collection: string,
  schema: typeof postSchema | typeof siteSchema | typeof projectSchema,
): Promise<readonly SchemaError[]> => {
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter((f) => /\.md$/.test(f) && !f.startsWith("."));
  const errors: SchemaError[] = [];
  for (const file of files) {
    const slug = file.replace(/\.md$/, "");
    if (isFixtureSlug(slug)) continue;
    const src = await readFile(join(dir, file), "utf8");
    const fm = parseFullFrontmatter(src);
    const result = schema.safeParse(fm);
    if (!result.success) {
      errors.push({
        collection,
        slug,
        issues: result.error.issues.map(formatZodIssue),
      });
    }
  }
  return errors;
};

const CONTENT_FILE = /\.(md|mdx)$/;

/** Slugs of the content files directly inside `dir` (no recursion, no dotfiles). */
const listSlugs = async (dir: string): Promise<readonly string[]> => {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && CONTENT_FILE.test(e.name) && !e.name.startsWith("."))
    .map((e) => e.name.replace(CONTENT_FILE, ""));
};

const union = (a: readonly string[], b: readonly string[]): readonly string[] =>
  [...new Set([...a, ...b])].sort();

/** site and projects: `<slug>.md` next to `en/<slug>.md`; every file is built. */
const collectFlatTwins = async (
  collection: "site" | "projects",
  ruDir: string,
  enDir: string,
): Promise<readonly TwinState[]> => {
  const ru = await listSlugs(ruDir);
  const en = await listSlugs(enDir);
  return union(ru, en).map((slug) => ({
    collection,
    slug,
    ru: ru.includes(slug) ? "built" : "absent",
    en: en.includes(slug) ? "built" : "absent",
  }));
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
    const ruHash = contentHash("posts", ruSrc);
    const ruFm = peekFrontmatter(ruSrc);
    const ruDraft = ruFm.draft === true;
    const apiManaged = typeof ruFm.apiRevision === "string";
    const enPath = join(PATHS.postsEnDir, file);
    if (!existsSync(enPath)) {
      states.push({
        slug,
        ruHash,
        enHash: null,
        enExists: false,
        enManual: false,
        ruDraft,
        apiManaged,
      });
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
      apiManaged,
    });
  }

  const report = detectDrift(states);

  // Pair presence for everything localised that is not a post.
  const twins = detectMissingTwins([
    ...(await collectFlatTwins("site", PATHS.siteDir, PATHS.siteEnDir)),
    ...(await collectFlatTwins("projects", PATHS.projectsDir, PATHS.projectsEnDir)),
  ]);
  const missingEn = [...report.missing, ...twins.missingEn];

  // Second pass: validate every EN file against its content schema.
  const schemaErrors = [
    ...(await validateEnDir(PATHS.postsEnDir, "posts", postSchema)),
    ...(await validateEnDir(PATHS.siteEnDir, "site", siteSchema)),
    ...(await validateEnDir(PATHS.projectsEnDir, "projects", projectSchema)),
  ];

  if (report.warnings.length) {
    console.warn(`⚠ Manually-edited EN files with stale RU source: ${report.warnings.join(", ")}`);
  }
  if (missingEn.length) console.error(`✗ Missing EN twins: ${missingEn.join(", ")}`);
  if (twins.missingRu.length) {
    console.error(`✗ EN twins without a RU source: ${twins.missingRu.join(", ")}`);
  }
  if (report.drift.length) {
    console.warn(
      `⚠ EN twins behind their RU source (run \`pnpm translate\`): ${report.drift.join(", ")}`,
    );
  }
  if (schemaErrors.length) {
    console.error("");
    for (const err of schemaErrors) {
      console.error(`✗ EN content schema violation in ${err.collection}/${err.slug}:`);
      for (const issue of err.issues) console.error(`   - ${issue.message}`);
    }
  }

  if (shouldFail({ report, twins, schemaErrorCount: schemaErrors.length })) {
    if (missingEn.length) {
      console.error("\nRun `pnpm translate` and commit the result.");
    }
    if (twins.missingRu.length) {
      console.error(
        "\nAn EN twin without a RU source means the Russian page was removed or renamed and the English one was left behind: restore the RU file or delete the EN one.",
      );
    }
    if (schemaErrors.length) {
      console.error(
        "\nFix EN frontmatter (length / required fields) or rerun translate with the latest pipeline.",
      );
    }
    process.exit(1);
  }
  console.warn(
    report.drift.length || report.warnings.length
      ? "✓ All EN twins present and schema-valid (stale twins listed above)"
      : "✓ All EN translations in sync and schema-valid",
  );
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
