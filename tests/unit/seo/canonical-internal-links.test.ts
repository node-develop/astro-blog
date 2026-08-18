import type { Element, Root } from "hast";
import canonicalInternalLinks from "~/lib/rehype/canonical-internal-links";

const anchor = (href: string): Element => ({
  type: "element",
  tagName: "a",
  properties: { href },
  children: [{ type: "text", value: href }],
});

const transformHrefs = async (hrefs: readonly string[]): Promise<readonly unknown[]> => {
  const anchors = hrefs.map(anchor);
  const tree: Root = { type: "root", children: anchors };
  await canonicalInternalLinks()(tree, undefined);
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
  ).toEqual(["/about/", "./next/", "https://artka.dev/en/blog/post/#part", "/rss.xml", "#local"]);
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
