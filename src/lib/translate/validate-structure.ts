import type { ProsePlaceholder } from "./extract-prose";

// Markdown markers that always come in pairs in source prose. Counting their
// occurrences in source vs translation is enough to catch the dominant
// translator failure mode: dropping a closing marker after internal punctuation
// (e.g. `**phrase."** Continuation` → `**phrase." Continuation`).
//
// Italic markers (`_`, single `*`) are intentionally NOT validated here:
// translations legitimately add or remove emphasis on different words, and
// remark-stringify may rewrite one form into the other on round-trip.
export const STRUCTURAL_MARKERS = ["**", "`"] as const;
export type StructuralMarker = (typeof STRUCTURAL_MARKERS)[number];

export interface StructuralMismatch {
  readonly id: number;
  readonly marker: StructuralMarker;
  readonly sourceCount: number;
  readonly translatedCount: number;
}

const countOccurrences = (haystack: string, needle: string): number => {
  if (needle.length === 0) return 0;
  let count = 0;
  let pos = 0;
  while (true) {
    const idx = haystack.indexOf(needle, pos);
    if (idx === -1) break;
    count++;
    pos = idx + needle.length;
  }
  return count;
};

export const findStructuralMismatches = (
  placeholders: readonly ProsePlaceholder[],
  translated: readonly { id: number; text: string }[],
): readonly StructuralMismatch[] => {
  const sourceById = new Map(placeholders.map((p) => [p.id, p]));
  const mismatches: StructuralMismatch[] = [];
  for (const t of translated) {
    const src = sourceById.get(t.id);
    if (!src || src.kind !== "prose") continue;
    for (const marker of STRUCTURAL_MARKERS) {
      const sourceCount = countOccurrences(src.text, marker);
      const translatedCount = countOccurrences(t.text, marker);
      if (sourceCount !== translatedCount) {
        mismatches.push({ id: t.id, marker, sourceCount, translatedCount });
      }
    }
  }
  return mismatches;
};

export const formatMismatchSummary = (mismatches: readonly StructuralMismatch[]): string =>
  mismatches
    .map((m) => `id=${m.id} '${m.marker}': source=${m.sourceCount} translated=${m.translatedCount}`)
    .join("; ");
