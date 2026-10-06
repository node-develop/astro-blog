import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkImages } from "./images";
import { disposeDists, distFrom, edit, validFiles, type Files } from "./test-dist";

let valid: Files;
beforeAll(async () => {
  valid = await validFiles();
});
afterAll(disposeDists);

const run = async (files: Files): Promise<string> => checkImages(await distFrom(files)).join("\n");

const POST = "blog/hello/index.html";
const IMG = '<img src="/uploads/a.webp" alt="A screenshot" width="800" height="600">';
const withImg = (files: Files, replacement: string): Files =>
  edit(files, POST, (html) => html.replace(IMG, replacement));

describe("checkImages", () => {
  it("reports that nothing was checked when the build has no .prose img", async () => {
    const files = Object.fromEntries(
      Object.entries(valid).map(([name, html]) => [
        name,
        typeof html === "string" ? html.replaceAll("prose", "article-body") : html,
      ]),
    );
    const out = await run(files);
    expect(out).toContain("nothing was checked");
  });

  // The valid build has an uploaded image in the post and measured diagrams with a fractional width.
  it("accepts prose images with alt, numeric size and a known format", async () => {
    expect(await run(valid)).toBe("");
  });

  it.each<[string, string, string]>([
    ["an image without alt", '<img src="/uploads/a.webp" width="800" height="600">', "no alt text"],
    [
      "an image with an empty alt",
      '<img src="/uploads/a.webp" alt="  " width="800" height="600">',
      "no alt text",
    ],
    [
      "an image without width",
      '<img src="/uploads/a.webp" alt="A" height="600">',
      "no numeric width and height",
    ],
    [
      "an image without height",
      '<img src="/uploads/a.webp" alt="A" width="800">',
      "no numeric width and height",
    ],
    [
      "an image with a non-numeric size",
      '<img src="/uploads/a.webp" alt="A" width="auto" height="600">',
      "no numeric width and height",
    ],
    [
      "an image in a format browsers do not all serve",
      '<img src="/uploads/a.bmp" alt="A" width="800" height="600">',
      'has format "bmp"',
    ],
    [
      "an image whose format cannot be told",
      '<img src="/uploads/a" alt="A" width="800" height="600">',
      "has format null",
    ],
  ])("rejects %s", async (_name, replacement, expected) => {
    expect(await run(withImg(valid, replacement))).toContain(expected);
  });

  it("does not hold images outside the article prose to the prose rule", async () => {
    const files = edit(valid, POST, (html) =>
      html.replace("</main>", '<img src="/icon.png" alt=""></main>'),
    );
    expect(await run(files)).toBe("");
  });
});
