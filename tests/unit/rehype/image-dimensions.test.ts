import type { Element, Root } from "hast";
import { describe, expect, it } from "vitest";
import { VFile } from "vfile";
import imageDimensions from "~/lib/rehype/image-dimensions";

const img = (src: string, properties: Element["properties"] = {}): Element => ({
  type: "element",
  tagName: "img",
  properties: { src, alt: "x", ...properties },
  children: [],
});

const fileWith = (imageSizes: unknown): VFile => {
  const file = new VFile();
  file.data["astro"] = { frontmatter: { imageSizes } };
  return file;
};

const run = async (children: Element[], file: VFile): Promise<void> => {
  const tree: Root = { type: "root", children };
  await imageDimensions()(tree, file, () => {});
};

describe("imageDimensions", () => {
  it("sets width and height on the image whose src is in imageSizes", async () => {
    const known = img("/uploads/a.webp");
    await run([known], fileWith({ "/uploads/a.webp": [1600, 900] }));
    expect(known.properties).toMatchObject({ width: 1600, height: 900 });
  });

  it("leaves an image without an entry, and one that already has a size, alone", async () => {
    const unknown = img("/uploads/b.webp");
    const sized = img("/uploads/a.webp", { width: 10, height: 20 });
    await run([unknown, sized], fileWith({ "/uploads/a.webp": [1600, 900] }));
    expect(unknown.properties).not.toHaveProperty("width");
    expect(sized.properties).toMatchObject({ width: 10, height: 20 });
  });

  it("ignores a malformed entry and a file without imageSizes", async () => {
    const a = img("/uploads/a.webp");
    const b = img("/uploads/b.webp");
    await run([a], fileWith({ "/uploads/a.webp": [0, "x"] }));
    await run([b], new VFile());
    expect(a.properties).not.toHaveProperty("width");
    expect(b.properties).not.toHaveProperty("width");
  });
});
