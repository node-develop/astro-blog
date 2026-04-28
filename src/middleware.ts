import { defineMiddleware, sequence } from "astro:middleware";
import { auth } from "~/lib/auth";
import { i18nRootRedirect } from "~/lib/i18n/middleware";

const authContext = defineMiddleware(async (context, next) => {
  context.locals.user = null;
  context.locals.session = null;

  if (context.isPrerendered) return next();

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
    return new Response("Forbidden", { status: 403 });
  }
  return next();
});

export const onRequest = sequence(i18nRootRedirect, authContext, adminGuard);
