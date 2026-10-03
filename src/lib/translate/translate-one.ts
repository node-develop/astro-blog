/**
 * Runtime orchestrator for translating a single content unit RU → EN.
 *
 * Used by both the CLI batch script (one-by-one within `pnpm translate`) and
 * the in-admin Astro Action `translate.one`. Pure async I/O — never logs to
 * console; everything bubbles back through the result.
 *
 * Strategy mirrors `scripts/translate.ts`:
 *   1. Read RU file → hash of its translatable content (./hash.ts).
 *   2. Read existing EN file's `sourceHash` + `manuallyEdited` flag.
 *   3. `decideAction` decides translate / skip / warn.
 *   4. Translate frontmatter strings + body prose via Claude Haiku.
 *   5. Re-serialize and atomically write the EN twin.
 *
 * The same code path handles all five collections (posts, site, projects,
 * courses, lessons) — they only differ in which frontmatter fields exist.
 * We dispatch on a per-collection schema rather than maintaining four
 * near-identical functions.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import * as yaml from "~/lib/yaml";
import { contentHash } from "./hash";
import {
  FENCE,
  SCHEMAS,
  collectStringFields,
  splitFrontmatter,
  type CollectionSchema,
} from "./fields";
import { extractProse, reassemble } from "./extract-prose";
import { translateProse, translateStrings } from "./claude";
import { decideAction } from "./decide-action";
import { resolveCollectionPaths, type TranslateCollection } from "./site-config";
import { POST_LIMITS, PROJECT_LIMITS, SITE_LIMITS } from "../content/limits";
import type { Limits } from "./validate-lengths";

export interface TranslateOneInput {
  readonly collection: TranslateCollection;
  readonly slug: string;
  readonly apiKey: string;
  readonly force?: boolean;
}

export type TranslateOneStatus = "translated" | "skipped" | "warned" | "failed" | "missing";

export interface TranslateOneResult {
  readonly status: TranslateOneStatus;
  readonly reason?: string;
  readonly enPath?: string;
  readonly sourceHash?: string;
}

interface FrontmatterPeek {
  readonly draft?: boolean;
  readonly sourceHash?: string;
  readonly manuallyEdited?: boolean;
}

const readExistingEnState = async (
  outputPath: string,
): Promise<{ sourceHash: string | null; manuallyEdited: boolean; apiManaged: boolean } | null> => {
  if (!existsSync(outputPath)) return null;
  const existing = await readFile(outputPath, "utf8");
  const m = FENCE.exec(existing);
  const rawData = m && m[1] ? ((yaml.load(m[1]) ?? {}) as Record<string, unknown>) : {};
  return {
    sourceHash: typeof rawData["sourceHash"] === "string" ? rawData["sourceHash"] : null,
    manuallyEdited: rawData["manuallyEdited"] === true,
    apiManaged: typeof rawData["apiRevision"] === "string",
  };
};

const applyTranslations = (
  rawData: Record<string, unknown>,
  translated: Record<string, string>,
  schema: CollectionSchema,
): Record<string, unknown> => {
  const out: Record<string, unknown> = { ...rawData };

  for (const k of schema.stringFields) {
    if (translated[k] !== undefined) out[k] = translated[k];
  }
  for (const arrField of schema.arrayFields) {
    const arr = Array.isArray(rawData[arrField]) ? (rawData[arrField] as unknown[]) : null;
    if (arr) {
      out[arrField] = arr.map((item, i) =>
        typeof item === "string" ? (translated[`${arrField}_${i}`] ?? item) : item,
      );
    }
  }
  if (schema.faq && Array.isArray(rawData["faq"])) {
    out["faq"] = (rawData["faq"] as unknown[]).map((it, i) => {
      if (it && typeof it === "object" && "question" in it && "answer" in it) {
        const item = it as { question: string; answer: string };
        return {
          question: translated[`faq_q${i}`] ?? item.question,
          answer: translated[`faq_a${i}`] ?? item.answer,
        };
      }
      return it;
    });
  }
  if (schema.linkLabels && Array.isArray(rawData["links"])) {
    out["links"] = (rawData["links"] as unknown[]).map((l, i) => {
      if (l && typeof l === "object" && "label" in l && "url" in l) {
        const link = l as { label: string; url: string };
        return { label: translated[`link_label_${i}`] ?? link.label, url: link.url };
      }
      return l;
    });
  }
  return out;
};

/**
 * Build the `constraints` and `optionalKeys` for a given collection so that
 * `translateStrings` can enforce per-field length limits after translation.
 * courses/lessons have no limits defined yet — returns empty constraints.
 */
