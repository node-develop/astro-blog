import { isGonePath } from "~/lib/seo/gone";
import gscLegacyCourseUrls from "../../fixtures/seo/gsc-legacy-course-urls.json";

// Addresses of the removed Claude Code course must answer 410, in every shape
// a crawler still asks for; nothing that is still on the site may.

it.each([
  "/courses/",
  "/courses/claude-code-guide/",
  "/courses/claude-code-guide",
  "/en/courses/claude-code-guide/04-skills/",
  "/courses/claude-code-guide/06-mcp.md",
  "/en/courses/claude-code-guide/rss.xml",
  "/courses/claude-code-guide/certificate.png",
  "/og/lesson/claude-code-guide/01-introduction-ru.png",
  "/projects/claude-code-guide/",
  "/en/projects/claude-code-guide",
  "/blog/claude/",
  "/en/blog/claude.md",
  // Lessons published before the course had its own section.
  "/blog/02-context-and-cache/",
  "/en/blog/02-context-and-cache/",
  "/03-claude-md/",
  // A relative lesson link glued onto the lesson it was on, any prefix.
  "/blog/12-travel-agent-blueprint/04-skills/",
  "/en/blog/12-travel-agent-blueprint/04-skills/",
])("%s is gone", (pathname) => {
  expect(isGonePath(pathname)).toBe(true);
});

it("covers every legacy course URL Search Console reported, and its old target", () => {
  const reported = Object.entries(gscLegacyCourseUrls).flat();
  expect(reported.filter((pathname) => !isGonePath(pathname))).toEqual([]);
});

it.each([
  "/",
  "/en/",
  "/blog/",
  "/blog/claude-md-12-rules/",
  "/blog/claude-md-12-rules.md",
  "/en/blog/local-coding-agent/",
  "/projects/",
  "/projects/astro-blog/",
  "/about/",
  "/og/project/astro-blog-ru.png",
  "/og/landing/projects-en.png",
  "/tags/claude-code/",
  "/blog/partials/2/",
  "/coursework/",
])("%s is not gone", (pathname) => {
  expect(isGonePath(pathname)).toBe(false);
});
