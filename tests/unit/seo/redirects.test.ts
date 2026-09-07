import { buildLegacyRedirects } from "~/lib/seo/redirects";
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
