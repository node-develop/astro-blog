import { canonicalPath, canonicalUrl, isFileLikePath } from "~/lib/seo/url-policy";

it.each([
  ["/", "/"],
  ["/blog", "/blog/"],
  ["/blog/", "/blog/"],
  ["/en//about?draft=1#bio", "/en/about/"],
  ["/sitemap-index.xml?x=1", "/sitemap-index.xml"],
  ["/images/cover.svg", "/images/cover.svg"],
])("normalizes %s to %s", (input, expected) => {
  expect(canonicalPath(input)).toBe(expected);
});

it("uses the apex HTTPS origin and discards query/fragment identity", () => {
  expect(canonicalUrl("/en/blog/post?q=1#x", "https://preview.invalid/base/")).toBe(
    "https://preview.invalid/en/blog/post/",
  );
  expect(canonicalUrl("/about")).toBe("https://artka.dev/about/");
});

it.each(["/rss.xml", "/feed.json", "/llms-full.txt", "/og/post.png"])(
  "recognizes file endpoint %s",
  (path) => expect(isFileLikePath(path)).toBe(true),
);
