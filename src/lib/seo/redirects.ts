import { canonicalPath } from "./url-policy";

const COURSE_SLUG = "claude-code-guide";

const COURSE_LESSON_SLUGS = Object.freeze([
  "01-introduction",
  "02-context-and-cache",
  "03-claude-md",
  "04-skills",
  "05-hooks",
  "06-mcp",
  "07-plugins",
  "08-tool-calls-and-loop",
  "09-subagents",
  "10-agent-teams",
  "11-models-and-pricing",
  "12-travel-agent-blueprint",
  "13-best-practices",
  "14-claims-verification",
] as const);

const REMOVED_POST_SLUGS = Object.freeze([
  "igaming-architecture",
  "event-sourcing-kafka",
  "scaling-node-microservices",
] as const);

const CONCATENATED_LESSON_REDIRECTS = Object.freeze([
  [
    "/courses/claude-code-guide/11-models-and-pricing/12-travel-agent-blueprint/",
    "/courses/claude-code-guide/12-travel-agent-blueprint/",
  ],
  ["/08-tool-calls-and-loop/09-subagents/", "/courses/claude-code-guide/09-subagents/"],
  [
    "/en/courses/claude-code-guide/12-travel-agent-blueprint/04-skills/",
    "/en/courses/claude-code-guide/04-skills/",
  ],
  [
    "/courses/claude-code-guide/01-introduction/02-context-and-cache/",
    "/courses/claude-code-guide/02-context-and-cache/",
  ],
  ["/courses/claude-code-guide/01-introduction/05-hooks/", "/courses/claude-code-guide/05-hooks/"],
  [
    "/courses/claude-code-guide/01-introduction/12-travel-agent-blueprint/",
    "/courses/claude-code-guide/12-travel-agent-blueprint/",
  ],
  [
    "/courses/claude-code-guide/02-context-and-cache/03-claude-md/",
    "/courses/claude-code-guide/03-claude-md/",
  ],
  ["/courses/claude-code-guide/06-mcp/07-plugins/", "/courses/claude-code-guide/07-plugins/"],
  [
    "/courses/claude-code-guide/08-tool-calls-and-loop/09-subagents/",
    "/courses/claude-code-guide/09-subagents/",
  ],
  [
    "/courses/claude-code-guide/09-subagents/10-agent-teams/",
    "/courses/claude-code-guide/10-agent-teams/",
  ],
  ["/en/blog/12-travel-agent-blueprint/04-skills/", "/en/courses/claude-code-guide/04-skills/"],
  [
    "/en/courses/claude-code-guide/01-introduction/09-subagents/",
    "/en/courses/claude-code-guide/09-subagents/",
  ],
  [
    "/en/courses/claude-code-guide/02-context-and-cache/03-claude-md/",
    "/en/courses/claude-code-guide/03-claude-md/",
  ],
  [
    "/en/courses/claude-code-guide/08-tool-calls-and-loop/09-subagents/",
    "/en/courses/claude-code-guide/09-subagents/",
  ],
  [
    "/en/courses/claude-code-guide/11-models-and-pricing/12-travel-agent-blueprint/",
    "/en/courses/claude-code-guide/12-travel-agent-blueprint/",
  ],
  [
    "/en/courses/claude-code-guide/12-travel-agent-blueprint/07-plugins/",
    "/en/courses/claude-code-guide/07-plugins/",
  ],
  [
    "/en/courses/claude-code-guide/12-travel-agent-blueprint/13-best-practices/",
    "/en/courses/claude-code-guide/13-best-practices/",
  ],
  [
    "/en/courses/claude-code-guide/14-claims-verification/02-context-and-cache/",
    "/en/courses/claude-code-guide/02-context-and-cache/",
  ],
] as const);

export const buildLegacyRedirects = (): Readonly<Record<string, string>> => {
  const lessonRedirects = COURSE_LESSON_SLUGS.flatMap((slug) => [
    [`/blog/${slug}/`, `/courses/${COURSE_SLUG}/${slug}/`] as const,
    [`/en/blog/${slug}/`, `/en/courses/${COURSE_SLUG}/${slug}/`] as const,
    [`/${slug}/`, `/courses/${COURSE_SLUG}/${slug}/`] as const,
  ]);
  const removedPostRedirects = REMOVED_POST_SLUGS.flatMap((slug) => [
    [`/blog/${slug}/`, "/blog/"] as const,
    [`/en/blog/${slug}/`, "/en/blog/"] as const,
  ]);

  return Object.freeze(
    Object.fromEntries([
      ...lessonRedirects,
      ...CONCATENATED_LESSON_REDIRECTS,
      ...removedPostRedirects,
      ["/igaming/", "/blog/"],
    ]),
  );
};

const LESSON_SLUGS = new Set<string>(COURSE_LESSON_SLUGS);

/**
 * Recovers a "concatenated" lesson URL: the shape Search Console keeps
 * reporting as 404.
 *
 * A relative Markdown link inside a lesson (`](09-subagents)`) resolves
 * against the CURRENT page, and with `trailingSlash: "always"` the current
 * page is itself a directory — so the crawler glued the target onto the page
 * it was already on and asked for
 * `/courses/claude-code-guide/<lesson-a>/<lesson-b>/`. The glued tail IS the
 * real destination, which is what makes the recovery deterministic.
 *
 * This is deliberately a predicate instead of ~900 entries in
 * `buildLegacyRedirects()`: the shape is combinatorial (14 x 14 lessons x
 * five observed prefixes), Search Console only ever reveals a sample of the
 * affected URLs, and a 15th lesson would multiply the table again. One rule
 * covers every pair, every prefix, and every lesson added later.
 *
 * Returns `null` for anything that is not a glued pair, so a real lesson URL
 * (`/courses/claude-code-guide/09-subagents/` — its second-to-last segment is
 * the course, never a lesson) is never touched. The destination therefore can
 * never be an input that matches again: no loops, no chains.
 */
export const resolveConcatenatedLessonPath = (pathname: string): string | null => {
  const segments = canonicalPath(pathname).split("/").filter(Boolean);
  if (segments.length < 2) return null;

  const target = segments[segments.length - 1];
  const glued = segments[segments.length - 2];
  if (!target || !glued) return null;
  if (!LESSON_SLUGS.has(target) || !LESSON_SLUGS.has(glued)) return null;

  const localePrefix = segments[0] === "en" ? "/en" : "";
  return `${localePrefix}/courses/${COURSE_SLUG}/${target}/`;
};
