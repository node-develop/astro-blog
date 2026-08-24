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

export interface UrlEntry {
  readonly loc: string;
  readonly lastmod?: string;
  readonly changefreq?: string;
  readonly priority?: number;
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

const xmlEscape = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const renderUrlSet = (entries: readonly UrlEntry[]): string => {
  const items = entries
    .map((entry) => {
      const parts = [`    <loc>${xmlEscape(entry.loc)}</loc>`];
      if (entry.lastmod) parts.push(`    <lastmod>${entry.lastmod}</lastmod>`);
      if (entry.changefreq) parts.push(`    <changefreq>${entry.changefreq}</changefreq>`);
      if (typeof entry.priority === "number") {
        parts.push(`    <priority>${entry.priority.toFixed(1)}</priority>`);
      }
      return `  <url>\n${parts.join("\n")}\n  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items}
</urlset>`;
};

export const buildLocaleSitemapResponse = async (locale: Locale): Promise<Response> => {
  const [posts, courseEntries, lessonEntries, projectEntries] = await Promise.all([
    getOrderedPosts({ locale }),
    getCollection("course"),
    getCollection("lesson"),
    getCollection("projects"),
  ]);
  const entries = buildLocaleSitemapEntries({
    locale,
    posts,
    courseEntries,
    lessonEntries,
    projectEntries,
    tagGroups: groupPostsByTag(posts),
  });

  return new Response(renderUrlSet(entries), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
