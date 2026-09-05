import { getCollection } from "astro:content";
import type { Locale } from "~/i18n";
import { getOrderedPosts } from "~/lib/content/loader";
import { groupPostsByTag } from "~/lib/content/tags";
import { isTagArchiveIndexable } from "~/lib/seo/indexability";
import { canonicalUrl } from "~/lib/seo/url-policy";

interface DatedData {
  readonly pubDate: Date;
  readonly updatedDate?: Date;
}

interface ContentEntry {
  readonly id: string;
  readonly data: DatedData;
}

interface OrderedPost {
  readonly entry: ContentEntry;
}

export interface SitemapInput {
  readonly locale: Locale;
  readonly posts: readonly OrderedPost[];
  readonly courseEntries: readonly ContentEntry[];
  readonly lessonEntries: readonly ContentEntry[];
  readonly projectEntries: readonly ContentEntry[];
  readonly tagGroups: ReadonlyMap<string, readonly unknown[]>;
}

export interface UrlAlternate {
  readonly hreflang: "ru" | "en" | "x-default";
  readonly href: string;
}

export interface UrlEntry {
  readonly loc: string;
  readonly lastmod?: string;
  readonly changefreq?: string;
  readonly priority?: number;
  /** hreflang cluster (ru, en, x-default) — only when both locale pages exist. */
  readonly alternates?: ReadonlyArray<UrlAlternate>;
}

const localePrefix = (locale: Locale): string => (locale === "en" ? "/en" : "");
const bareSlug = (id: string): string => id.replace(/^en\//, "");
const dateOnly = (value: Date): string => value.toISOString().slice(0, 10);

const isLocaleCourse = (id: string, locale: Locale): boolean =>
  locale === "en" ? id.endsWith("/en/_index") : !id.includes("/en/");

const courseSlugFromId = (id: string): string => id.replace(/(?:\/en)?\/_index$/, "");

const isLocaleLesson = (id: string, locale: Locale): boolean =>
  locale === "en" ? id.includes("/en/") : !id.includes("/en/");

const lessonCourseSlug = (id: string): string => id.replace(/\/(en\/)?[^/]+$/, "");
const lessonBareSlug = (id: string): string => id.replace(/^.*\//, "");

const isLocaleProject = (id: string, locale: Locale): boolean =>
  locale === "en" ? id.startsWith("en/") : !id.startsWith("en/");

const navigationEntries = (locale: Locale): readonly UrlEntry[] => {
  const prefix = localePrefix(locale);
  return [
    { loc: canonicalUrl(`${prefix}/`), changefreq: "weekly", priority: 1.0 },
    { loc: canonicalUrl(`${prefix}/blog/`), changefreq: "weekly", priority: 0.9 },
    { loc: canonicalUrl(`${prefix}/projects/`), changefreq: "monthly", priority: 0.7 },
    { loc: canonicalUrl(`${prefix}/about/`), changefreq: "yearly", priority: 0.5 },
    { loc: canonicalUrl(`${prefix}/uses/`), changefreq: "monthly", priority: 0.5 },
    { loc: canonicalUrl(`${prefix}/now/`), changefreq: "monthly", priority: 0.5 },
    { loc: canonicalUrl(`${prefix}/tags/`), changefreq: "weekly", priority: 0.6 },
  ];
};

const assertUniqueLocations = (entries: readonly UrlEntry[]): void => {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.loc)) throw new Error(`Duplicate sitemap URL: ${entry.loc}`);
    seen.add(entry.loc);
  }
};

export const buildLocaleSitemapEntries = (input: SitemapInput): readonly UrlEntry[] => {
  const prefix = localePrefix(input.locale);
  const generated: UrlEntry[] = [
    ...["contact", "privacy"].map((slug) => ({
      loc: canonicalUrl(`${prefix}/${slug}/`),
      changefreq: "yearly",
      priority: 0.4,
    })),
    ...[...input.tagGroups.entries()]
      .filter(([, posts]) => isTagArchiveIndexable(posts))
      .map(([slug]) => ({
        loc: canonicalUrl(`${prefix}/tags/${slug}/`),
        changefreq: "weekly",
        priority: 0.5,
      })),
    ...input.posts.map(({ entry }) => ({
      loc: canonicalUrl(`${prefix}/blog/${bareSlug(entry.id)}/`),
      lastmod: dateOnly(entry.data.updatedDate ?? entry.data.pubDate),
      changefreq: "monthly",
      priority: 0.8,
    })),
    ...input.courseEntries
      .filter((entry) => isLocaleCourse(entry.id, input.locale))
      .map((entry) => ({
        loc: canonicalUrl(`${prefix}/courses/${courseSlugFromId(entry.id)}/`),
        lastmod: dateOnly(entry.data.updatedDate ?? entry.data.pubDate),
        changefreq: "monthly",
        priority: 0.9,
      })),
    ...input.lessonEntries
      .filter((entry) => isLocaleLesson(entry.id, input.locale))
      .map((entry) => ({
        loc: canonicalUrl(
          `${prefix}/courses/${lessonCourseSlug(entry.id)}/${lessonBareSlug(entry.id)}/`,
        ),
        lastmod: dateOnly(entry.data.pubDate),
        changefreq: "monthly",
        priority: 0.7,
      })),
    ...input.projectEntries
      .filter((entry) => isLocaleProject(entry.id, input.locale))
      .map((entry) => ({
        loc: canonicalUrl(`${prefix}/projects/${bareSlug(entry.id)}/`),
        lastmod: dateOnly(entry.data.updatedDate ?? entry.data.pubDate),
        changefreq: "monthly",
        priority: 0.7,
      })),
  ].sort((a, b) => a.loc.localeCompare(b.loc));

  const entries = [...navigationEntries(input.locale), ...generated];
  assertUniqueLocations(entries);
  return entries;
};

