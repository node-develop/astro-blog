import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkDiagrams } from "./diagrams";
import {
  DIAGRAM_SRC,
  DIAGRAM_SVG,
  disposeDists,
  distFrom,
  edit,
  validFiles,
  type Files,
} from "./test-dist";

let valid: Files;
beforeAll(async () => {
  valid = await validFiles();
});
afterAll(disposeDists);

const run = async (files: Files): Promise<string> =>
  checkDiagrams(await distFrom(files)).join("\n");

const LESSON = "courses/guide/01-intro/index.html";
const svgSrc = (svg: string): string => `data:image/svg+xml,${encodeURIComponent(svg)}`;
const withSvg = (files: Files, svg: string): Files =>
  edit(files, LESSON, (html) => html.replaceAll(DIAGRAM_SRC, svgSrc(svg)));

describe("checkDiagrams", () => {
  it("accepts a captioned figure with an accessible SVG, light and dark", async () => {
    expect(await run(valid)).toBe("");
  });

  it("accepts a base64 data URL as well as a percent-encoded one", async () => {
    const base64 = `data:image/svg+xml;base64,${Buffer.from(DIAGRAM_SVG).toString("base64")}`;
    expect(await run(edit(valid, LESSON, (html) => html.replaceAll(DIAGRAM_SRC, base64)))).toBe("");
  });

  it("accepts an SVG named by aria-label instead of <title>", async () => {
    const labelled = DIAGRAM_SVG.replace("<title>Data flow</title>", "").replace(
      "<svg ",
      '<svg aria-label="Data flow" ',
    );
    expect(await run(withSvg(valid, labelled))).toBe("");
  });

  it.each<[string, (files: Files) => Files, string]>([
    [
      "Mermaid source left as <pre class=mermaid>",
      (files) =>
        edit(files, LESSON, (html) =>
          html.replace("<p>Lesson.</p>", '<pre class="mermaid">graph TD</pre>'),
        ),
      "left as <pre class=mermaid>",
    ],
    [
      "a mermaid script",
      (files) =>
        edit(files, LESSON, (html) =>
          html.replace("</head>", '<script src="/js/mermaid.min.js"></script></head>'),
        ),
      "loads a mermaid script",
    ],
    [
      "runtime Mermaid initialisation",
      (files) =>
        edit(files, LESSON, (html) =>
          html.replace("</head>", "<script>mermaid.initialize({})</script></head>"),
        ),
      "initialises Mermaid at runtime",
    ],
    [
      "an SVG without title and aria-label",
      (files) => withSvg(files, DIAGRAM_SVG.replace("<title>Data flow</title>", "")),
      "neither a non-empty <title> nor an aria-label",
    ],
    [
      "an SVG with an empty title",
      (files) => withSvg(files, DIAGRAM_SVG.replace("Data flow", " ")),
      "neither a non-empty <title> nor an aria-label",
    ],
    [
      "an SVG that is not well-formed XML",
      (files) => withSvg(files, DIAGRAM_SVG.replace("</svg>", "")),
      "not well-formed XML",
    ],
    [
      "a root that is not <svg>",
      (files) => withSvg(files, "<html><title>x</title></html>"),
      "root is not <svg>",
    ],
    [
      "an SVG image outside a figure",
      (files) =>
        edit(files, LESSON, (html) =>
          html.replace('<figure class="diagram">', '<figure class="plain">'),
        ),
      "not inside a figure.diagram",
    ],
    [
      "an empty figcaption",
      (files) =>
        edit(files, LESSON, (html) =>
          html.replace("</span> Data flow</figcaption>", "</span> </figcaption>"),
        ),
      "no caption text besides its number",
    ],
    [
      "a diagram image without alt",
      (files) => edit(files, LESSON, (html) => html.replace('alt="How data flows"', 'alt=""')),
      "no alt text",
    ],
    [
      "a figure number that is not <word> <n>",
      (files) => edit(files, LESSON, (html) => html.replace("Схема 1.", "1.")),
      'is not "<word> <n>"',
    ],
    [
      "figures that do not match the rendered diagrams",
      (files) => edit(files, LESSON, (html) => html.replace('id="mermaid-0" ', "")),
      "1 figure.diagram but 0 rendered diagrams",
    ],
  ])("rejects %s", async (_name, mutate, expected) => {
    expect(await run(mutate(valid))).toContain(expected);
  });

  it("refuses to pass a build without a single figure.diagram", async () => {
    const noLessons = Object.fromEntries(
      Object.entries(valid).filter(([name]) => !name.includes("courses/")),
    );
    expect(await run(noLessons)).toContain("no figure.diagram");
  });
});
