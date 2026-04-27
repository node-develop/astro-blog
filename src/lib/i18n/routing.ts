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