const RU_ORIGIN_PATH = /^https:\/\/artka\.dev\//;

/** URL of the same page in the other locale (`/x/` ↔ `/en/x/`). */
export const counterpartLocation = (loc: string, locale: Locale): string => {
  const path = loc.replace(RU_ORIGIN_PATH, "/");
  const counterpartPath =
    locale === "ru"
      ? path === "/"
        ? "/en/"
        : `/en${path}`
      : path === "/en/"
        ? "/"
        : path.slice(3);
  return canonicalUrl(counterpartPath);
};

/**
 * Attaches the hreflang cluster to every entry whose counterpart is present in
 * the other locale's sitemap. Using the real inventory (not a naive prefix
 * swap) means untranslated posts and noindexed tag archives never advertise a
 * missing alternate. x-default always points at the RU page (source of truth).
 */
export const attachAlternates = (
  entries: readonly UrlEntry[],
  locale: Locale,
  otherLocaleEntries: readonly UrlEntry[],
): readonly UrlEntry[] => {
  const other = new Set(otherLocaleEntries.map((entry) => entry.loc));
  return entries.map((entry) => {
    const counterpart = counterpartLocation(entry.loc, locale);
    if (!other.has(counterpart)) return entry;
    const ru = locale === "ru" ? entry.loc : counterpart;
    const en = locale === "en" ? entry.loc : counterpart;
    return {
      ...entry,
      alternates: [
        { hreflang: "ru", href: ru },
        { hreflang: "en", href: en },
        { hreflang: "x-default", href: ru },
      ],
    };
  });
};

const xmlEscape = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const renderUrlSet = (entries: readonly UrlEntry[]): string => {
  const items = entries
    .map((entry) => {
      const parts = [`    <loc>${xmlEscape(entry.loc)}</loc>`];
      for (const alternate of entry.alternates ?? []) {
        parts.push(
          `    <xhtml:link rel="alternate" hreflang="${alternate.hreflang}" href="${xmlEscape(alternate.href)}" />`,
        );
      }
      if (entry.lastmod) parts.push(`    <lastmod>${entry.lastmod}</lastmod>`);
      if (entry.changefreq) parts.push(`    <changefreq>${entry.changefreq}</changefreq>`);
      if (typeof entry.priority === "number") {
        parts.push(`    <priority>${entry.priority.toFixed(1)}</priority>`);
      }
      return `  <url>\n${parts.join("\n")}\n  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${items}
</urlset>`;
};

/** Newest `lastmod` across entries (YYYY-MM-DD), or null when none carries one. */
export const latestLastmod = (entries: readonly UrlEntry[]): string | null =>
  entries.reduce<string | null>((acc, entry) => {
    if (!entry.lastmod) return acc;
    return acc === null || entry.lastmod > acc ? entry.lastmod : acc;
  }, null);

export interface SitemapIndexChild {
  readonly loc: string;
  readonly entries: readonly UrlEntry[];
}

export const renderSitemapIndex = (children: readonly SitemapIndexChild[]): string => {
  const items = children
    .map(({ loc, entries }) => {
      const lastmod = latestLastmod(entries);
      return [
        "  <sitemap>",
        `    <loc>${xmlEscape(loc)}</loc>`,
        ...(lastmod ? [`    <lastmod>${lastmod}</lastmod>`] : []),
        "  </sitemap>",
      ].join("\n");
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items}
</sitemapindex>`;
};

const loadLocaleEntries = async (locale: Locale): Promise<readonly UrlEntry[]> => {
  const [posts, courseEntries, lessonEntries, projectEntries] = await Promise.all([
    getOrderedPosts({ locale }),
    getCollection("course"),
    getCollection("lesson"),
    getCollection("projects"),
  ]);
  return buildLocaleSitemapEntries({
    locale,
    posts,
    courseEntries,
    lessonEntries,
    projectEntries,
    tagGroups: groupPostsByTag(posts),
  });
};

export interface LocaleSitemaps {
  readonly ru: readonly UrlEntry[];
  readonly en: readonly UrlEntry[];
}

/** Both locale inventories with hreflang clusters cross-linked. */
export const loadLocaleSitemaps = async (): Promise<LocaleSitemaps> => {
  const [ru, en] = await Promise.all([loadLocaleEntries("ru"), loadLocaleEntries("en")]);
  return { ru: attachAlternates(ru, "ru", en), en: attachAlternates(en, "en", ru) };
};

export const buildLocaleSitemapResponse = async (locale: Locale): Promise<Response> => {
  const sitemaps = await loadLocaleSitemaps();
  return new Response(renderUrlSet(sitemaps[locale]), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
