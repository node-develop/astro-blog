/**
 * Catalog of every landing page that gets a per-page OG image. The slug
 * stays stable in the URL (`/og/landing/<slug>.png`), so additions don't
 * break existing meta tags.
 *
 * C-1 audit: allLandingMeta() has one callsite —
 *   src/pages/og/landing/[slug].png.ts — which runs in Astro build context
 *   (getStaticPaths). getEntry from astro:content is safe there (C-2 confirmed).
 *
 * home and course-ccg titles are now read from home.md via getEntry so they
 * stay in sync with what the admin edits. tags.title remains in strings.json
 * (used on /tags, /en/tags, tags OG) — not touched here.
 */
import { getEntry } from "astro:content";
import { t } from "~/i18n";
import { type Locale } from "~/i18n";
import { OG_BRAND_UPPER } from "./brand";

export type LandingPage =
  "home" | "blog" | "tags" | "about" | "now" | "uses" | "projects" | "course-ccg";

interface LandingMeta {
  readonly page: LandingPage;
  readonly locale: Locale;
  readonly title: string;
  readonly eyebrow: string;
}

// Section label only — the brand half of the eyebrow comes from
// OG_BRAND_UPPER so the wordmark on a card can never drift from the
// canonical origin the site is served on.
const RU_SECTIONS: Record<LandingPage, string> = {
  home: "ГЛАВНАЯ",
  blog: "СТАТЬИ",
  tags: "ТЕМЫ",
  about: "ОБ АВТОРЕ",
  now: "СЕЙЧАС",
  uses: "USES",
  projects: "ПРОЕКТЫ",
  "course-ccg": "КУРС",
};

const EN_SECTIONS: Record<LandingPage, string> = {
  home: "HOME",
  blog: "POSTS",
  tags: "TOPICS",
  about: "ABOUT",
  now: "NOW",
  uses: "USES",
  projects: "PROJECTS",
  "course-ccg": "COURSE",
};

const PAGES: ReadonlyArray<LandingPage> = [
  "home",
  "blog",
  "tags",
  "about",
  "now",
  "uses",
  "projects",
  "course-ccg",
];

const eyebrowFor = (page: LandingPage, locale: Locale): string =>
  `${OG_BRAND_UPPER} · ${locale === "ru" ? RU_SECTIONS[page] : EN_SECTIONS[page]}`;

/**
 * Returns title strings for pages that still use strings.json.
 * home and course-ccg are handled via getEntry — excluded here.
 */
const staticTitleFor = (page: LandingPage, locale: Locale): string | null => {
  switch (page) {
    case "blog":
      return t(locale, "blog.title");
    case "tags":
      return t(locale, "tags.title");
    case "about":
      return t(locale, "nav.about");
    case "now":
      return t(locale, "nav.now");
    case "uses":
      return t(locale, "nav.uses");
    case "projects":
      return t(locale, "projects.title");
    default:
      return null;
  }
};

/**
 * Async — reads home.md / en/home.md for the title fields that are now
 * stored in content (home, course-ccg). All callsites must await this.
 *
 * C-1: one callsite in src/pages/og/landing/[slug].png.ts (getStaticPaths).
 * Updated to await in the same PR.
 */
export const allLandingMeta = async (): Promise<ReadonlyArray<LandingMeta>> => {
  const [homeRu, homeEn] = await Promise.all([
    getEntry("site", "home"),
    getEntry("site", "en/home"),
  ]);

  const homeTitle = (locale: Locale): string => {
    const entry = locale === "en" ? homeEn : homeRu;
    return entry?.data.metaTitle ?? (locale === "ru" ? "Главная" : "Home");
  };

  const courseCcgTitle = (locale: Locale): string => {
    const entry = locale === "en" ? homeEn : homeRu;
    return entry?.data.courseTitle ?? (locale === "ru" ? "Курс" : "Course");
  };

  const out: LandingMeta[] = [];
  for (const page of PAGES) {
    for (const locale of ["ru", "en"] as const) {
      let title: string;
      if (page === "home") {
        title = homeTitle(locale);
      } else if (page === "course-ccg") {
        title = courseCcgTitle(locale);
      } else {
        title = staticTitleFor(page, locale) ?? page;
      }
      out.push({ page, locale, title, eyebrow: eyebrowFor(page, locale) });
    }
  }
  return out;
};

/** Public path for the landing OG image. Use as <BaseLayout ogImage={...}>. */
export const landingOgPath = (page: LandingPage, locale: Locale): string =>
  `/og/landing/${page}-${locale}.png`;
