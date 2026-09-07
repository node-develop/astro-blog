import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { load as parseYaml } from "../src/lib/yaml";
import type { ZodError } from "zod";
import { sha256 } from "../src/lib/translate/hash";
import { detectDrift, isFixtureSlug, type FileState } from "../src/lib/translate/sync-check";
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

  // Second pass: validate every EN file against its content schema.
  const schemaErrors = [
    ...(await validateEnDir(PATHS.postsEnDir, "posts", postSchema)),
    ...(await validateEnDir(PATHS.siteEnDir, "site", siteSchema)),
    ...(await validateEnDir(PATHS.projectsEnDir, "projects", projectSchema)),
  ];

  if (report.warnings.length) {
    console.warn(`⚠ Manually-edited EN files with stale RU source: ${report.warnings.join(", ")}`);
  }
  if (report.missing.length) console.error(`✗ Missing EN twins: ${report.missing.join(", ")}`);
  if (report.drift.length) console.error(`✗ EN twins out of date: ${report.drift.join(", ")}`);
  if (schemaErrors.length) {
    console.error("");
    for (const err of schemaErrors) {
      console.error(`✗ EN content schema violation in ${err.collection}/${err.slug}:`);
      for (const issue of err.issues) console.error(`   - ${issue.message}`);
    }
  }

  if (report.missing.length || report.drift.length || schemaErrors.length) {
    if (report.missing.length || report.drift.length) {
      console.error("\nRun `pnpm translate` and commit the result.");
    }
    if (schemaErrors.length) {
      console.error(
        "\nFix EN frontmatter (length / required fields) or rerun translate with the latest pipeline.",
      );
    }
    process.exit(1);
  }
  console.warn("✓ All EN translations in sync and schema-valid");
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
