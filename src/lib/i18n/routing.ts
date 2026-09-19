import { getCollection } from "astro:content";
import type { CollectionEntry } from "astro:content";
import type { Locale } from "~/i18n";
import { canonicalPath } from "~/lib/seo/url-policy";
import { isTagArchiveIndexable } from "~/lib/seo/indexability";

const isEnPrefix = (pathname: string): boolean => pathname === "/en" || pathname.startsWith("/en/");

export const getLocaleFromPath = (pathname: string): Locale => (isEnPrefix(pathname) ? "en" : "ru");

export const stripLocalePrefix = (pathname: string): string => {
  if (pathname === "/en" || pathname === "/en/") return "/";
  if (pathname.startsWith("/en/")) return pathname.slice(3);
  return pathname;
};

export const getCounterpart = (pathname: string, currentLocale: Locale): string => {
  if (currentLocale === "ru") {
    if (pathname === "/") return "/en/";
    return canonicalPath(`/en${pathname}`);
  }
  return canonicalPath(stripLocalePrefix(pathname));
};

const otherLocale = (locale: Locale): Locale => (locale === "ru" ? "en" : "ru");

const TAG_ARCHIVE = /^\/(?:en\/)?tags\/([^/]+)\/$/;
const POST_PAGE = /^\/(?:en\/)?blog\/(.+)\/$/;
const PROJECT_PAGE = /^\/(?:en\/)?projects\/([^/]+)\/$/;
const COURSE_PAGE = /^\/(?:en\/)?courses\/([^/]+)\/$/;
const LESSON_PAGE = /^\/(?:en\/)?courses\/([^/]+)\/([^/]+)\/$/;

/**
 * Entity pages rendered from one `site` entry per locale (`<slug>` for RU,
 * `en/<slug>` for EN); the page answers 404 when its entry is missing.
 */
export const SITE_ENTRY_PAGES = ["about", "now", "uses", "contact", "privacy"] as const;
const SITE_ENTRY_PAGE = new RegExp(`^/(?:en/)?(${SITE_ENTRY_PAGES.join("|")})/$`);

/**
 * The only paths (RU form; the EN form is the same under `/en`) that get an
 * unconditional "the other language exists". Each is a static `.astro` file
 * with a twin file under `src/pages/en/`, and neither side depends on a content
 * entry that can be missing in one language: the home page, the blog index,
 * search, the tag index and the project index. The pairing of the files is held
 * by tests/unit/i18n/counterpart-honesty.test.ts, which also fails when a new
 * paired static page is left out of this list. Every other path has to prove
 * its twin from the content collections below, or gets `false`.
 */
export const PAIRED_STATIC_ROUTES = ["/", "/blog/", "/search/", "/tags/", "/projects/"] as const;
const isPairedStaticRoute = (ruPath: string): boolean =>
  (PAIRED_STATIC_ROUTES as readonly string[]).includes(ruPath);

/** Tag slug when `pathname` is a tag archive (`/tags/<slug>/`, `/en/tags/<slug>/`). */
export const tagArchiveSlug = (pathname: string): string | null =>
  canonicalPath(pathname).match(TAG_ARCHIVE)?.[1] ?? null;

// A tag archive below MIN_INDEXABLE_TAG_POSTS is noindexed, and a noindexed
// page must not be advertised as an hreflang alternate (Google treats the
// cluster as broken). Both locale archives have to be indexable for the pair
// to be emitted. Counts non-draft posts per locale straight from the
// collection; hidden-from-list posts (DB flag) are ignored here, which can
// only over-count — never advertise a page that is indexable as missing.
const tagArchivePairIndexable = async (slug: string): Promise<boolean> => {
  const tagged = await getCollection(
    "posts",
    (e: CollectionEntry<"posts">) => !e.data.draft && e.data.tags.includes(slug),
  );
  const ru = tagged.filter((e: CollectionEntry<"posts">) => !e.id.startsWith("en/"));
  const en = tagged.filter((e: CollectionEntry<"posts">) => e.id.startsWith("en/"));
  return isTagArchiveIndexable(ru) && isTagArchiveIndexable(en);
};

// The helpers below answer "does the page route of `locale` build this page?"
// and mirror the getStaticPaths of the matching route one to one, so a twin the
// route would skip (a draft post, a lesson whose frontmatter says the other
// `locale`, a lesson whose course has no landing in that language) counts as
// absent. They use a filtered getCollection rather than getEntry on purpose:
// getEntry logs a warning on every miss, and a miss is a normal answer here.
// The cost stays off the request path: every real page that reaches one of
// these lookups is prerendered, and the server-rendered routes (`/`, `/blog/`,
// `/search/`) return before any lookup. Only the runtime 404 can get here, for
// an address shaped like a post, project or lesson (as it already did for
// `/blog/<x>/`), and it scans a collection of a few dozen in-memory entries.

