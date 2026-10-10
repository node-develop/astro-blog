import type { Element, Root } from "hast";
import canonicalInternalLinks from "~/lib/rehype/canonical-internal-links";
import { VFile } from "vfile";

const anchor = (href: string): Element => ({
  type: "element",
  tagName: "a",
  properties: { href },
  children: [{ type: "text", value: href }],
});

const transformHrefs = async (hrefs: readonly string[]): Promise<readonly unknown[]> => {
  const anchors = hrefs.map(anchor);
  const tree: Root = { type: "root", children: anchors };
  await canonicalInternalLinks()(tree, new VFile(), () => {});
  return anchors.map((node) => node.properties.href);
};

it("canonicalizes document links in a real HAST tree", async () => {
  expect(
    await transformHrefs([
      "/about",
      "./next",
      "https://artka.dev/en/blog/post?x=1#part",
      "/rss.xml",
      "#local",
    ]),
  ).toEqual(["/about/", "../next/", "https://artka.dev/en/blog/post/#part", "/rss.xml", "#local"]);
});

it("leaves non-document and non-artka destinations unchanged", async () => {
  const hrefs = [
    "mailto:hello@artka.dev",
    "tel:+123456789",
    "//artka.dev/about",
    "https://example.com/about",
    "../images/cover.svg",
  ] as const;

  expect(await transformHrefs(hrefs)).toEqual(hrefs);
});

it.each([
  ["./guide//chapter?x=1#part", "../guide/chapter/#part"],
  ["../guide///chapter?x=1#part", "../guide/chapter/#part"],
])("collapses repeated slashes in relative document link %s", async (href, expected) => {
  expect(await transformHrefs([href])).toEqual([expected]);
});

it("keeps files, fragments, query-only references, roots, and parent-relative links stable", async () => {
  expect(
    await transformHrefs([
      "./images/cover.svg?size=2#preview",
      "#section",
      "?view=compact",
      "/blog/json-ld-graph-astro/",
      "../json-ld-graph-astro/",
    ]),
  ).toEqual([
    "./images/cover.svg?size=2#preview",
    "#section",
    "?view=compact",
    "/blog/json-ld-graph-astro/",
    "../json-ld-graph-astro/",
  ]);
});

// Regression: a bare relative link inside a page ("json-ld-graph-astro") used
// to pass through untouched. With `trailingSlash: "always"` the browser
// resolved it against the current page and produced
// /blog/local-coding-agent/json-ld-graph-astro — the glued 404s Search
// Console reported. Bare and "./" spellings mean the same thing to
// an author, so both must normalize to the sibling document.
it("rewrites bare relative links so they cannot glue onto the current page", async () => {
  expect(
    await transformHrefs([
      "json-ld-graph-astro",
      "json-ld-graph-astro/",
      "./json-ld-graph-astro",
      "local-coding-agent#practice",
      "guide/chapter",
    ]),
  ).toEqual([
    "../json-ld-graph-astro/",
    "../json-ld-graph-astro/",
    "../json-ld-graph-astro/",
    "../local-coding-agent/#practice",
    "../guide/chapter/",
  ]);
});

it("resolves a rewritten sibling link next to the page, not to a child of it", async () => {
  const postPage = "https://artka.dev/blog/local-coding-agent/";
  const [rewritten] = await transformHrefs(["json-ld-graph-astro"]);

  expect(new URL("json-ld-graph-astro", postPage).pathname).toBe(
    "/blog/local-coding-agent/json-ld-graph-astro",
  );
  expect(new URL(String(rewritten), postPage).pathname).toBe("/blog/json-ld-graph-astro/");
});

it("still refuses to touch hrefs that carry their own scheme", async () => {
  const hrefs = ["javascript:alert(1)", "data:text/plain,hi", "ftp://example.com/x"] as const;
  expect(await transformHrefs(hrefs)).toEqual(hrefs);
});
