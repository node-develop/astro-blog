export type Limits = Readonly<Record<string, { readonly min?: number; readonly max: number }>>;

export type Violation = Readonly<{
  key: string;
  got: number;
  min?: number;
  max: number;
  kind: "over" | "under";
}>;

export const checkLengths = (out: Record<string, string>, limits: Limits): readonly Violation[] => {
  const violations: Violation[] = [];
  for (const [key, value] of Object.entries(out)) {
    const lim = limits[key];
    if (!lim) continue;
    const got = value.length;
    if (got > lim.max) {
      violations.push({
        key,
        got,
        max: lim.max,
        ...(lim.min !== undefined ? { min: lim.min } : {}),
        kind: "over",
      });
    } else if (lim.min !== undefined && got < lim.min) {
      violations.push({ key, got, max: lim.max, min: lim.min, kind: "under" });
    }
  }
  return violations;
};

/**
 * Truncate `s` to at most `max` characters at a word boundary.
 * If the last space before `max` is past 60% of `max`, cut there;
 * otherwise hard-slice at `max`.
 */
export const truncateAtBoundary = (s: string, max: number): string => {
  if (s.length <= max) return s;
  const slice = s.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  return lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice;
};
