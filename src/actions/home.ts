import { defineAction, ActionError } from "astro:actions";
import { z } from "astro/zod";
import { join } from "node:path";
import { SITE_DIR } from "~/lib/fs/paths";
import { writeHomeToDisk } from "~/lib/content/write-home";
import { assertAdmin } from "./_auth";

const SITE_EN_DIR = join(SITE_DIR, "en");

const normaliseOptional = (v: string | undefined): string | undefined => (v === "" ? undefined : v);

/**
 * Input schema for `home.update`. Exported so unit tests can validate the
 * contract (tests/unit/actions/home.test.ts) without the action runtime.
 */
export const homeUpdateInput = z.object({
  locale: z.enum(["ru", "en"]),
  // Required fields — hard min validation, no empty-string normalisation.
  heroTitle: z.string().min(1),
  metaTitle: z.string().min(1).max(120),
  metaDescription: z.string().min(10).max(200),
  // Optional fields — empty string normalised to undefined so merge-semantics
  // preserves existing file values rather than overwriting with blank (M-6).
  heroEyebrow: z.string().optional(),
  heroLede: z.string().optional(),
  heroCta: z.string().optional(),
  courseEyebrow: z.string().optional(),
  courseTitle: z.string().optional(),
  courseLede: z.string().optional(),
  courseCta: z.string().optional(),
  latestLabel: z.string().optional(),
  authorLabel: z.string().optional(),
  authorBio: z.string().optional(),
  authorLinksAria: z.string().optional(),
});

export const home = {
  update: defineAction({
    input: homeUpdateInput,
    handler: async (input, context) => {
      assertAdmin(context.locals.user as { role?: string | null } | null);

      const { locale, heroTitle, metaTitle, metaDescription, ...optionals } = input;

      const patch = {
        heroTitle,
        metaTitle,
        metaDescription,
        heroEyebrow: normaliseOptional(optionals.heroEyebrow),
        heroLede: normaliseOptional(optionals.heroLede),
        heroCta: normaliseOptional(optionals.heroCta),
        courseEyebrow: normaliseOptional(optionals.courseEyebrow),
        courseTitle: normaliseOptional(optionals.courseTitle),
        courseLede: normaliseOptional(optionals.courseLede),
        courseCta: normaliseOptional(optionals.courseCta),
        latestLabel: normaliseOptional(optionals.latestLabel),
        authorLabel: normaliseOptional(optionals.authorLabel),
        authorBio: normaliseOptional(optionals.authorBio),
        authorLinksAria: normaliseOptional(optionals.authorLinksAria),
        // EN saves unconditionally mark file as manually edited so the translate
        // pipeline does not silently overwrite human-crafted EN copy.
        ...(locale === "en" ? { manuallyEdited: true as const } : {}),
      };

      const baseDir = locale === "en" ? SITE_EN_DIR : SITE_DIR;
      const filePath = join(baseDir, "home.md");

      try {
        await writeHomeToDisk(filePath, patch);
      } catch (err) {
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: `home.md write failed: ${String(err)}`,
        });
      }

      return { ok: true as const, locale };
    },
  }),
};
