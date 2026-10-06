import type { Locale } from "../../i18n";
import { canonicalPath } from "../seo/url-policy";

// Pure path arithmetic with relative imports only. `routing.ts` imports
// `astro:content` (content-collection lookups), which the build-output checks in
// `scripts/seo-checks/` cannot load, so everything that needs no collection lives here.

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
