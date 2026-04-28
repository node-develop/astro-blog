import { defineMiddleware } from "astro:middleware";
import { isLocale } from "~/i18n";

const COOKIE_NAME = "lang-pref";

/**
 * On root path /, redirect to /en/ if the visitor has previously chosen EN.
 * Direct article links never auto-redirect — visitors get the language they clicked on.
 */
export const i18nRootRedirect = defineMiddleware(async (context, next) => {
  if (context.url.pathname !== "/") return next();
  if (context.isPrerendered) return next();

  const pref = context.cookies.get(COOKIE_NAME)?.value;
  if (isLocale(pref) && pref === "en") {
    return context.redirect("/en/", 302);
  }
  return next();
});
