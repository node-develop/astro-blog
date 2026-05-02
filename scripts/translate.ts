// scripts/translate.ts — RU → EN translator for posts and site content.
// Translates: title, description, coverAlt, summary, faq[].question/answer (prose).
// Passes through verbatim: keywords (slug-like), tags, cover, pubDate, updatedDate.
// Always sets lang: "en" on EN twins. Skips drafts. Per-key hash tracking for the
// i18n string catalog avoids re-translating unchanged values.
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { config as dotenv } from "dotenv";
import yaml from "js-yaml";
import { sha256 } from "./lib/hash";
import { extractProse, reassemble } from "./lib/extract-prose";
import { translateProse, translateStrings } from "./lib/claude-translate";
import { decideAction } from "./lib/decide-action";
import { PATHS } from "./lib/site-config";
import { isFixtureSlug } from "./lib/sync-check";
import { parseFrontmatter } from "../src/lib/content/frontmatter";
import type { Frontmatter } from "../src/lib/content/frontmatter";

dotenv();

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("ANTHROPIC_API_KEY is required (set in .env or environment)");
  process.exit(1);
}

const args = process.argv.slice(2);
const FORCE_FLAG_INDEX = args.indexOf("--force");
const FORCE_SLUG = FORCE_FLAG_INDEX >= 0 ? (args[FORCE_FLAG_INDEX + 1] ?? null) : null;
const FORCE_ALL = args.includes("--force-all");

interface FileResult {
  readonly slug: string;
  readonly status: "translated" | "skipped" | "warned" | "failed";
  readonly note?: string;
}

