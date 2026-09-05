import { defineMiddleware, sequence } from "astro:middleware";
import { auth } from "~/lib/auth";
import { canonicalHostRedirect, requiresAuthContext } from "~/lib/auth/request-classification";
import { i18nRootRedirect } from "~/lib/i18n/middleware";

const canonicalHostNormalization = defineMiddleware((context, next) => {
  if (context.isPrerendered) return next();
  const redirect = canonicalHostRedirect(context.request);
  return redirect ? context.redirect(redirect.toString(), 301) : next();
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
    return context.redirect("/login?next=" + encodeURIComponent(context.url.pathname));
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
  // Inline scripts are needed for the theme bootstrap and Plausible loader.
  // Tighten to 'strict-dynamic' + nonces in a follow-up if we ever need it.
  "script-src 'self' 'unsafe-inline' https://plausible.io",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "frame-src https://giscus.app",
  "connect-src 'self' https://plausible.io https://giscus.app",
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

// `securityHeaders` goes FIRST: it awaits `next()` and decorates whatever
// comes back, so it must wrap the whole chain — otherwise the redirects and
// the 403 short-circuits returned by the guards below skip it.
export const onRequest = sequence(
  securityHeaders,
  canonicalHostNormalization,
  i18nRootRedirect,
  authContext,
  adminGuard,
);
