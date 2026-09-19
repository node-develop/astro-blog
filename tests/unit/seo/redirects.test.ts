import { readdirSync } from "node:fs";
import { join } from "node:path";
import { buildLegacyRedirects, resolveConcatenatedLessonPath } from "~/lib/seo/redirects";
import { canonicalPath } from "~/lib/seo/url-policy";
import gscLegacyCourses from "../../fixtures/seo/gsc-legacy-course-urls.json";

it("recovers every broken nested lesson URL observed in Search Console", () => {
  expect(buildLegacyRedirects()).toMatchObject(gscLegacyCourses);
  for (const destination of Object.values(gscLegacyCourses)) {
    expect(buildLegacyRedirects()).not.toHaveProperty(destination);
  }
});

it("defines one Astro route per normalized legacy source", () => {
  const redirects = buildLegacyRedirects();
  const normalized = Object.keys(redirects).map(canonicalPath);
  expect(new Set(normalized).size).toBe(normalized.length);
});

it("maps representative RU, EN, root, and concatenated lessons to final canonicals", () => {
  expect(buildLegacyRedirects()).toMatchObject({
    "/blog/02-context-and-cache/": "/courses/claude-code-guide/02-context-and-cache/",
    "/en/blog/02-context-and-cache/": "/en/courses/claude-code-guide/02-context-and-cache/",
    "/03-claude-md/": "/courses/claude-code-guide/03-claude-md/",
    "/courses/claude-code-guide/11-models-and-pricing/12-travel-agent-blueprint/":
      "/courses/claude-code-guide/12-travel-agent-blueprint/",
  });
});

it.each(["/privacy/", "/terms/", "/README/", "/en/tags/guide/"])(
  "does not invent a redirect for %s",
  (path) => expect(buildLegacyRedirects()).not.toHaveProperty(path),
);

it("uses slash canonical destinations", () => {
  expect(Object.values(buildLegacyRedirects()).every((path) => canonicalPath(path) === path)).toBe(
    true,
  );
});

const COURSE_CONTENT_DIR = join(process.cwd(), "src/content/courses/claude-code-guide");
const LESSON_DESTINATION = /^\/(en\/)?courses\/claude-code-guide\/([^/]+)\/$/;

// Same selection as the `lessons` loader in src/lib/courses/schema.ts: every
// Markdown/MDX file of the course directory except its `_index`. Filtering on
// today's `NN-` naming instead would let a differently named lesson slip past.
const lessonSlugsOnDisk = (directory: string): readonly string[] =>
  readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.mdx?$/.test(entry.name))
    .map((entry) => entry.name.replace(/\.mdx?$/, ""))
    .filter((slug) => slug !== "_index")
    .sort();

// A static redirect is emitted as a prerendered route, and the middleware rule
// steps aside for prerendered routes. A wrong static destination therefore
// wins over the correct rule and answers 301 -> 404.
it("points every lesson redirect at a lesson that exists in the content collection", () => {
  const lessonEntries = Object.entries(buildLegacyRedirects()).filter(([, to]) =>
    to.includes("/courses/claude-code-guide/"),
  );
  const lessonsOnDisk = {
    ru: new Set(lessonSlugsOnDisk(COURSE_CONTENT_DIR)),
    en: new Set(lessonSlugsOnDisk(join(COURSE_CONTENT_DIR, "en"))),
  };
  const missing: string[] = [];

  for (const [from, to] of lessonEntries) {
    const match = LESSON_DESTINATION.exec(to);
    const lessons = match?.[1] ? lessonsOnDisk.en : lessonsOnDisk.ru;
    if (!match?.[2] || !lessons.has(match[2])) missing.push(`${from} -> ${to}`);
  }

  expect(lessonEntries.length).toBeGreaterThan(0);
  expect(missing).toEqual([]);
});

it("keeps every static glued entry in agreement with the middleware rule", () => {
  const gluedEntries = Object.entries(buildLegacyRedirects()).filter(
    ([from]) => resolveConcatenatedLessonPath(from) !== null,
  );
  const diverged = gluedEntries
    .filter(([from, to]) => to !== resolveConcatenatedLessonPath(from))
    .map(([from, to]) => `${from} -> ${to}, rule says ${resolveConcatenatedLessonPath(from)}`);

  expect(gluedEntries.length).toBeGreaterThan(0);
  expect(diverged).toEqual([]);
});