// Serialize a frontmatter object (including extra fields like sourceHash, manuallyEdited)
// to a complete markdown file string. Mirrors the date-quoting fix in the src helper.
const serializeWithExtras = (
  base: Frontmatter,
  extras: Record<string, unknown>,
  body: string,
): string => {
  // Astro content schema enforces max 200 chars on description; truncate at word boundary.
  const truncateDesc = (s: string): string => {
    if (s.length <= 200) return s;
    const cut = s.slice(0, 200).lastIndexOf(" ");
    return s.slice(0, cut > 100 ? cut : 200);
  };

  const obj: Record<string, unknown> = {
    title: base.title,
    description: truncateDesc(base.description),
    pubDate: base.pubDate.toISOString().slice(0, 10),
    ...(base.updatedDate ? { updatedDate: base.updatedDate.toISOString().slice(0, 10) } : {}),
    tags: base.tags,
    draft: base.draft,
    ...(base.cover ? { cover: base.cover } : {}),
    ...(base.coverAlt ? { coverAlt: base.coverAlt } : {}),
    ...(base.summary ? { summary: base.summary } : {}),
    ...(base.keywords && base.keywords.length > 0 ? { keywords: [...base.keywords] } : {}),
    ...(base.faq && base.faq.length > 0 ? { faq: base.faq.map((it) => ({ ...it })) } : {}),
    ...(base.lang ? { lang: base.lang } : {}),
    ...extras,
  };
  const rawYml = yaml.dump(obj, { lineWidth: 120 });
  // Strip yaml's quotes around date-like strings (YYYY-MM-DD)
  const yml = rawYml.replace(/(['"])(\d{4}-\d{2}-\d{2})\1/g, "$2");
  return `---\n${yml}---\n\n${body}`;
};

const buildLinkRewriter =
  (knownEnSlugs: Set<string>) =>
  (url: string): string | undefined => {
    // /blog/<slug>(...) → /en/blog/<slug>(...) ONLY if EN twin known to exist
    const m = url.match(/^\/blog\/([^/?#]+)(.*)$/);
    if (!m) return undefined;
    const slug = m[1]!;
    return knownEnSlugs.has(slug) ? `/en/blog/${slug}${m[2] ?? ""}` : undefined;
  };

const readExistingEnState = async (
  outputPath: string,
): Promise<{ sourceHash: string | null; manuallyEdited: boolean } | null> => {
  if (!existsSync(outputPath)) return null;
  const existing = await readFile(outputPath, "utf8");
  // parseFrontmatter's Frontmatter type doesn't include sourceHash/manuallyEdited,
  // so re-parse the raw yaml block directly to access these extra fields.
  const fenceMatch = /^---\r?\n([\s\S]*?)\r?\n---/.exec(existing);
  const rawData =
    fenceMatch && fenceMatch[1] ? (yaml.load(fenceMatch[1]) as Record<string, unknown>) : {};
  return {
    sourceHash: typeof rawData["sourceHash"] === "string" ? rawData["sourceHash"] : null,
    manuallyEdited: rawData["manuallyEdited"] === true,
  };
};

const translateFile = async (
  inputPath: string,
  outputPath: string,
  slug: string,
  knownEnSlugs: Set<string>,
): Promise<FileResult> => {
  const source = await readFile(inputPath, "utf8");
  const ruHash = sha256(source);
  const existingEn = await readExistingEnState(outputPath);
  const force = FORCE_ALL || (FORCE_SLUG !== null && FORCE_SLUG === slug);

  const decision = decideAction({ ruHash, existingEn, force });

  if (decision.action === "skip")
    return {
      slug,
      status: "skipped",
      ...(decision.reason !== undefined ? { note: decision.reason } : {}),
    };
  if (decision.action === "warn")
    return {
      slug,
      status: "warned",
      note: `RU source changed since manual edit; EN may be stale (sourceHash kept untouched). Hand-edit ${outputPath} or run \`pnpm translate -- --force ${slug}\` to re-baseline.`,
    };

  const { frontmatter: ruMeta, body: ruBody } = parseFrontmatter(source);

  // Skip drafts entirely
  if (ruMeta.draft === true) return { slug, status: "skipped", note: "draft" };

  // Translate frontmatter strings (title, description, coverAlt, summary)
  const fmStrings: Record<string, string> = {
    title: ruMeta.title,
    description: ruMeta.description,
    ...(ruMeta.coverAlt ? { coverAlt: ruMeta.coverAlt } : {}),
    ...(ruMeta.summary ? { summary: ruMeta.summary } : {}),
  };

  const fmTranslated =
    Object.keys(fmStrings).length > 0
      ? await translateStrings({
          apiKey: apiKey!,
          sourceLocale: "ru",
          targetLocale: "en",
          strings: fmStrings,
        })
      : {};

  // Translate FAQ items (question + answer prose) if present
  const faqTranslated: ReadonlyArray<{ question: string; answer: string }> | null =
    ruMeta.faq && ruMeta.faq.length > 0
      ? await (async () => {
          const flat: Record<string, string> = {};
          ruMeta.faq!.forEach((it, i) => {
            flat[`q${i}`] = it.question;
            flat[`a${i}`] = it.answer;
          });
          const t = await translateStrings({
            apiKey: apiKey!,
            sourceLocale: "ru",
            targetLocale: "en",
            strings: flat,
          });
          return ruMeta.faq!.map((_, i) => ({
            question: t[`q${i}`] ?? ruMeta.faq![i]!.question,
            answer: t[`a${i}`] ?? ruMeta.faq![i]!.answer,
          }));
        })()
      : null;

  // Translate body via prose extractor
  const { placeholders, skeleton } = extractProse(ruBody, {
    rewriteInternalLink: buildLinkRewriter(knownEnSlugs),
  });
  const translated = await translateProse({
    apiKey: apiKey!,
    sourceLocale: "ru",
    targetLocale: "en",
    placeholders,
  });
  const enBody = reassemble(skeleton, translated);

  // Build EN frontmatter: start from RU, override translated strings + script-managed fields
  const enMeta: Frontmatter = {
    ...ruMeta,
    title: fmTranslated["title"] ?? ruMeta.title,
    description: fmTranslated["description"] ?? ruMeta.description,
    ...(fmTranslated["coverAlt"] ? { coverAlt: fmTranslated["coverAlt"] } : {}),
    ...(fmTranslated["summary"] ? { summary: fmTranslated["summary"] } : {}),
    ...(ruMeta.keywords ? { keywords: ruMeta.keywords } : {}),
    ...(faqTranslated ? { faq: faqTranslated } : {}),
    lang: "en",
  };

  const extras: Record<string, unknown> = {
    sourceHash: ruHash,
    manuallyEdited: false,
  };

  await mkdir(join(outputPath, ".."), { recursive: true });
  await writeFile(outputPath, serializeWithExtras(enMeta, extras, enBody), "utf8");
  return { slug, status: "translated" };
};

const collectEnSlugs = async (postsDir: string): Promise<Set<string>> => {
  // Assume every non-draft RU post will be translated this run, so its slug is "known"
  const slugs = new Set<string>();
  const ruFiles = (await readdir(postsDir)).filter(
    (f) => /\.(md|mdx)$/.test(f) && !f.startsWith("."),
  );
  for (const file of ruFiles) {
    const slug = file.replace(/\.(md|mdx)$/, "");
    if (isFixtureSlug(slug)) continue;
    const src = await readFile(join(postsDir, file), "utf8");
    const { frontmatter } = parseFrontmatter(src);
    if (frontmatter.draft === true) continue;
    slugs.add(slug);
  }
  return slugs;
};

const translateAllPosts = async (): Promise<readonly FileResult[]> => {
  const knownEnSlugs = await collectEnSlugs(PATHS.postsDir);
  const ruFiles = (await readdir(PATHS.postsDir)).filter(
    (f) => /\.(md|mdx)$/.test(f) && !f.startsWith("."),
  );
  const results: FileResult[] = [];
  for (const file of ruFiles) {
    const slug = file.replace(/\.(md|mdx)$/, "");
    if (isFixtureSlug(slug)) {
      console.warn(`[posts] ${slug}: skipped (e2e fixture)`);
      continue;
    }
    const inputPath = join(PATHS.postsDir, file);
    const outputPath = join(PATHS.postsEnDir, file);
    try {
      const r = await translateFile(inputPath, outputPath, slug, knownEnSlugs);
      results.push(r);
      console.warn(`[posts] ${slug}: ${r.status}${r.note ? " (" + r.note + ")" : ""}`);
    } catch (err) {
      results.push({ slug, status: "failed", note: String(err) });
      console.error(`[posts] ${slug}: failed —`, err);
    }
  }
  return results;
};

/** Translate a site content file (about, etc.) that has only a `title` in frontmatter. */
const translateSiteFile = async (
  inputPath: string,
  outputPath: string,
  slug: string,
): Promise<FileResult> => {
  const source = await readFile(inputPath, "utf8");
  const ruHash = sha256(source);
  const existingEn = await readExistingEnState(outputPath);
  const force = FORCE_ALL || (FORCE_SLUG !== null && FORCE_SLUG === slug);

  const decision = decideAction({ ruHash, existingEn, force });
  if (decision.action === "skip")
    return {
      slug,
      status: "skipped",
      ...(decision.reason !== undefined ? { note: decision.reason } : {}),
    };
  if (decision.action === "warn")
    return {
      slug,
      status: "warned",
      note: `RU source changed since manual edit; EN may be stale. Run \`pnpm translate -- --force ${slug}\` to re-baseline.`,
    };

  // Parse raw frontmatter without requiring pubDate
  const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
  const fenceMatch = FENCE.exec(source);
  if (!fenceMatch || fenceMatch[1] === undefined) throw new Error("No frontmatter block found");
  const rawData = yaml.load(fenceMatch[1]) as Record<string, unknown>;
  const body = source.slice(fenceMatch[0].length).replace(/^\s*\n/, "");

  // Translate the title (and any other string fields present)
  const fmStrings: Record<string, string> = {};
  if (typeof rawData["title"] === "string") fmStrings["title"] = rawData["title"];
  if (typeof rawData["description"] === "string") fmStrings["description"] = rawData["description"];

  const fmTranslated =
    Object.keys(fmStrings).length > 0
      ? await translateStrings({
          apiKey: apiKey!,
          sourceLocale: "ru",
          targetLocale: "en",
          strings: fmStrings,
        })
      : {};

  // Translate body
  const { placeholders, skeleton } = extractProse(body, { rewriteInternalLink: () => undefined });
  const translated = await translateProse({
    apiKey: apiKey!,
    sourceLocale: "ru",
    targetLocale: "en",
    placeholders,
  });
  const enBody = reassemble(skeleton, translated);

  // Rebuild frontmatter: merge translated fields + sourceHash/manuallyEdited
  const enData: Record<string, unknown> = {
    ...rawData,
    ...fmTranslated,
    sourceHash: ruHash,
    manuallyEdited: false,
  };
  const rawYml = yaml.dump(enData, { lineWidth: 120 });
  const enFile = `---\n${rawYml}---\n\n${enBody}`;

  await mkdir(join(outputPath, ".."), { recursive: true });
  await writeFile(outputPath, enFile, "utf8");
  return { slug, status: "translated" };
};

const translateAllSite = async (): Promise<readonly FileResult[]> => {
  if (!existsSync(PATHS.siteDir)) return [];
  const files = (await readdir(PATHS.siteDir)).filter((f) => /\.md$/.test(f) && !f.startsWith("."));
  const results: FileResult[] = [];
  for (const file of files) {
    const slug = file.replace(/\.md$/, "");
    const inputPath = join(PATHS.siteDir, file);
    const outputPath = join(PATHS.siteEnDir, file);
    try {
      const r = await translateSiteFile(inputPath, outputPath, slug);
      results.push(r);
      console.warn(`[site] ${slug}: ${r.status}${r.note ? " (" + r.note + ")" : ""}`);
    } catch (err) {
      results.push({ slug, status: "failed", note: String(err) });
      console.error(`[site] ${slug}: failed —`, err);
    }
  }
  return results;
};

const translateProjectFile = async (
  inputPath: string,
  outputPath: string,
  slug: string,
): Promise<FileResult> => {
  const source = await readFile(inputPath, "utf8");
  const ruHash = sha256(source);
  const existingEn = await readExistingEnState(outputPath);
  const force = FORCE_ALL || (FORCE_SLUG !== null && FORCE_SLUG === slug);

  const decision = decideAction({ ruHash, existingEn, force });
  if (decision.action === "skip")
    return {
      slug,
      status: "skipped",
      ...(decision.reason !== undefined ? { note: decision.reason } : {}),
    };
  if (decision.action === "warn")
    return {
      slug,
      status: "warned",
      note: `RU source changed since manual edit; run \`pnpm translate -- --force projects/${slug}\` to re-baseline.`,
    };

  const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
  const fenceMatch = FENCE.exec(source);
  if (!fenceMatch || fenceMatch[1] === undefined) throw new Error("No frontmatter block found");
  const rawData = yaml.load(fenceMatch[1]) as Record<string, unknown>;
  const body = source.slice(fenceMatch[0].length).replace(/^\s*\n/, "");

  // Translatable strings: title, description, role, coverAlt, outcomes[], links[].label.
  const fmStrings: Record<string, string> = {};
  if (typeof rawData["title"] === "string") fmStrings["title"] = rawData["title"];
  if (typeof rawData["description"] === "string") fmStrings["description"] = rawData["description"];
  if (typeof rawData["role"] === "string") fmStrings["role"] = rawData["role"];
  if (typeof rawData["coverAlt"] === "string") fmStrings["coverAlt"] = rawData["coverAlt"];
  const outcomes = Array.isArray(rawData["outcomes"]) ? (rawData["outcomes"] as unknown[]) : [];
  outcomes.forEach((o, i) => {
    if (typeof o === "string") fmStrings[`outcome_${i}`] = o;
  });
  const links = Array.isArray(rawData["links"]) ? (rawData["links"] as unknown[]) : [];
  links.forEach((l, i) => {
    if (
      l &&
      typeof l === "object" &&
      "label" in l &&
      typeof (l as { label: unknown }).label === "string"
    ) {
      fmStrings[`link_label_${i}`] = (l as { label: string }).label;
    }
  });

  const fmTranslated =
    Object.keys(fmStrings).length > 0
      ? await translateStrings({
          apiKey: apiKey!,
          sourceLocale: "ru",
          targetLocale: "en",
          strings: fmStrings,
        })
      : {};

  const { placeholders, skeleton } = extractProse(body, { rewriteInternalLink: () => undefined });
  const translated = await translateProse({
    apiKey: apiKey!,
    sourceLocale: "ru",
    targetLocale: "en",
    placeholders,
  });
  const enBody = reassemble(skeleton, translated);

  const enOutcomes = outcomes.map((o, i) =>
    typeof o === "string" ? (fmTranslated[`outcome_${i}`] ?? o) : o,
  );
  const enLinks = links.map((l, i) => {
    if (l && typeof l === "object" && "label" in l && "url" in l) {
      const link = l as { label: string; url: string };
      return { label: fmTranslated[`link_label_${i}`] ?? link.label, url: link.url };
    }
    return l;
  });

  const enData: Record<string, unknown> = {
    ...rawData,
    title: fmTranslated["title"] ?? rawData["title"],
    description: fmTranslated["description"] ?? rawData["description"],
    role: fmTranslated["role"] ?? rawData["role"],
    ...(fmTranslated["coverAlt"] ? { coverAlt: fmTranslated["coverAlt"] } : {}),
    outcomes: enOutcomes,
    links: enLinks,
    sourceHash: ruHash,
    manuallyEdited: false,
  };
  const rawYml = yaml.dump(enData, { lineWidth: 120 });
  const enFile = `---\n${rawYml}---\n\n${enBody}`;

  await mkdir(join(outputPath, ".."), { recursive: true });
  await writeFile(outputPath, enFile, "utf8");
  return { slug, status: "translated" };
};

const translateAllProjects = async (): Promise<readonly FileResult[]> => {
  if (!existsSync(PATHS.projectsDir)) return [];
  const files = (await readdir(PATHS.projectsDir)).filter(
    (f) => /\.md$/.test(f) && !f.startsWith("."),
  );
  const results: FileResult[] = [];
  for (const file of files) {
    const slug = file.replace(/\.md$/, "");
    const inputPath = join(PATHS.projectsDir, file);
    const outputPath = join(PATHS.projectsEnDir, file);
    try {
      const r = await translateProjectFile(inputPath, outputPath, slug);
      results.push(r);
      console.warn(`[projects] ${slug}: ${r.status}${r.note ? " (" + r.note + ")" : ""}`);
    } catch (err) {
      results.push({ slug, status: "failed", note: String(err) });
      console.error(`[projects] ${slug}: failed —`, err);
    }
  }
  return results;
};

const translateStringCatalog = async (): Promise<void> => {
  const ruPath = join(PATHS.i18nDir, "strings.ru.json");
  const enPath = join(PATHS.i18nDir, "strings.en.json");
  const ru = JSON.parse(await readFile(ruPath, "utf8")) as Record<string, string>;
  const en = existsSync(enPath)
    ? (JSON.parse(await readFile(enPath, "utf8")) as Record<string, string>)
    : {};
  const hashPath = join(PATHS.i18nDir, ".strings.hashes.json");
  const hashes: Record<string, string> = existsSync(hashPath)
    ? (JSON.parse(await readFile(hashPath, "utf8")) as Record<string, string>)
    : {};

  const stale: Record<string, string> = {};
  for (const [key, val] of Object.entries(ru)) {
    const h = sha256(val);
    if (hashes[key] !== h || !(key in en)) stale[key] = val;
    hashes[key] = h;
  }
  if (Object.keys(stale).length === 0) {
    console.warn("[strings] all keys up to date");
    return;
  }
  console.warn(`[strings] translating ${Object.keys(stale).length} key(s)`);
  const translated = await translateStrings({
    apiKey: apiKey!,
    sourceLocale: "ru",
    targetLocale: "en",
    strings: stale,
  });
  const merged = { ...en, ...translated };
  // Preserve key order from RU
  const ordered: Record<string, string> = {};
  for (const key of Object.keys(ru)) ordered[key] = merged[key] ?? en[key] ?? ru[key]!;
  await writeFile(enPath, JSON.stringify(ordered, null, 2) + "\n", "utf8");
  await writeFile(hashPath, JSON.stringify(hashes, null, 2) + "\n", "utf8");
};

const translateTagCatalog = async (): Promise<void> => {
  const ruPath = join(PATHS.i18nDir, "tags.ru.json");
  const enPath = join(PATHS.i18nDir, "tags.en.json");
  // Collect all tag slugs from posts
  const ruFiles = (await readdir(PATHS.postsDir)).filter((f) => /\.(md|mdx)$/.test(f));
  const allSlugs = new Set<string>();
  for (const file of ruFiles) {
    const src = await readFile(join(PATHS.postsDir, file), "utf8");
    const { frontmatter } = parseFrontmatter(src);
    for (const t of frontmatter.tags) allSlugs.add(t);
  }
  const ruDict = JSON.parse(await readFile(ruPath, "utf8")) as Record<string, string>;
  const enDict = existsSync(enPath)
    ? (JSON.parse(await readFile(enPath, "utf8")) as Record<string, string>)
    : {};
  // Add missing slugs to RU dict with slug-as-fallback label
  for (const slug of allSlugs) if (!(slug in ruDict)) ruDict[slug] = slug;
  // Translate any RU keys missing from EN dict
  const missing: Record<string, string> = {};
  for (const [k, v] of Object.entries(ruDict)) if (!(k in enDict)) missing[k] = v;
  if (Object.keys(missing).length > 0) {
    console.warn(`[tags] translating ${Object.keys(missing).length} new tag(s)`);
    const translated = await translateStrings({
      apiKey: apiKey!,
      sourceLocale: "ru",
      targetLocale: "en",
      strings: missing,
    });
    Object.assign(enDict, translated);
  }
  await writeFile(ruPath, JSON.stringify(ruDict, null, 2) + "\n", "utf8");
  await writeFile(enPath, JSON.stringify(enDict, null, 2) + "\n", "utf8");
};

const main = async (): Promise<void> => {
  console.warn("==> Translating posts");
  const posts = await translateAllPosts();
  console.warn("==> Translating site content");
  const site = await translateAllSite();
  console.warn("==> Translating projects");
  const projects = await translateAllProjects();
  console.warn("==> Translating string catalog");
  await translateStringCatalog();
  console.warn("==> Translating tag catalog");
  await translateTagCatalog();

  const all = [...posts, ...site, ...projects];
  const failed = all.filter((r) => r.status === "failed");
  const warned = all.filter((r) => r.status === "warned");
  if (warned.length) {
    console.warn(`\n${warned.length} manually-edited file(s) have stale source:`);
    for (const w of warned) console.warn(`  - ${w.slug}: ${w.note}`);
  }
  if (failed.length) {
    console.error(`\n${failed.length} file(s) failed`);
    process.exit(1);
  }
  console.warn("\nTranslation complete");
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
