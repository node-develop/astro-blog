/**
 * Locale-neutral post slug from a content-collection entry id.
 *
 * EN twins live under `en/` in the posts collection, so `entry.id` is
 * `en/<slug>` for them and `<slug>` for RU. Everything keyed by article
 * identity (routes, OG images, view-transition names, artwork seeds) must
 * use the bare slug so both locales agree.
 */
export const bareSlug = (id: string): string => id.replace(/^en\//, "");
