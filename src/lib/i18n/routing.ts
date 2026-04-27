import { getCollection } from "astro:content";
import type { CollectionEntry } from "astro:content";
import type { Locale } from "~/i18n";

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
    return `/en${pathname}`;
  }
  return stripLocalePrefix(pathname);
};

const BLOG_PREFIX_RU = "/blog/";
const BLOG_PREFIX_EN = "/en/blog/";

export const checkCounterpartExists = async (
  pathname: string,
  currentLocale: Locale,
): Promise<boolean> => {
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
