import type { t } from "~/i18n";
import { type Locale } from "~/i18n";

/**
 * Catalog of every landing page that gets a per-page OG image. The slug
 * stays stable in the URL (`/og/landing/<slug>.png`), so additions don't
 * break existing meta tags.
 */
export type LandingPage =
  | "home"
  | "blog"
  | "tags"
  | "about"
  | "now"
  | "uses"
  | "projects"
  | "course-ccg";

interface LandingMeta {
  readonly page: LandingPage;
  readonly locale: Locale;
  readonly titleKey: Parameters<typeof t>[1];
  readonly eyebrow: string;
}

const RU_EYEBROWS: Record<LandingPage, string> = {
  home: "ARTKA.DEV · ГЛАВНАЯ",
  blog: "ARTKA.DEV · СТАТЬИ",
  tags: "ARTKA.DEV · ТЕМЫ",
  about: "ARTKA.DEV · ОБ АВТОРЕ",
  now: "ARTKA.DEV · СЕЙЧАС",
  uses: "ARTKA.DEV · USES",
  projects: "ARTKA.DEV · ПРОЕКТЫ",
  "course-ccg": "ARTKA.DEV · КУРС",
};

const EN_EYEBROWS: Record<LandingPage, string> = {
  home: "ARTKA.DEV · HOME",
  blog: "ARTKA.DEV · POSTS",
  tags: "ARTKA.DEV · TOPICS",
  about: "ARTKA.DEV · ABOUT",
  now: "ARTKA.DEV · NOW",
  uses: "ARTKA.DEV · USES",
  projects: "ARTKA.DEV · PROJECTS",
  "course-ccg": "ARTKA.DEV · COURSE",
};

const TITLE_KEYS: Record<LandingPage, Parameters<typeof t>[1]> = {
  home: "meta.home.title",
  blog: "blog.title",
  tags: "tags.title",
  about: "nav.about",
  now: "nav.now",
  uses: "nav.uses",
  projects: "projects.title",
  "course-ccg": "home.courseTitle",
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
  locale === "ru" ? RU_EYEBROWS[page] : EN_EYEBROWS[page];

export const allLandingMeta = (): ReadonlyArray<LandingMeta> => {
  const out: LandingMeta[] = [];
  for (const page of PAGES) {
    for (const locale of ["ru", "en"] as const) {
      out.push({ page, locale, titleKey: TITLE_KEYS[page], eyebrow: eyebrowFor(page, locale) });
    }
  }
  return out;
};

/** Public path for the landing OG image. Use as <BaseLayout ogImage={...}>. */
export const landingOgPath = (page: LandingPage, locale: Locale): string =>
  `/og/landing/${page}-${locale}.png`;
