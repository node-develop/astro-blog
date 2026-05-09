import { ActionError } from "astro:actions";

/**
 * Shared admin guard for Astro Actions. Throws ActionError("FORBIDDEN") if the
 * caller isn't an admin or editor. Single source of truth — every mutating
 * action (`posts.upsert`, `site.update`, `media.upload`, `translate.one`,
 * `publish.one`, …) imports from here instead of duplicating the check.
 *
 * Argument shape mirrors what `context.locals.user` looks like in admin-only
 * actions: either null (unauthenticated) or a session-attached user with a
 * role string.
 */
export const assertAdmin = (user: { role?: string | null } | null | undefined): void => {
  if (!user || (user.role !== "admin" && user.role !== "editor")) {
    throw new ActionError({ code: "FORBIDDEN", message: "Admins only" });
  }
};
