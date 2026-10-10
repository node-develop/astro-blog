const REMOVED_POST_SLUGS = Object.freeze([
  "igaming-architecture",
  "event-sourcing-kafka",
  "scaling-node-microservices",
] as const);

/**
 * Static redirects for posts that were folded into the blog index. The removed
 * Claude Code course is NOT redirected: its addresses answer 410 Gone (see
 * `isGonePath` in ./gone.ts and src/middleware.ts).
 */
export const buildLegacyRedirects = (): Readonly<Record<string, string>> => {
  const removedPostRedirects = REMOVED_POST_SLUGS.flatMap((slug) => [
    [`/blog/${slug}/`, "/blog/"] as const,
    [`/en/blog/${slug}/`, "/en/blog/"] as const,
  ]);

  return Object.freeze(Object.fromEntries([...removedPostRedirects, ["/igaming/", "/blog/"]]));
};