const buildConstraints = (
  collection: TranslateCollection,
  rawData: Record<string, unknown>,
): { constraints: Limits; optionalKeys: ReadonlySet<string> } => {
  if (collection === "posts") {
    const faqCount = Array.isArray(rawData["faq"]) ? (rawData["faq"] as unknown[]).length : 0;
    const faqLimits: Record<string, { min?: number; max: number }> = {};
    for (let i = 0; i < faqCount; i++) {
      faqLimits[`faq_q${i}`] = {
        min: POST_LIMITS.faqQuestion.min,
        max: POST_LIMITS.faqQuestion.max,
      };
      faqLimits[`faq_a${i}`] = { min: POST_LIMITS.faqAnswer.min, max: POST_LIMITS.faqAnswer.max };
    }
    return {
      constraints: {
        title: { min: POST_LIMITS.title.min, max: POST_LIMITS.title.max },
        description: { min: POST_LIMITS.description.min, max: POST_LIMITS.description.max },
        summary: { min: POST_LIMITS.summary.min, max: POST_LIMITS.summary.max },
        ...faqLimits,
      },
      optionalKeys: new Set(["summary", "coverAlt"]),
    };
  }
  if (collection === "site") {
    return {
      constraints: {
        description: { min: SITE_LIMITS.description.min, max: SITE_LIMITS.description.max },
      },
      optionalKeys: new Set(["description"]),
    };
  }
  if (collection === "projects") {
    return {
      constraints: {
        title: { min: PROJECT_LIMITS.title.min, max: PROJECT_LIMITS.title.max },
        description: { min: PROJECT_LIMITS.description.min, max: PROJECT_LIMITS.description.max },
        role: { min: PROJECT_LIMITS.role.min, max: PROJECT_LIMITS.role.max },
      },
      optionalKeys: new Set(["coverAlt"]),
    };
  }
  // courses / lessons: no limits yet
  return { constraints: {}, optionalKeys: new Set() };
};

/**
 * Translate one content file. Caller supplies the API key; we never read
 * `process.env` directly — keeps the function pure-ish and testable.
 */
export const translateOne = async (input: TranslateOneInput): Promise<TranslateOneResult> => {
  const { collection, slug, apiKey, force = false } = input;

  const { ruPath, enPath } = resolveCollectionPaths(collection, slug);
  if (!existsSync(ruPath)) {
    return { status: "missing", reason: `RU source not found at ${ruPath}` };
  }

  const source = await readFile(ruPath, "utf8");
  const ruHash = contentHash(collection, source);

  const existingEn = await readExistingEnState(enPath);
  const apiManaged =
    existingEn?.apiManaged === true ||
    (FENCE.test(source) && typeof splitFrontmatter(source).rawData["apiRevision"] === "string");
  const decision = decideAction({ ruHash, existingEn, force, apiManaged });

  if (decision.action === "skip") {
    return {
      status: "skipped",
      reason: decision.reason ?? "no changes",
      enPath,
      sourceHash: ruHash,
    };
  }
  if (decision.action === "warn") {
    return {
      status: "warned",
      reason:
        "RU source changed since manual edit; EN twin marked manuallyEdited=true. Pass force:true to overwrite.",
      enPath,
      sourceHash: ruHash,
    };
  }

  const { rawData, body } = splitFrontmatter(source);
  const peek = rawData as FrontmatterPeek;
  const schema = SCHEMAS[collection];

  if (schema.skipDrafts && peek.draft === true) {
    return { status: "skipped", reason: "draft", enPath, sourceHash: ruHash };
  }

  // Build per-collection constraints and optional-key sets for length validation.
  const { constraints, optionalKeys } = buildConstraints(collection, rawData);

  // Translate frontmatter strings (single API call for the whole bag).
  const fmStrings = collectStringFields(rawData, schema);
  const fmTranslated =
    Object.keys(fmStrings).length > 0
      ? await translateStrings({
          apiKey,
          sourceLocale: "ru",
          targetLocale: "en",
          strings: fmStrings,
          constraints,
          optionalKeys,
        })
      : {};

  // Translate body prose.
  const { placeholders, skeleton } = extractProse(body, {
    rewriteInternalLink: () => undefined,
  });
  const translatedProse = await translateProse({
    apiKey,
    sourceLocale: "ru",
    targetLocale: "en",
    placeholders,
  });
  const enBody = reassemble(skeleton, translatedProse);

  // Apply translated strings to the frontmatter object, append EN-twin
  // bookkeeping fields, and serialise.
  const enData = applyTranslations(rawData, fmTranslated, schema);
  enData["lang"] = "en";
  enData["sourceHash"] = ruHash;
  enData["manuallyEdited"] = false;

  const rawYml = yaml.dump(enData, { lineWidth: 120 });
  // Strip yaml's quotes around date-like strings so YYYY-MM-DD stays unquoted.
  const yml = rawYml.replace(/(['"])(\d{4}-\d{2}-\d{2})\1/g, "$2");
  const enFile = `---\n${yml}---\n\n${enBody}`;

  await mkdir(dirname(enPath), { recursive: true });
  await writeFile(enPath, enFile, "utf8");
  return { status: "translated", enPath, sourceHash: ruHash };
};
