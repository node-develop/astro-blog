import { canonicalPath } from "./url-policy";

/**
 * Addresses of content removed on purpose: the Claude Code course (landing,
 * lessons, their Markdown twins, RSS, certificate and OG cards), its project
 * page and the draft post that duplicated it. They answer 410 Gone, not 404
 * and not a redirect: 410 tells a search engine the removal is deliberate, so
 * the URLs leave the index faster, and no surviving page is a fair substitute
 * for a lesson.
 *
 * Pure, so the rule is unit-tested without a server; src/middleware.ts turns a
 * match into `goneResponse`.
 */

/** The lesson slugs the course had; old links still carry them. */
const REMOVED_LESSON_SLUGS: ReadonlySet<string> = new Set([
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
]);

/** Whole sections that no longer exist, in both languages. */
const REMOVED_PREFIXES = ["/courses/", "/en/courses/", "/og/lesson/"] as const;

/** Single removed pages, canonical form (a `.md` twin is folded onto its page first). */
const REMOVED_PAGES: ReadonlySet<string> = new Set([
  "/projects/claude-code-guide/",
  "/en/projects/claude-code-guide/",
  "/og/project/claude-code-guide-ru.png",
  "/og/project/claude-code-guide-en.png",
  "/og/landing/course-ccg-ru.png",
  "/og/landing/course-ccg-en.png",
  "/blog/claude/",
  "/en/blog/claude/",
]);

/**
 * Where lessons lived before the course had its own section (`/<lesson>/`,
 * `/blog/<lesson>/`, `/en/blog/<lesson>/`); these used to be static redirects.
 */
const LEGACY_LESSON_PARENTS: ReadonlySet<string> = new Set(["", "en", "blog", "en/blog"]);

const MARKDOWN_TWIN = /\.md$/;

/** `/x.md` and `/x/` are the same removed document; everything else is canonicalized. */
const normalize = (pathname: string): string => {
  const path = canonicalPath(pathname);
  return MARKDOWN_TWIN.test(path) ? `${path.replace(MARKDOWN_TWIN, "")}/` : path;
};

export const isGonePath = (pathname: string): boolean => {
  const path = normalize(pathname);
  if (path === "/courses/" || path === "/en/courses/") return true;
  if (REMOVED_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  if (REMOVED_PAGES.has(path)) return true;

  const segments = path.split("/").filter(Boolean);
  const last = segments.at(-1);
  if (last === undefined || !REMOVED_LESSON_SLUGS.has(last)) return false;
  const parents = segments.slice(0, -1);
  // A relative link inside a lesson glued its target onto the lesson it was
  // on (`/<lesson-a>/<lesson-b>/`, under any prefix). Search Console still has
  // those, so a lesson slug after a lesson slug is a removed lesson as well.
  const glued = parents.at(-1);
  if (glued !== undefined && REMOVED_LESSON_SLUGS.has(glued)) return true;
  return LEGACY_LESSON_PARENTS.has(parents.join("/"));
};

const GONE_HTML = `<!doctype html>
<html lang="ru">
<head><meta charset="utf-8"><meta name="robots" content="noindex"><title>410 Gone</title></head>
<body>
<h1>410 Gone</h1>
<p>Этот материал удалён с сайта. This content has been removed.</p>
<p><a href="/blog/">Статьи</a> · <a href="/en/blog/">Articles</a></p>
</body>
</html>
`;

/**
 * The answer for a removed address: a small HTML body, `X-Robots-Tag: noindex`,
 * no `Location`. Cacheable like any other public answer, so a crawler sweep
 * over the old lessons does not reach the renderer every time.
 */
export const goneResponse = (request: Request): Response =>
  new Response(request.method === "HEAD" ? null : GONE_HTML, {
    status: 410,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex",
      "Cache-Control": "public, max-age=3600",
    },
  });
