import type { Element, Root } from "hast";
import mermaidFigure from "~/lib/rehype/mermaid-figure";
import { VFile } from "vfile";

const SVG = "data:image/svg+xml,%3csvg%3e";
const img = (id: string, title?: string, alt = ""): Element => ({
  type: "element",
  tagName: "img",
  properties: { id, src: `${SVG}light`, alt, width: 400, height: 200, ...(title ? { title } : {}) },
  children: [],
});
const picture = (image: Element): Element => ({
  type: "element",
  tagName: "picture",
  properties: {},
  children: [
    {
      type: "element",
      tagName: "source",
      properties: { media: "(prefers-color-scheme: dark)", srcSet: `${SVG}dark` },
      children: [],
    },
    image,
  ],
});
const run = async (children: Element[], file = new VFile()): Promise<Element[]> => {
  const tree: Root = { type: "root", children };
  await mermaidFigure()(tree, file, () => {});
  return tree.children as Element[];
};
const text = (node: Element): string =>
  node.children
    .map((child) =>
      child.type === "text" ? child.value : child.type === "element" ? text(child) : "",
    )
    .join("");
const parts = (figure: Element) => {
  const [canvas, caption] = figure.children as [Element, Element];
  return { canvas, caption, images: canvas.children as Element[] };
};

it("wraps each Mermaid diagram in a numbered figure captioned with its accTitle", async () => {
  const [first, second] = await run([
    picture(img("mermaid-0", "Путь запроса", "Описание")),
    picture(img("mermaid-1", "Граф узлов")),
  ]);
  expect(first!.tagName).toBe("figure");
  expect(text(parts(first!).caption)).toBe("Схема 1. Путь запроса");
  expect(text(parts(second!).caption)).toBe("Схема 2. Граф узлов");
});

it("replaces the OS-driven <picture> with a light and a dark image the site theme can switch", async () => {
  const [figure] = await run([picture(img("mermaid-0", "Путь запроса", "Описание"))]);
  const { canvas, images } = parts(figure!);
  expect(canvas.properties.tabIndex).toBe(0);
  // A Tab stop has to announce something: the canvas is named by its caption.
  expect(canvas.properties.role).toBe("group");
  expect(canvas.properties.ariaLabelledBy).toBe(parts(figure!).caption.properties.id);
  expect(parts(figure!).caption.properties.id).toBeTruthy();
  expect(
    images.map((image) => [image.tagName, image.properties.className, image.properties.src]),
  ).toEqual([
    ["img", ["diagram__img--light"], `${SVG}light`],
    ["img", ["diagram__img--dark"], `${SVG}dark`],
  ]);
  // The description stays the text alternative of both; the title moved to the caption.
  expect(images.map((image) => image.properties.alt)).toEqual(["Описание", "Описание"]);
  expect(images.some((image) => "title" in image.properties)).toBe(false);
  expect(images[1]!.properties.id).toBeUndefined();
});

it("captions in the language of the page", async () => {
  const file = new VFile({ path: "/repo/src/content/posts/en/post.md" });
  const [byPath] = await run([picture(img("mermaid-0", "Request path"))], file);
  expect(text(parts(byPath!).caption)).toBe("Figure 1. Request path");

  // No file path (content rendered from the API snapshot): frontmatter decides.
  const snapshot = new VFile();
  snapshot.data.astro = { frontmatter: { lang: "en" } };
  const [byFrontmatter] = await run([picture(img("mermaid-0", "Request path"))], snapshot);
  expect(text(parts(byFrontmatter!).caption)).toBe("Figure 1. Request path");
});

it("a diagram without accTitle still gets its number, and other images are left alone", async () => {
  const photo: Element = {
    type: "element",
    tagName: "img",
    properties: { src: "/uploads/photo.png", alt: "Фото" },
    children: [],
  };
  const [figure, untouched] = await run([img("mermaid-0"), photo]);
  expect(text(parts(figure!).caption)).toBe("Схема 1");
  expect(parts(figure!).images).toHaveLength(1);
  expect(untouched).toBe(photo);
});
