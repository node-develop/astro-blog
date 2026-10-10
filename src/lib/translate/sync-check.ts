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
 * slug exist, in either direction.
 */
export type TwinCollection = "site" | "projects";

/** Whether the file of one language exists (every site/project file is built). */
export type TwinSide = "built" | "absent";

export interface TwinState {
  readonly collection: TwinCollection;
  /** `about`, `astro-blog`. */
  readonly slug: string;
  readonly ru: TwinSide;
  readonly en: TwinSide;
}

export interface TwinReport {
  /** RU page is built, EN file does not exist. */
  readonly missingEn: readonly string[];
  /** EN page is built, RU source does not exist (orphan twin). */
  readonly missingRu: readonly string[];
}

export const detectMissingTwins = (pairs: readonly TwinState[]): TwinReport => {
  const missingEn: string[] = [];
  const missingRu: string[] = [];
  for (const p of pairs) {
    if (isFixtureSlug(p.slug)) continue;
    const label = `${p.collection}/${p.slug}`;
    if (p.ru === "built" && p.en === "absent") missingEn.push(label);
    if (p.en === "built" && p.ru === "absent") missingRu.push(label);
  }
  return { missingEn, missingRu };
};

/**
 * What makes `pnpm translate:check` (and CI) fail. A twin that lags behind its
 * RU source is deliberately not on the list: it is still a valid page, and the
 * check only reports it. A broken pair or an invalid EN file is not shippable.
 */
export const shouldFail = (input: {
  readonly report: DriftReport;
  readonly twins: TwinReport;
  readonly schemaErrorCount: number;
}): boolean =>
  input.report.missing.length > 0 ||
  input.twins.missingEn.length > 0 ||
  input.twins.missingRu.length > 0 ||
  input.schemaErrorCount > 0;
