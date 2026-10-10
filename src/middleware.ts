import { defineMiddleware, sequence } from "astro:middleware";
import { auth } from "~/lib/auth";
import { canonicalHostRedirect, requiresAuthContext } from "~/lib/auth/request-classification";
import { CAL_ORIGIN } from "~/lib/booking/config";
import { i18nRootRedirect } from "~/lib/i18n/middleware";
import { logger } from "~/lib/logger";
import { goneResponse, isGonePath } from "~/lib/seo/gone";

const canonicalHostNormalization = defineMiddleware((context, next) => {
  if (context.isPrerendered) return next();
  const redirect = canonicalHostRedirect(context.request);
  return redirect ? context.redirect(redirect.toString(), 301) : next();
});

/**
 * Removed content (the Claude Code course, its project page, the draft post
 * that duplicated it) answers 410 Gone so search engines drop it quickly; see
 * `isGonePath`. None of those addresses has a route any more, so they reach
 * this on-demand chain; a prerendered page that ever reuses one of them wins.
 *
 * A slashless page URL never gets here: Astro's `trailingSlash: "always"`
 * answers it with a 301 to the slashed form first, which then answers 410.
 */
const removedContent = defineMiddleware((context, next) => {
  if (context.isPrerendered) return next();
  return isGonePath(context.url.pathname) ? goneResponse(context.request) : next();
});

const authContext = defineMiddleware(async (context, next) => {
  context.locals.user = null;
  context.locals.session = null;

  if (context.isPrerendered || !requiresAuthContext(context.request, context.url.pathname)) {
    return next();
  }

  const session = await auth.api.getSession({ headers: context.request.headers });
  context.locals.user = session?.user ?? null;
  context.locals.session = session?.session ?? null;
  return next();
});

const adminGuard = defineMiddleware(async (context, next) => {
  if (!context.url.pathname.startsWith("/admin")) return next();

  const user = context.locals.user;
  if (!user) {
    return context.redirect("/login/?next=" + encodeURIComponent(context.url.pathname));
  }
  if (user.role !== "admin" && user.role !== "editor") {
    return new Response("Forbidden", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  return next();
});

/**
 * Defense-in-depth response headers. None of these change behaviour for the
 * normal user; they shrink the blast radius if an XSS, clickjacking, or
 * MIME-confusion bug ever lands on the site.
 *
 * CSP runs in Report-Only mode first. After observing the browser console
 * for legitimate inline-script violations (theme bootstrap, Plausible, etc.)
 * we promote it to enforcing.
 */
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  // Inline scripts are needed for the theme bootstrap, Plausible loader and GA4 snippet.
  // Tighten to 'strict-dynamic' + nonces in a follow-up if we ever need it.
  // Cal.com: the booking embed on /contact/ loads embed.js and the booker iframe.
  `script-src 'self' 'unsafe-inline' https://plausible.io https://www.googletagmanager.com ${CAL_ORIGIN}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  `frame-src https://giscus.app ${CAL_ORIGIN}`,
  `connect-src 'self' https://plausible.io https://www.google-analytics.com https://*.google-analytics.com https://www.googletagmanager.com https://giscus.app ${CAL_ORIGIN}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = defineMiddleware(async (context, next) => {
  const response = await next();
  // Avoid mutating immutable streamed responses (rare, but safe-guard).
  try {
    response.headers.set("X-Frame-Options", "SAMEORIGIN");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
    response.headers.set("Content-Security-Policy-Report-Only", CSP_REPORT_ONLY);
  } catch {
    /* immutable response — skip */
  }
  return response;
});

/**
 * Astro answers on-demand pages (home, blog index, search, the runtime 404)
 * with a bare `Content-Type: text/html`. Without a charset a client has to
 * sniff the encoding of Cyrillic text; prerendered files already get
 * `charset=utf-8` from the static server. Only the exact bare value is
 * rewritten: a type a route chose itself (Markdown, JSON, an explicit charset)
 * is left alone.
 */
const HTML_CONTENT_TYPE = "text/html; charset=utf-8";

const htmlCharset = defineMiddleware(async (context, next) => {
  const response = await next();
  if (response.headers.get("content-type")?.trim().toLowerCase() !== "text/html") {
    return response;
  }
  try {
    response.headers.set("Content-Type", HTML_CONTENT_TYPE);
  } catch (err) {
    logger.warn({ err, path: context.url.pathname }, "html charset: immutable response headers");
  }
  return response;
});

// `securityHeaders` goes FIRST: it awaits `next()` and decorates whatever
// comes back, so it must wrap the whole chain — otherwise the redirects, the
// 410s and the 403 short-circuits returned by the guards below skip it. `htmlCharset`
// wraps everything after it for the same reason.
export const onRequest = sequence(
  securityHeaders,
  htmlCharset,
  canonicalHostNormalization,
  removedContent,
  i18nRootRedirect,
  authContext,
  adminGuard,
);
