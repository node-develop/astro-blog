import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkHreflang } from "./hreflang";
import {
  disposeDists,
  distFrom,
  edit,
  plainPage,
  remove,
  validFiles,
  type Files,
} from "./test-dist";

let valid: Files;
beforeAll(async () => {
  valid = await validFiles();
});
afterAll(disposeDists);

const run = async (files: Files): Promise<string> =>
  checkHreflang(await distFrom(files)).join("\n");

const ABOUT = "about/index.html";
const ABOUT_EN = "en/about/index.html";
const stripCluster = (html: string): string =>
  html.replace(/<link rel="alternate" hreflang="[^"]*" href="[^"]*">/g, "");

describe("checkHreflang", () => {
  it("accepts a build whose clusters are complete and reciprocal", async () => {
    expect(await run(valid)).toBe("");
  });

  it.each<[string, (files: Files) => Files, string]>([
    [
      "an EN page that does not link back",
      (files) => edit(files, ABOUT_EN, stripCluster),
      "no cluster is declared",
    ],
    [
      "a cluster without the page itself",
      (files) =>
        edit(files, ABOUT, (html) => html.replace(/<link rel="alternate" hreflang="ru"[^>]*>/, "")),
      'no hreflang="ru"',
    ],
    [
      "a cluster without x-default",
      (files) =>
        edit(files, ABOUT, (html) =>
          html.replace(/<link rel="alternate" hreflang="x-default"[^>]*>/, ""),
        ),
      'no hreflang="x-default"',
    ],
    [
      "x-default pointing at the English page",
      (files) =>
        edit(files, ABOUT, (html) =>
          html.replace(
            'hreflang="x-default" href="https://artka.dev/about/"',
            'hreflang="x-default" href="https://artka.dev/en/about/"',
          ),
        ),
      'hreflang="x-default" points at',
    ],
    [
      "a canonical that names another page",
      (files) =>
        edit(files, ABOUT, (html) =>
          html.replace(
            '<link rel="canonical" href="https://artka.dev/about/">',
            '<link rel="canonical" href="https://artka.dev/en/about/">',
          ),
        ),
      "canonical is https://artka.dev/en/about/",
    ],
    [
      "a cluster whose twin was never built",
      (files) => remove(files, ABOUT_EN),
      "its twin /en/about/ is not built",
    ],
    [
      "a cluster on a noindex page",
      (files) =>
        edit(files, ABOUT_EN, (html) => html.replace("max-image-preview:large", "noindex,follow")),
      "a noindex page carries an hreflang cluster",
    ],
    [
      "a twin that is built but not declared",
      (files) => edit(files, ABOUT, stripCluster),
      "is built and indexable but no cluster is declared",
    ],
    [
      "a region-scoped code",
      (files) => edit(files, ABOUT, (html) => html.replace('hreflang="en"', 'hreflang="en-US"')),
      'hreflang="en-US" is not one of',
    ],
  ])("rejects %s", async (_name, mutate, expected) => {
    expect(await run(mutate(valid))).toContain(expected);
  });

  // The tag-archive case behind the shared tag-archive list: a hidden post leaves the RU archive with one
  // listed post, so the page is noindex, while the EN archive still advertises it as its twin.
  it("rejects a tag archive that advertises a twin the layout noindexes", async () => {
    const files = {
      ...valid,
      "tags/hidden-one/index.html": plainPage({
        route: "/tags/hidden-one/",
        noindex: true,
        cluster: false,
      }),
      "en/tags/hidden-one/index.html": plainPage({ route: "/en/tags/hidden-one/" }),
    };
    expect(await run(files)).toContain("its twin /tags/hidden-one/ is noindex");
  });

  it("refuses to pass a build in which no page declares a cluster", async () => {
    const stripped = Object.fromEntries(
      Object.entries(valid).map(([name, content]) => [
        name,
        typeof content === "string" && name.endsWith(".html") ? stripCluster(content) : content,
      ]),
    );
    expect(await run(stripped)).toContain("nothing was checked");
  });
});