// The lesson list in redirects.ts is hand-written. A lesson added to the
// content collection without being added there silently falls out of the rule.
it.each([
  ["RU", "", COURSE_CONTENT_DIR],
  ["EN", "/en", join(COURSE_CONTENT_DIR, "en")],
])("recognises every %s lesson that exists on disk", (_locale, localePrefix, directory) => {
  const slugs = lessonSlugsOnDisk(directory);
  const sources = new Set(Object.keys(buildLegacyRedirects()).map(canonicalPath));
  const unrecognised: string[] = [];
  const redirectedLessons: string[] = [];

  expect(slugs.length).toBeGreaterThan(1);
  slugs.forEach((target, index) => {
    const glued = slugs[(index + 1) % slugs.length] ?? "";
    const lessonPath = `${localePrefix}/courses/claude-code-guide/${target}/`;
    const source = `${localePrefix}/courses/claude-code-guide/${glued}/${target}/`;
    if (resolveConcatenatedLessonPath(source) !== lessonPath) {
      unrecognised.push(`${source} (is ${target} or ${glued} missing from redirects.ts?)`);
    }
    if (sources.has(lessonPath)) redirectedLessons.push(lessonPath);
  });

  expect(unrecognised).toEqual([]);
  expect(redirectedLessons).toEqual([]);
});

const LESSON_SLUGS = [
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
] as const;

// Every prefix under which Search Console has observed a lesson slug glued
// onto another lesson slug.
const GLUE_PREFIXES = [
  "",
  "/blog",
  "/en/blog",
  "/courses/claude-code-guide",
  "/en/courses/claude-code-guide",
] as const;

it("recovers the glued pair for every lesson combination, not just the sampled URLs", () => {
  const unrecovered: string[] = [];
  for (const prefix of GLUE_PREFIXES) {
    for (const glued of LESSON_SLUGS) {
      for (const target of LESSON_SLUGS) {
        const source = `${prefix}/${glued}/${target}/`;
        const expected = source.startsWith("/en/")
          ? `/en/courses/claude-code-guide/${target}/`
          : `/courses/claude-code-guide/${target}/`;
        if (resolveConcatenatedLessonPath(source) !== expected) unrecovered.push(source);
      }
    }
  }
  expect(unrecovered).toEqual([]);
});

it("recovers a glued pair that no explicit rule lists", () => {
  expect(buildLegacyRedirects()).not.toHaveProperty(
    "/courses/claude-code-guide/03-claude-md/06-mcp/",
  );
  expect(resolveConcatenatedLessonPath("/courses/claude-code-guide/03-claude-md/06-mcp/")).toBe(
    "/courses/claude-code-guide/06-mcp/",
  );
  expect(
    resolveConcatenatedLessonPath("/en/courses/claude-code-guide/05-hooks/10-agent-teams/"),
  ).toBe("/en/courses/claude-code-guide/10-agent-teams/");
});

it("normalizes a glued pair that arrives without its trailing slash", () => {
  expect(resolveConcatenatedLessonPath("/courses/claude-code-guide/03-claude-md/06-mcp")).toBe(
    "/courses/claude-code-guide/06-mcp/",
  );
});

it.each([
  ...LESSON_SLUGS.map((slug) => `/courses/claude-code-guide/${slug}/`),
  ...LESSON_SLUGS.map((slug) => `/en/courses/claude-code-guide/${slug}/`),
  "/",
  "/en/",
  "/blog/",
  "/courses/claude-code-guide/",
  "/privacy/",
  "/terms/",
  "/about/",
  "/en/tags/guide/",
])("leaves the real page %s alone", (pathname) => {
  expect(resolveConcatenatedLessonPath(pathname)).toBeNull();
});

it("never produces a destination that is itself redirected again", () => {
  const redirects = buildLegacyRedirects();
  const sources = new Set(Object.keys(redirects).map(canonicalPath));
  const chains: string[] = [];

  for (const [from, to] of Object.entries(redirects)) {
    if (canonicalPath(from) === canonicalPath(to)) chains.push(`loop: ${from}`);
    if (sources.has(canonicalPath(to))) chains.push(`static chain: ${from} -> ${to}`);
    if (resolveConcatenatedLessonPath(to)) chains.push(`static then rule: ${from} -> ${to}`);
  }

  for (const prefix of GLUE_PREFIXES) {
    for (const glued of LESSON_SLUGS) {
      for (const target of LESSON_SLUGS) {
        const source = `${prefix}/${glued}/${target}/`;
        const destination = resolveConcatenatedLessonPath(source);
        if (!destination) continue;
        if (canonicalPath(destination) === canonicalPath(source)) chains.push(`loop: ${source}`);
        if (resolveConcatenatedLessonPath(destination)) chains.push(`rule twice: ${source}`);
        if (sources.has(canonicalPath(destination))) chains.push(`rule then static: ${source}`);
      }
    }
  }

  expect(chains).toEqual([]);
});
