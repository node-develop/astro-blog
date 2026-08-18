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
] as const);

export const buildLegacyRedirects = (): Readonly<Record<string, string>> => {
  const lessonRedirects = COURSE_LESSON_SLUGS.flatMap((slug) => [
    [`/blog/${slug}/`, `/courses/claude-code-guide/${slug}/`] as const,
    [`/en/blog/${slug}/`, `/en/courses/claude-code-guide/${slug}/`] as const,
    [`/${slug}/`, `/courses/claude-code-guide/${slug}/`] as const,
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
