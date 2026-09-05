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

const BLOG_PREFIX_RU = "/blog/";
const BLOG_PREFIX_EN = "/en/blog/";
const TAG_ARCHIVE = /^\/(?:en\/)?tags\/([^/]+)\/$/;

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

export const checkCounterpartExists = async (
  pathname: string,
  currentLocale: Locale,
): Promise<boolean> => {
  const canonical = canonicalPath(pathname);
  if (canonical === "/login/" || canonical.startsWith("/admin/") || canonical.startsWith("/api/")) {
    return false;
  }
  const tagSlug = tagArchiveSlug(canonical);
  if (tagSlug !== null) return tagArchivePairIndexable(tagSlug);
  if (currentLocale === "ru" && pathname.startsWith(BLOG_PREFIX_RU)) {
    const slug = pathname.slice(BLOG_PREFIX_RU.length).replace(/\/$/, "");
    const entries = await getCollection(
      "posts",
      (e: CollectionEntry<"posts">) => e.id === `en/${slug}`,
    );
    return entries.length > 0;
  }
  if (currentLocale === "en" && pathname.startsWith(BLOG_PREFIX_EN)) {
    const slug = pathname.slice(BLOG_PREFIX_EN.length).replace(/\/$/, "");
    const entries = await getCollection("posts", (e: CollectionEntry<"posts">) => e.id === slug);
    return entries.length > 0;
  }
  // Chrome routes (/, /about, /search, /en/, /en/about, /en/search) always have a counterpart
  return true;
};
