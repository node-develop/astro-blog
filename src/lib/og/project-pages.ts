/**
 * Project OG image paths and eyebrows.
 *
 * The four portfolio pages (`/projects/astro-blog/`,
 * `/projects/claude-code-guide/` and their EN twins) were the last content
 * pages still shipping the site-wide `/og-default.png` placeholder: the
 * section that is supposed to back up the author's competence was the one
 * section shared without a card of its own.
 *
 * Shape: `/og/project/<slug>-<locale>.png` — modelled on `postOgPath()`,
 * with the same locale suffix on BOTH locales. Collision-proof for the same
 * reason: within one locale a project slug is unique, and across locales the
 * same file name would have to end in both `-ru` and `-en`. A bare-RU plus
 * suffixed-EN scheme has no such guarantee (an RU project slugged `foo-en`
 * would quietly take over the EN card of `foo`). The route asserts
 * uniqueness anyway, so a later change to this shape fails the build instead
 * of silently serving the wrong picture.
 */
import type { Locale } from "~/i18n";

/**
 * Locale-neutral project slug from a collection entry id: `en/astro-blog.md`
 * and `astro-blog` alike collapse to `astro-blog`. Shared by the image route
 * and the two page routes so the card a page asks for is the card the build
 * emits.
 */
export const bareProjectSlug = (id: string): string => id.replace(/^en\//, "").replace(/\.md$/, "");

/** File-name stem of a project card: `<slug>-<locale>`. */
export const projectOgSlug = (slug: string, locale: Locale): string => `${slug}-${locale}`;

/** Public path of a project card. Use as `<BaseLayout ogImage={...}>`. */
export const projectOgPath = (slug: string, locale: Locale): string =>
  `/og/project/${projectOgSlug(slug, locale)}.png`;

export interface ProjectEyebrowInput {
  readonly locale: Locale;
  /** Year the project was published — the `pubDate` the page itself shows. */
  readonly year: number;
}

/**
 * Eyebrow line above the project title, in the page's own language and
 * pre-uppercased like every other eyebrow in this folder (Satori is not
 * relied on to honour `text-transform`). Same `<SECTION> · <YEAR>` shape as
 * the post eyebrow, which reads `<TAG> · <YEAR>`.
 */
export const projectOgEyebrow = ({ locale, year }: ProjectEyebrowInput): string =>
  `${locale === "en" ? "PROJECT" : "ПРОЕКТ"} · ${year}`;
