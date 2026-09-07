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
