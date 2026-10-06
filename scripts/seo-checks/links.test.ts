import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkInternalLinks } from "./links";
import { disposeDists, distFrom, edit, validFiles, type Files } from "./test-dist";

let valid: Files;
beforeAll(async () => {
  valid = await validFiles();
});
afterAll(disposeDists);

const run = async (files: Files): Promise<string> =>
  checkInternalLinks(await distFrom(files)).join("\n");

const ABOUT = "about/index.html";
const withLink = (files: Files, markup: string, file = ABOUT): Files =>
  edit(files, file, (html) => html.replace("</article>", `</article>${markup}`));

describe("checkInternalLinks", () => {
  // The valid build links to a built page, to the on-demand /blog/, and to an upload on the runtime volume.
  it("accepts links to built pages, on-demand routes and the uploads volume", async () => {
    expect(await run(valid)).toBe("");
  });

  it("accepts an existing fragment, on the same page and on another", async () => {
    const files = withLink(
      edit(valid, "en/about/index.html", (html) => html.replace("<p>", '<h2 id="sec">S</h2><p>')),
      '<a href="/en/about/#sec">other</a><a href="#top">self</a><a name="top"></a>',
    );
    expect(await run(files)).toBe("");
  });

  it("accepts a relative link and an absolute link to our own origin", async () => {
    expect(
      await run(
        withLink(
          valid,
          '<a href="../blog/hello/">r</a><a href="https://artka.dev/en/about/">a</a>',
        ),
      ),
    ).toBe("");
  });

  it("leaves author links inside .prose to the author, but still checks images there", async () => {
    const prose = (inner: string): Files => withLink(valid, `<div class="prose">${inner}</div>`);
    expect(await run(prose('<a href="/blog/missing/">x</a>'))).toBe("");
    expect(await run(prose('<img src="/missing.png" alt="x">'))).toContain("not in the build");
    expect(await run(withLink(valid, '<a href="/blog/missing/">x</a>'))).toContain(
      "not in the build",
    );
  });

  it("does not follow external links or mailto", async () => {
    expect(
      await run(
        withLink(valid, '<a href="https://example.com/none/">x</a><a href="mailto:a@b.c">m</a>'),
      ),
    ).toBe("");
  });

  it.each<[string, string, string]>([
    ["a link to a page that does not exist", '<a href="/blog/missing/">x</a>', "not in the build"],
    [
      "an absolute link to our origin with no file",
      '<a href="https://artka.dev/x/">x</a>',
      "not in the build",
    ],
    ["an image that is not in the build", '<img src="/missing.png" alt="x">', "not in the build"],
    [
      "a stylesheet that is not in the build",
      '<link rel="stylesheet" href="/_astro/gone.css">',
      "not in the build",
    ],
    [
      "an srcset candidate that is not in the build",
      '<img src="/uploads/a.webp" alt="x" srcset="/gone-480.webp 480w, /uploads/a.webp 800w">',
      "not in the build",
    ],
    [
      "a fragment that the target page does not have",
      '<a href="/en/about/#missing">x</a>',
      'no element with id "missing"',
    ],
    [
      "a fragment missing on the same page",
      '<a href="#missing">x</a>',
      'no element with id "missing"',
    ],
  ])("rejects %s", async (_name, markup, expected) => {
    expect(await run(withLink(valid, markup))).toContain(expected);
  });

  it("refuses to pass a build with no internal reference at all", async () => {
    expect(
      await run({ "about/index.html": "<html><body><p>No links</p></body></html>" }),
    ).toContain("nothing was checked");
  });
});
