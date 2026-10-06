import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { Element } from "hast";
import { select, selectAll } from "hast-util-select";
import { attr, hasClass, query, queryAll, textOf, type Dist } from "./dist";
import { grouped } from "./report";

const RULE = "diagrams";
const SVG_PREFIX = "data:image/svg+xml";
const FIGURE_NUMBER = /^\S+ \d+/;
const MERMAID_ID = /^mermaid-\d+$/;

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

const decodeSvg = (src: string): string | null => {
  const body = src.slice(SVG_PREFIX.length);
  try {
    if (body.startsWith(";base64,")) return Buffer.from(body.slice(8), "base64").toString("utf8");
    if (body.startsWith(",") || body.startsWith(";utf8,")) {
      return decodeURIComponent(body.slice(body.indexOf(",") + 1));
    }
  } catch {
    return null;
  }
  return null;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

/** Text of a parsed `<title>`: plain text, or text next to attributes. */
const titleText = (value: unknown): string => {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  return String(asRecord(value)["#text"] ?? "").trim();
};

/** Problems of one decoded SVG: not XML, not an <svg>, or no accessible name. */
const svgProblem = (svg: string): string | null => {
  const validity = XMLValidator.validate(svg);
  if (validity !== true) return `the SVG is not well-formed XML (${validity.err.msg})`;
  const parsed = asRecord(xml.parse(svg));
  const roots = Object.keys(parsed).filter((key) => !key.startsWith("?"));
  if (roots.length !== 1 || roots[0] !== "svg") return "the SVG root is not <svg>";
  const root = asRecord(parsed["svg"]);
  const label = String(root["@_aria-label"] ?? "").trim();
  return titleText(root["title"]) !== "" || label !== ""
    ? null
    : "the SVG has neither a non-empty <title> nor an aria-label";
};

const captionText = (figure: Element): string => {
  const caption = select("figcaption", figure);
  if (caption === undefined || caption === null) return "";
  const withoutNumber = {
    ...caption,
    children: caption.children.filter(
      (child) => !(child.type === "element" && hasClass(child, "diagram__num")),
    ),
  };
  return textOf(withoutNumber).trim();
};

/**
 * A Mermaid block ships as a captioned illustration, never as source text or a bare picture:
 *
 *  1. nothing of Mermaid is left for the browser (`pre.mermaid`, a mermaid script, `mermaid.initialize`);
 *  2. every SVG image of the prose sits in a `figure.diagram` with a non-empty alt on the image and
 *     a `figcaption` whose text is more than the figure number;
 *  3. the decoded SVG is well-formed XML with an `<svg>` root and a non-empty `<title>` or `aria-label`;
 *  4. a page has as many figures as rendered diagrams (`img#mermaid-N`), numbered "<word> <n>".
 *
 * Guard: the build has at least one `figure.diagram` (the lessons contain diagrams).
 */
export const checkDiagrams = (dist: Dist): readonly string[] => {
  const findings: Array<readonly [string, string]> = [];
  let figures = 0;

  for (const page of dist.pages) {
    if (query(page, "pre.mermaid") !== undefined) {
      findings.push(["a Mermaid block was left as <pre class=mermaid> source", page.route]);
    }
    if (query(page, 'script[src*="mermaid"]') !== undefined) {
      findings.push(["the page loads a mermaid script", page.route]);
    }
    if (
      queryAll(page, "script:not([src])").some((script) =>
        textOf(script).includes("mermaid.initialize"),
      )
    ) {
      findings.push(["the page initialises Mermaid at runtime", page.route]);
    }

    const pageFigures = queryAll(page, "figure.diagram");
    figures += pageFigures.length;
    const rendered = queryAll(page, "img").filter((img) => MERMAID_ID.test(attr(img, "id") ?? ""));
    if (pageFigures.length !== rendered.length) {
      findings.push([
        `${pageFigures.length} figure.diagram but ${rendered.length} rendered diagrams (img#mermaid-N)`,
        page.route,
      ]);
    }

    for (const figure of pageFigures) {
      const number = select(".diagram__num", figure);
      const label = number === undefined || number === null ? "" : textOf(number).trim();
      if (!FIGURE_NUMBER.test(label)) {
        findings.push([
          `the figure number ${JSON.stringify(label)} is not "<word> <n>"`,
          page.route,
        ]);
      }
      if (captionText(figure) === "") {
        findings.push(["a diagram figure has no caption text besides its number", page.route]);
      }
    }

    for (const img of selectAll('.prose img[src^="data:image/svg+xml"]', page.tree)) {
      const inFigure = pageFigures.some((figure) => selectAll("img", figure).includes(img));
      if (!inFigure) findings.push(["an SVG image is not inside a figure.diagram", page.route]);
      if ((attr(img, "alt") ?? "").trim() === "") {
        findings.push(["a diagram image has no alt text", page.route]);
      }
      const svg = decodeSvg(attr(img, "src") ?? "");
      const problem = svg === null ? "the SVG data URL cannot be decoded" : svgProblem(svg);
      if (problem !== null) findings.push([problem, page.route]);
    }
  }

  const guard =
    figures === 0 ? [`${RULE}: the build has no figure.diagram: nothing was checked`] : [];
  return [...guard, ...grouped(RULE, findings)];
};
