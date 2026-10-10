import { buildLegacyRedirects } from "~/lib/seo/redirects";
import { canonicalPath } from "~/lib/seo/url-policy";

it("defines one Astro route per normalized legacy source", () => {
  const redirects = buildLegacyRedirects();
  const normalized = Object.keys(redirects).map(canonicalPath);
  expect(new Set(normalized).size).toBe(normalized.length);
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

it("never produces a destination that is itself redirected again", () => {
  const redirects = buildLegacyRedirects();
  const sources = new Set(Object.keys(redirects).map(canonicalPath));
  const chains = Object.entries(redirects)
    .filter(([from, to]) => canonicalPath(from) === canonicalPath(to) || sources.has(to))
    .map(([from, to]) => `${from} -> ${to}`);
  expect(chains).toEqual([]);
});
