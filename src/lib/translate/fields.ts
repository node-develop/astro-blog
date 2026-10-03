/**
 * What the RU → EN pipeline translates, per collection. `translate-one.ts`
 * sends exactly these values to the model and `hash.ts` hashes exactly these
 * values, so an EN twin goes stale when (and only when) something that gets
 * translated has changed.
 *
 * Cleanup pending: scripts/translate.ts (the `pnpm translate` batch) is an
 * older near-copy of translate-one.ts. It takes the site field list from
 * here, but still spells out the post and project fields by hand. Adding a
 * translatable field means changing both until that script is folded into
 * translateOne.
 */
import * as yaml from "../yaml";
import type { TranslateCollection } from "./site-config";

export const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export const splitFrontmatter = (
  source: string,
): { rawData: Record<string, unknown>; body: string } => {
  const m = FENCE.exec(source);
  if (!m || m[1] === undefined) throw new Error("No frontmatter block found");
  const rawData = (yaml.load(m[1]) ?? {}) as Record<string, unknown>;
  const body = source.slice(m[0].length).replace(/^\s*\n/, "");
  return { rawData, body };
};

/**
 * Per-collection mapping: which frontmatter fields are translatable strings,
 * which are translatable arrays of strings, and which are translatable arrays
 * of objects (`faq[].question/answer`, `links[].label`).
 */
export interface CollectionSchema {
  readonly stringFields: ReadonlyArray<string>;
  readonly arrayFields: ReadonlyArray<string>;
  readonly faq?: boolean;
  readonly linkLabels?: boolean;
  readonly skipDrafts: boolean;
}

export const SCHEMAS: Record<TranslateCollection, CollectionSchema> = {
  posts: {
    stringFields: ["title", "description", "coverAlt", "summary"],
    arrayFields: [],
    faq: true,
    skipDrafts: true,
  },
  site: {
    stringFields: [
      "title",
      "description",
      // Home page fields — the typeof v === "string" guard in collectStringFields
      // means these are silently skipped for about/now/uses where they are absent.
      "heroEyebrow",
      "heroTitle",
      "heroLede",
      "heroCta",
      "courseEyebrow",
      "courseTitle",
      "courseLede",
      "courseCta",
      "latestLabel",
      "authorLabel",
      "authorBio",
      "authorLinksAria",
      "metaTitle",
      "metaDescription",
    ],
    arrayFields: [],
    skipDrafts: false,
  },
  projects: {
    stringFields: ["title", "description", "role", "coverAlt"],
    arrayFields: ["outcomes"],
    linkLabels: true,
    skipDrafts: false,
  },
  courses: {
    // Course landing _index.md typically has title + blurb.
    stringFields: ["title", "blurb", "description"],
    arrayFields: [],
    skipDrafts: false,
  },
  lessons: {
    stringFields: ["title", "blurb", "description"],
    arrayFields: [],
    skipDrafts: false,
  },
};

export const collectStringFields = (
  rawData: Record<string, unknown>,
  schema: CollectionSchema,
): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const k of schema.stringFields) {
    const v = rawData[k];
    if (typeof v === "string") out[k] = v;
  }
  for (const arrField of schema.arrayFields) {
    const arr = Array.isArray(rawData[arrField]) ? (rawData[arrField] as unknown[]) : [];
    arr.forEach((item, i) => {
      if (typeof item === "string") out[`${arrField}_${i}`] = item;
    });
  }
  if (schema.faq && Array.isArray(rawData["faq"])) {
    (rawData["faq"] as unknown[]).forEach((it, i) => {
      if (it && typeof it === "object" && "question" in it && "answer" in it) {
        const item = it as { question: unknown; answer: unknown };
        if (typeof item.question === "string") out[`faq_q${i}`] = item.question;
        if (typeof item.answer === "string") out[`faq_a${i}`] = item.answer;
      }
    });
  }
  if (schema.linkLabels && Array.isArray(rawData["links"])) {
    (rawData["links"] as unknown[]).forEach((l, i) => {
      if (l && typeof l === "object" && "label" in l) {
        const label = (l as { label: unknown }).label;
        if (typeof label === "string") out[`link_label_${i}`] = label;
      }
    });
  }
  return out;
};
