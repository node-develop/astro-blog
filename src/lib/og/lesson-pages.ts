/**
 * Lesson OG image paths and eyebrows.
 *
 * Course lessons had no card of their own: all 28 of them (14 RU + 14 EN)
 * fell back to the site-wide placeholder, so every lesson shared on a social
 * network looked like every other page of the site.
 *
 * Shape: `/og/lesson/<course>/<lesson>-<locale>.png` — the course segment
 * mirrors the page route (`/courses/<course>/<lesson>/`) and the locale
 * suffix follows the same convention as `postOgPath()` and
 * `landingOgPath()`. Collision-proof for the same reason: the two locales of
 * one lesson differ by the suffix, lesson slugs are unique inside a course,
 * and a lesson slug never contains a slash (the route strips everything up
 * to the last one). The route asserts uniqueness anyway, so a later change
 * to this shape fails the build instead of overwriting a card.
 */
import type { Locale } from "~/i18n";

/** File-name stem of a lesson card: `<lesson>-<locale>`. */
export const lessonOgSlug = (lessonSlug: string, locale: Locale): string =>
  `${lessonSlug}-${locale}`;

/** Public path of a lesson card. Use as `<BaseLayout ogImage={...}>`. */
export const lessonOgPath = (courseSlug: string, lessonSlug: string, locale: Locale): string =>
  `/og/lesson/${courseSlug}/${lessonOgSlug(lessonSlug, locale)}.png`;

export interface LessonEyebrowInput {
  readonly locale: Locale;
  /** 1-based position inside the course, same number the lesson page shows. */
  readonly index: number;
  readonly courseTitle: string;
}

/**
 * Eyebrow line above the lesson title. Pre-uppercased like every other
 * eyebrow in this folder, so the card does not depend on Satori honouring
 * `text-transform`.
 */
export const lessonOgEyebrow = ({ locale, index, courseTitle }: LessonEyebrowInput): string =>
  `${locale === "en" ? "LESSON" : "УРОК"} ${index} · ${courseTitle.toUpperCase()}`;
