import type { Element, ElementContent, Root } from "hast";
import type { Transformer } from "unified";
import { SKIP, visit } from "unist-util-visit";

/**
 * Turns the output of rehype-mermaid (strategy `img-svg`) into an illustration:
 *
 *   <figure class="diagram">
 *     <div class="diagram__canvas" tabindex="0" role="group" aria-labelledby="…">
 *       <img class="diagram__img--light" …> <img class="diagram__img--dark" …>
 *     </div>
 *     <figcaption><span class="diagram__num">Схема 1.</span> accTitle</figcaption>
 *   </figure>
 *
 * Must run right after rehypeMermaid. The Markdown replacement for
 * src/components/mdx/Diagram.astro, which only works in MDX.
 *
 * Why not keep rehype-mermaid's <picture>: its dark <source> follows
 * `prefers-color-scheme`, while the site theme follows `:root[data-theme]`
 * (the toggle). When the two disagree the diagram is drawn for the wrong
 * background. Two <img>, switched in prose.css by the same attribute as
 * everything else, cannot disagree. Both data-URIs were already in the page.
 *
 * The caption is the diagram's `accTitle` (rehype-mermaid puts it in the img
 * `title`; `accDescr` becomes `alt`). The canvas scrolls on narrow screens, so
 * it is focusable for the same WCAG 2.1.1 reason as ./focusable-tables.ts, and
 * named by its caption so the Tab stop announces something.
 */
const LABEL = { ru: "Схема", en: "Figure" } as const;

const isMermaidImg = (node: ElementContent): node is Element =>
  node.type === "element" &&
  node.tagName === "img" &&
  typeof node.properties.src === "string" &&
  node.properties.src.startsWith("data:image/svg+xml") &&
  String(node.properties.id ?? "").startsWith("mermaid");

const localeOf = (file: { data: Record<string, unknown>; path?: string }): keyof typeof LABEL => {
  const astro = file.data.astro as { frontmatter?: Record<string, unknown> } | undefined;
  const declared = astro?.frontmatter?.lang ?? astro?.frontmatter?.locale;
  if (declared === "en" || declared === "ru") return declared;
  return file.path?.split(/[\\/]/).includes("en") ? "en" : "ru";
};

const withClass = (img: Element, className: string): Element => ({
  ...img,
  properties: { ...img.properties, className: [className] },
});

const mermaidFigure = (): Transformer<Root> => (tree, file) => {
  const label = LABEL[localeOf(file)];
  let count = 0;

  visit(tree, "element", (node, index, parent) => {
    if (!parent || index === undefined) return;
    const picture = node.tagName === "picture" ? node : null;
    const light = picture ? picture.children.find(isMermaidImg) : isMermaidImg(node) ? node : null;
    if (!light) return;

    const source = picture?.children.find(
      (child): child is Element => child.type === "element" && child.tagName === "source",
    );
    const darkSrc = source?.properties.srcSet ?? source?.properties.srcset;
    const { title, ...lightProps } = light.properties;
    const caption = typeof title === "string" ? title.trim() : "";
    const base: Element = { ...light, properties: lightProps };
    const images: Element[] =
      typeof darkSrc === "string"
        ? [
            withClass(base, "diagram__img--light"),
            withClass(
              { ...base, properties: { ...lightProps, id: undefined, src: darkSrc } },
              "diagram__img--dark",
            ),
          ]
        : [base];

    count += 1;
    // The canvas is a Tab stop (it scrolls), so it needs a role and a name.
    const captionId = `diagram-${count}-caption`;
    const figure: Element = {
      type: "element",
      tagName: "figure",
      properties: { className: ["diagram"] },
      children: [
        {
          type: "element",
          tagName: "div",
          properties: {
            className: ["diagram__canvas"],
            tabIndex: 0,
            role: "group",
            ariaLabelledBy: captionId,
          },
          children: images,
        },
        {
          type: "element",
          tagName: "figcaption",
          properties: { id: captionId },
          children: [
            {
              type: "element",
              tagName: "span",
              properties: { className: ["diagram__num"] },
              children: [{ type: "text", value: `${label} ${count}${caption ? "." : ""}` }],
            },
            ...(caption ? [{ type: "text" as const, value: ` ${caption}` }] : []),
          ],
        },
      ],
    };
    parent.children[index] = figure;
    return SKIP;
  });
};

export default mermaidFigure;
