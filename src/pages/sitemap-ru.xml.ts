/**
 * RU sitemap — locale-scoped urlset for Search Console hygiene.
 */
import type { APIRoute } from "astro";
import { getCollection, type CollectionEntry } from "astro:content";
import { getOrderedPosts } from "~/lib/content/loader";
import { getAllTagSlugs } from "~/lib/content/tags";
import type { Locale } from "~/i18n";

const LOCALE: Locale = "ru";
const SITE = "https://artka.dev";

const localePrefix = (l: Locale): string => (l === "en" ? "/en" : "");
const bareSlug = (id: string): string => id.replace(/^en\//, "");

// Course IDs come from `**/_index.{md,mdx}` under src/content/courses.
// RU example: "claude-code-guide/_index"
// EN example: "claude-code-guide/en/_index"
const isLocaleCourse = (id: string, locale: Locale): boolean =>
  locale === "en" ? id.endsWith("/en/_index") : !id.includes("/en/");
const courseSlugFromId = (id: string): string => id.replace(/(?:\/en)?\/_index$/, "");

// Lesson IDs come from everything else under src/content/courses.
// RU example: "claude-code-guide/01-introduction"
// EN example: "claude-code-guide/en/01-introduction"
const isLocaleLesson = (id: string, locale: Locale): boolean =>
  locale === "en" ? id.includes("/en/") : !id.includes("/en/");
const lessonCourseSlug = (id: string): string => id.replace(/\/(en\/)?[^/]+$/, "");
const lessonBareSlug = (id: string): string => id.replace(/^.*\//, "");

const xmlEscape = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

interface UrlEntry {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: number;
}

const buildXml = (urls: readonly UrlEntry[]): string => {
  const items = urls
    .map((u) => {
      const parts = [`    <loc>${xmlEscape(u.loc)}</loc>`];
      if (u.lastmod) parts.push(`    <lastmod>${u.lastmod}</lastmod>`);
      if (u.changefreq) parts.push(`    <changefreq>${u.changefreq}</changefreq>`);
      if (typeof u.priority === "number")
        parts.push(`    <priority>${u.priority.toFixed(1)}</priority>`);
      return `  <url>\n${parts.join("\n")}\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items}
</urlset>`;
};

export const GET: APIRoute = async () => {
  const ruPosts = await getOrderedPosts({ locale: "ru" });
  const enPosts = await getOrderedPosts({ locale: "en" });
  const posts = LOCALE === "ru" ? ruPosts : enPosts;
  const prefix = localePrefix(LOCALE);
  const tagSlugs = getAllTagSlugs({ ru: ruPosts, en: enPosts });

  const allCourses = await getCollection("course");
  const allLessons = await getCollection("lesson");
  const localeCourses = allCourses.filter((c: CollectionEntry<"course">) =>
    isLocaleCourse(c.id, LOCALE),
  );
  const localeLessons = allLessons.filter((l: CollectionEntry<"lesson">) =>
    isLocaleLesson(l.id, LOCALE),
  );

  const urls: UrlEntry[] = [
    { loc: `${SITE}${prefix}/`, changefreq: "weekly", priority: 1.0 },
    { loc: `${SITE}${prefix}/blog/`, changefreq: "weekly", priority: 0.9 },
    { loc: `${SITE}${prefix}/projects/`, changefreq: "monthly", priority: 0.7 },
    { loc: `${SITE}${prefix}/about/`, changefreq: "yearly", priority: 0.5 },
    { loc: `${SITE}${prefix}/uses/`, changefreq: "monthly", priority: 0.5 },
    { loc: `${SITE}${prefix}/now/`, changefreq: "monthly", priority: 0.5 },
    { loc: `${SITE}${prefix}/tags/`, changefreq: "weekly", priority: 0.6 },
    ...tagSlugs.map((slug) => ({
      loc: `${SITE}${prefix}/tags/${slug}/`,
      changefreq: "weekly" as const,
      priority: 0.5,
    })),
    ...posts.map((p) => ({
      loc: `${SITE}${prefix}/blog/${bareSlug(p.entry.id)}/`,
      lastmod: (p.entry.data.updatedDate ?? p.entry.data.pubDate).toISOString().slice(0, 10),
      changefreq: "monthly" as const,
      priority: 0.8,
    })),
    ...localeCourses.map((c: CollectionEntry<"course">) => ({
      loc: `${SITE}${prefix}/courses/${courseSlugFromId(c.id)}/`,
      lastmod: (c.data.updatedDate ?? c.data.pubDate).toISOString().slice(0, 10),
      changefreq: "monthly" as const,
      priority: 0.9,
    })),
    ...localeLessons.map((l: CollectionEntry<"lesson">) => ({
      loc: `${SITE}${prefix}/courses/${lessonCourseSlug(l.id)}/${lessonBareSlug(l.id)}/`,
      lastmod: l.data.pubDate.toISOString().slice(0, 10),
      changefreq: "monthly" as const,
      priority: 0.7,
    })),
  ];

  return new Response(buildXml(urls), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
