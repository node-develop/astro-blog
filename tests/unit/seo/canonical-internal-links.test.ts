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
      "/courses/claude-code-guide/02-context-and-cache/",
      "../02-context-and-cache/",
    ]),
  ).toEqual([
    "./images/cover.svg?size=2#preview",
    "#section",
    "?view=compact",
    "/courses/claude-code-guide/02-context-and-cache/",
    "../02-context-and-cache/",
  ]);
});

// Regression: a bare relative link inside a lesson ("09-subagents") used to
// pass through untouched. With `trailingSlash: "always"` the browser resolved
// it against the current lesson and produced
// /courses/claude-code-guide/08-tool-calls-and-loop/09-subagents — the glued
// 404s Search Console reported. Bare and "./" spellings mean the same thing to
// an author, so both must normalize to the sibling document.
it("rewrites bare relative links so they cannot glue onto the current page", async () => {
  expect(
    await transformHrefs([
      "09-subagents",
      "09-subagents/",
      "./09-subagents",
      "12-travel-agent-blueprint#practice",
      "guide/chapter",
    ]),
  ).toEqual([
    "../09-subagents/",
    "../09-subagents/",
    "../09-subagents/",
    "../12-travel-agent-blueprint/#practice",
    "../guide/chapter/",
  ]);
});

it("resolves a rewritten lesson link to the course root, not to a child of the lesson", async () => {
  const lessonPage = "https://artka.dev/courses/claude-code-guide/08-tool-calls-and-loop/";
  const [rewritten] = await transformHrefs(["09-subagents"]);

  expect(new URL("09-subagents", lessonPage).pathname).toBe(
    "/courses/claude-code-guide/08-tool-calls-and-loop/09-subagents",
  );
  expect(new URL(String(rewritten), lessonPage).pathname).toBe(
    "/courses/claude-code-guide/09-subagents/",
  );
});

it("still refuses to touch hrefs that carry their own scheme", async () => {
  const hrefs = ["javascript:alert(1)", "data:text/plain,hi", "ftp://example.com/x"] as const;
  expect(await transformHrefs(hrefs)).toEqual(hrefs);
});
