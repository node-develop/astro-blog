import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkSitemaps } from "./sitemap";
import { disposeDists, distFrom, edit, remove, validFiles, type Files } from "./test-dist";

let valid: Files;
beforeAll(async () => {
  valid = await validFiles();
});
afterAll(disposeDists);

const run = async (files: Files): Promise<string> =>
  checkSitemaps(await distFrom(files)).join("\n");

const RU = "sitemap-ru.xml";
const withUrl = (files: Files, entry: string): Files =>
  edit(files, RU, (xml) => xml.replace("</urlset>", `${entry}\n</urlset>`));

describe("checkSitemaps", () => {
  it("accepts well-formed sitemaps that agree with the pages", async () => {
    expect(await run(valid)).toBe("");
  });

  it.each<[string, (files: Files) => Files, string]>([
    [
      "an unclosed <url>",
      (files) => edit(files, RU, (xml) => xml.replace("</url>", "")),
      "not well-formed XML",
    ],
    [
      "an unescaped ampersand",
      (files) =>
        edit(files, RU, (xml) =>
          xml.replace("https://artka.dev/about/</loc>", "https://artka.dev/about/?a=1&b=2</loc>"),
        ),
      "not well-formed XML",
    ],
    [
      "an entity XML does not predefine",
      (files) => edit(files, RU, (xml) => xml.replace("<url>", "<url><priority>&nbsp;</priority>")),
      "does not predefine",
    ],
    [
      "a second root element",
      (files) => edit(files, RU, (xml) => `${xml}\n<extra/>`),
      "root must be a single <urlset>",
    ],
    [
      "a <loc> with no file in the build",
      (files) => remove(files, "about/index.html"),
      "has no file in the build",
    ],
    [
      "a search route in the sitemap",
      (files) => withUrl(files, "<url><loc>https://artka.dev/search/</loc></url>"),
      "must not be indexed",
    ],
    [
      "an admin route in the sitemap",
      (files) => withUrl(files, "<url><loc>https://artka.dev/admin/posts/</loc></url>"),
      "must not be indexed",
    ],
    [
      "an API route in the sitemap",
      (files) => withUrl(files, "<url><loc>https://artka.dev/api/auth/session/</loc></url>"),
      "must not be indexed",
    ],
    [
      "a <loc> that is not in canonical form",
      (files) =>
        edit(files, RU, (xml) =>
          xml.replace("https://artka.dev/about/</loc>", "http://artka.dev/about/</loc>"),
        ),
      "not in canonical form",
    ],
    [
      "a <loc> listed twice",
      (files) => withUrl(files, "<url><loc>https://artka.dev/blog/</loc></url>"),
      "listed twice",
    ],
    [
      "a noindex page in the sitemap",
      (files) =>
        edit(files, "about/index.html", (html) =>
          html.replace("max-image-preview:large", "noindex,follow"),
        ),
      "is a noindex page",
    ],
    [
      "a lastmod that is not the post's dateModified",
      (files) =>
        edit(files, RU, (xml) =>
          xml.replace("<lastmod>2026-02-03</lastmod>", "<lastmod>2026-01-01</lastmod>"),
        ),
      "differs from dateModified",
    ],
    [
      "a post without lastmod",
      (files) => edit(files, RU, (xml) => xml.replace("<lastmod>2026-02-03</lastmod>", "")),
      "a post has no lastmod",
    ],
    [
      "a lastmod that is not a date",
      (files) =>
        edit(files, RU, (xml) =>
          xml.replace("<lastmod>2026-02-03</lastmod>", "<lastmod>yesterday</lastmod>"),
        ),
      "is not YYYY-MM-DD",
    ],
    [
      "a cluster that differs from the page <head>",
      (files) =>
        edit(files, RU, (xml) =>
          xml.replace(
            'hreflang="en" href="https://artka.dev/en/about/"',
            'hreflang="en" href="https://artka.dev/en/blog/"',
          ),
        ),
      "differs from the one in the page <head>",
    ],
    [
      "an index that lists a foreign sitemap",
      (files) =>
        edit(files, "sitemap-index.xml", (xml) => xml.replace("sitemap-en.xml", "sitemap-fr.xml")),
      "does not list https://artka.dev/sitemap-en.xml",
    ],
    [
      "a missing sitemap file",
      (files) => remove(files, "sitemap-en.xml"),
      "missing from the build",
    ],
    [
      "a sitemap with no <loc>",
      (files) => edit(files, RU, (xml) => xml.replace(/<url>[\s\S]*<\/url>/, "")),
      "nothing was checked",
    ],
  ])("rejects %s", async (_name, mutate, expected) => {
    expect(await run(mutate(valid))).toContain(expected);
  });
});
