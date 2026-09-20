/**
 * Canonical schema and key order for home.md / en/home.md frontmatter.
 *
 * Used by:
 *   - src/lib/content/write-home.ts  (read/validate + merge-write of home.md)
 *   - src/actions/home.ts            (input validation, via homeUpdateInput)
 *   - tests/unit/actions/home.test.ts
 *
 * KEY_ORDER drives yaml.dump({ sortKeys: false }) so the on-disk file stays
 * in a predictable, readable order regardless of JS object property enumeration.
 */
import { z } from "zod";

export const homeFrontmatterSchema = z.object({
  title: z.string(),
  heroEyebrow: z.string().optional(),
  heroTitle: z.string().optional(),
  /** A literal substring of heroTitle to set on the lime fill. Ignored when
      it does not occur in heroTitle, so editing one field never breaks the
      other. */
  heroHighlight: z.string().optional(),
  heroLede: z.string().optional(),
  heroCta: z.string().optional(),
  /** Text that runs around the rotating seal beside the hero. Empty hides it. */
  sealPhrase: z.string().optional(),
  /** Ticker band items, one per line. Empty hides the band. */
  tickerItems: z.string().optional(),
  courseEyebrow: z.string().optional(),
  courseTitle: z.string().optional(),
  courseLede: z.string().optional(),
  courseCta: z.string().optional(),
  latestLabel: z.string().optional(),
  authorLabel: z.string().optional(),
  authorBio: z.string().optional(),
  authorLinksAria: z.string().optional(),
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  sourceHash: z.string().optional(),
  manuallyEdited: z.boolean().default(false),
});

export type HomeFrontmatter = z.infer<typeof homeFrontmatterSchema>;

/** Stable serialisation order for yaml.dump. */
export const KEY_ORDER: ReadonlyArray<keyof HomeFrontmatter> = [
  "title",
  "heroEyebrow",
  "heroTitle",
  "heroHighlight",
  "heroLede",
  "heroCta",
  "sealPhrase",
  "tickerItems",
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
  "sourceHash",
  "manuallyEdited",
];
