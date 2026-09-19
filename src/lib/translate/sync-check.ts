const FIXTURE_SLUG = /^e2e-/;
export const isFixtureSlug = (slug: string): boolean => FIXTURE_SLUG.test(slug);

export interface FileState {
  readonly slug: string;
  readonly ruHash: string;
  readonly enHash: string | null;
  readonly enExists: boolean;
  readonly enManual: boolean;
  readonly ruDraft: boolean;
  /** API writers own each locale independently of the legacy RU → EN pipeline. */
  readonly apiManaged?: boolean;
}

export interface DriftReport {
  readonly missing: readonly string[];
  readonly drift: readonly string[];
  readonly warnings: readonly string[];
}

export const detectDrift = (files: readonly FileState[]): DriftReport => {
  const missing: string[] = [];
  const drift: string[] = [];
  const warnings: string[] = [];
  for (const f of files) {
    if (f.apiManaged || f.ruDraft || isFixtureSlug(f.slug)) continue;
    if (!f.enExists) {
      missing.push(f.slug);
      continue;
    }
    if (f.ruHash !== f.enHash) {
      if (f.enManual) warnings.push(f.slug);
      else drift.push(f.slug);
    }
  }
  return { missing, drift, warnings };
};

/**
 * Pair presence for the localised collections that are NOT posts. Posts keep
 * going through `detectDrift`, which also knows drafts, API-managed locales
 * and hash drift; here the only question is whether both language pages of a
 * slug are really built, in either direction.
 */
export type TwinCollection = "site" | "projects" | "courses" | "lessons";

/**
 * What the page route of one language does with a slug:
 * - "built": the file exists and the route builds a page from it;
 * - "unbuilt": the file exists, but the route skips it (a course or lesson
 *   whose frontmatter `locale` does not match its folder, or a lesson whose
 *   course has no landing in that language);
 * - "absent": no file.
 */
export type TwinSide = "built" | "unbuilt" | "absent";

export interface TwinState {
  readonly collection: TwinCollection;
  /** `about`, `astro-blog`, `<course>`, `<course>/<lesson>`. */
  readonly slug: string;
  readonly ru: TwinSide;
  readonly en: TwinSide;
}

export interface TwinReport {
  /** RU page is built, EN file does not exist. */
  readonly missingEn: readonly string[];
  /** EN page is built, RU source does not exist (orphan twin). */
  readonly missingRu: readonly string[];
  /** A file exists but its page route will not build it, so the pair is broken. */
  readonly unbuilt: readonly string[];
}

const isFixtureTwin = (slug: string): boolean => slug.split("/").some(isFixtureSlug);

export const detectMissingTwins = (pairs: readonly TwinState[]): TwinReport => {
  const missingEn: string[] = [];
  const missingRu: string[] = [];
  const unbuilt: string[] = [];
  for (const p of pairs) {
    if (isFixtureTwin(p.slug)) continue;
    const label = `${p.collection}/${p.slug}`;
    if (p.ru === "unbuilt") unbuilt.push(`${label} (ru)`);
    if (p.en === "unbuilt") unbuilt.push(`${label} (en)`);
    if (p.ru === "built" && p.en === "absent") missingEn.push(label);
    if (p.en === "built" && p.ru === "absent") missingRu.push(label);
  }
  return { missingEn, missingRu, unbuilt };
};