/** `src/pages/blog/[...slug].astro` and its EN twin: non-draft, `en/` prefix for EN. */
const isPostBuilt = async (slug: string, locale: Locale): Promise<boolean> => {
  const id = locale === "en" ? `en/${slug}` : slug;
  const entries = await getCollection(
    "posts",
    (e: CollectionEntry<"posts">) => e.id === id && !e.data.draft,
  );
  return entries.length > 0;
};

/** `src/pages/projects/[slug].astro` and its EN twin: `en/<slug>` for EN. */
const isProjectBuilt = async (slug: string, locale: Locale): Promise<boolean> => {
  const id = locale === "en" ? `en/${slug}` : slug;
  const entries = await getCollection("projects", (e: CollectionEntry<"projects">) => e.id === id);
  return entries.length > 0;
};

/** `about.astro`, `now.astro`, … and their EN twins: `getEntry("site", id)` or 404. */
const isSitePageBuilt = async (slug: string, locale: Locale): Promise<boolean> => {
  const id = locale === "en" ? `en/${slug}` : slug;
  const entries = await getCollection("site", (e: CollectionEntry<"site">) => e.id === id);
  return entries.length > 0;
};

// Course and lesson routes pick their language by `data.locale`, not by the
// folder: RU routes take `locale !== "en"`, EN routes take `locale === "en"`.
// An EN file without `locale: en` is therefore NOT an English page.
const isOfLocale = (entryLocale: Locale, locale: Locale): boolean =>
  locale === "en" ? entryLocale === "en" : entryLocale !== "en";

/** `src/pages/courses/[course]/index.astro`: `<course>/_index`, EN at `<course>/en/_index`. */
const isCourseBuilt = async (course: string, locale: Locale): Promise<boolean> => {
  const id = locale === "en" ? `${course}/en/_index` : `${course}/_index`;
  const entries = await getCollection(
    "course",
    (e: CollectionEntry<"course">) => e.id === id && isOfLocale(e.data.locale, locale),
  );
  return entries.length > 0;
};

/**
 * `src/pages/courses/[course]/[lesson].astro`: lessons are only built under a
 * course landing of the same language, EN lessons live at `<course>/en/<lesson>`.
 */
const isLessonBuilt = async (course: string, lesson: string, locale: Locale): Promise<boolean> => {
  const id = locale === "en" ? `${course}/en/${lesson}` : `${course}/${lesson}`;
  const [courseBuilt, entries] = await Promise.all([
    isCourseBuilt(course, locale),
    getCollection(
      "lesson",
      (e: CollectionEntry<"lesson">) => e.id === id && isOfLocale(e.data.locale, locale),
    ),
  ]);
  return courseBuilt && entries.length > 0;
};

/**
 * Whether the page at `pathname` has a twin in the other language that the site
 * really builds. Feeds the hreflang cluster (BaseLayout) and the language
 * toggle, so a wrong `true` advertises a URL that answers 404.
 *
 * - posts, projects, course landings, lessons, site entity pages: answered from
 *   the content collections, with the same filters the page routes apply;
 * - tag archives: both archives have to be indexable;
 * - PAIRED_STATIC_ROUTES: unconditional `true` (see the list for why);
 * - anything else (utility routes, unknown paths, a 404): `false`.
 */
export const checkCounterpartExists = async (
  pathname: string,
  currentLocale: Locale,
): Promise<boolean> => {
  const canonical = canonicalPath(pathname);
  const ruPath = canonicalPath(stripLocalePrefix(canonical));
  if (isPairedStaticRoute(ruPath)) return true;

  const target = otherLocale(currentLocale);

  const tagSlug = tagArchiveSlug(canonical);
  if (tagSlug !== null) return tagArchivePairIndexable(tagSlug);

  const sitePage = canonical.match(SITE_ENTRY_PAGE)?.[1];
  if (sitePage !== undefined) return isSitePageBuilt(sitePage, target);

  const postSlug = canonical.match(POST_PAGE)?.[1];
  if (postSlug !== undefined) return isPostBuilt(postSlug, target);

  const projectSlug = canonical.match(PROJECT_PAGE)?.[1];
  if (projectSlug !== undefined) return isProjectBuilt(projectSlug, target);

  const courseSlug = canonical.match(COURSE_PAGE)?.[1];
  if (courseSlug !== undefined) return isCourseBuilt(courseSlug, target);

  const lesson = canonical.match(LESSON_PAGE);
  if (lesson?.[1] !== undefined && lesson[2] !== undefined) {
    return isLessonBuilt(lesson[1], lesson[2], target);
  }

  return false;
};
