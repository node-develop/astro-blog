import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A Mermaid block ships as an illustration, not as source text or a bare
 * picture: rendered at build time, wrapped in a captioned <figure>, with a
 * text alternative. And an indexable post lets search engines show its images
 * large. Read from the build: only the build runs rehype-mermaid.
 */
const DIST = join(process.cwd(), "dist/client");

/** Every built page under `dir`, at any depth. */
const pagesUnder = (dir: string): readonly { route: string; html: string }[] =>
  readdirSync(join(DIST, dir), { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name === "index.html")
    .map((entry) => {
      const file = join(entry.parentPath, entry.name);
      return {
        route: `${file.slice(DIST.length, -"index.html".length)}`,
        html: readFileSync(file, "utf8"),
      };
    });

const postPages = (): readonly { route: string; html: string }[] =>
  ["blog", "en/blog"].flatMap(pagesUnder);

const figuresOf = (html: string): readonly string[] =>
  html.match(/<figure class="diagram">[\s\S]*?<\/figure>/g) ?? [];

describe("Mermaid diagrams in built posts", () => {
  const posts = postPages();
  const pages = posts;
  const withDiagrams = pages.filter((page) => page.html.includes('class="diagram"'));

  it("the build produced posts with diagrams to check", () => {
    expect(posts.length).toBeGreaterThan(0);
    expect(withDiagrams.length).toBeGreaterThan(0);
  });

  it("no diagram is left as unrendered Mermaid source", () => {
    expect(
      pages.filter((page) => /<pre[^>]*class="[^"]*mermaid/.test(page.html)).map((p) => p.route),
    ).toEqual([]);
  });

  it("every rendered diagram sits in a numbered figure", () => {
    for (const page of withDiagrams) {
      const images = page.html.match(/<img[^>]*id="mermaid-\d+"/g) ?? [];
      const figures = figuresOf(page.html);
      expect(figures.length, page.route).toBe(images.length);
      for (const figure of figures) {
        expect(figure, page.route).toMatch(/<figcaption[^>]*><span class="diagram__num">[^<]+ \d+/);
      }
    }
  });

  it("every diagram has a text alternative and a caption (accDescr, accTitle)", () => {
    const missing = withDiagrams.flatMap((page) =>
      figuresOf(page.html)
        .filter(
          (figure) =>
            /<img[^>]*\salt=""/.test(figure) ||
            !/<img[^>]*\salt="[^"]+"/.test(figure) ||
            !/<\/span>\s*\S[^<]*<\/figcaption>/.test(figure),
        )
        .map(() => page.route),
    );
    expect(missing).toEqual([]);
  });

  it("indexable post pages allow large image previews", () => {
    const without = posts
      .filter((page) => !/<meta name="robots" content="[^"]*noindex/.test(page.html))
      .filter(
        (page) => !/<meta name="robots" content="[^"]*max-image-preview:large/.test(page.html),
      )
      .map((page) => page.route);
    expect(without).toEqual([]);
  });
});
