import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkSocialMeta } from "./social";
import {
  disposeDists,
  distFrom,
  edit,
  ogImagePath,
  png,
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
  (await checkSocialMeta(await distFrom(files))).join("\n");

const POST = "blog/hello/index.html";
const POST_EN = "en/blog/hello/index.html";
const CARD = ogImagePath("/blog/hello/").slice(1);
const CARD_EN = ogImagePath("/en/blog/hello/").slice(1);
const ogUrl = (path: string): string => `https://artka.dev${path}`;

describe("checkSocialMeta", () => {
  it("accepts cards that exist, are large enough and are described truthfully", async () => {
    expect(await run(valid)).toBe("");
  });

  it("rejects a card smaller than 1200x630", async () => {
    const files = { ...valid, [CARD]: await png(600, 315) };
    expect(await run(files)).toContain("is 600x315, below 1200x630");
  });

  it("rejects og:image:width/height that do not describe the file", async () => {
    const files = edit(valid, POST, (html) =>
      html.replace(
        'property="og:image:width" content="1200"',
        'property="og:image:width" content="1000"',
      ),
    );
    expect(await run(files)).toContain("og:image:width/height say 1000x630, the file is 1200x630");
  });

  it("rejects an own-site card that is not a file of the build", async () => {
    expect(await run(remove(valid, CARD))).toContain("is not a file of the build");
  });

  it("rejects the placeholder card on an indexable page", async () => {
    const files = edit(valid, POST, (html) =>
      html.replaceAll(ogUrl(`/${CARD}`), ogUrl("/og-default.png")),
    );
    expect(await run(files)).toContain("placeholder");
  });

  it("rejects an indexable page without max-image-preview:large", async () => {
    const files = edit(valid, POST, (html) => html.replace("max-image-preview:large", "index"));
    expect(await run(files)).toContain("does not allow max-image-preview:large");
  });

  it("rejects a page with two og:image tags", async () => {
    const files = edit(valid, POST, (html) =>
      html.replace(
        '<meta name="twitter:card"',
        `<meta property="og:image" content="${ogUrl(`/${CARD}`)}"><meta name="twitter:card"`,
      ),
    );
    expect(await run(files)).toContain("exactly one og:image, found 2");
  });

  it("rejects a relative og:image", async () => {
    const files = edit(valid, POST, (html) => html.replace(ogUrl(`/${CARD}`), `/${CARD}`));
    expect(await run(files)).toContain("is not an absolute URL");
  });

  it("rejects the two locales of a page sharing one card", async () => {
    const files = edit(valid, POST_EN, (html) =>
      html.replace(ogUrl(`/${CARD_EN}`), ogUrl(`/${CARD}`)),
    );
    expect(await run(files)).toContain("shares its og card");
  });

  it("does not measure a card on another origin: there is no network here", async () => {
    const files = edit(valid, POST, (html) =>
      html.replace(ogUrl(`/${CARD}`), "https://cdn.example/cover.png"),
    );
    expect(await run(files)).toBe("");
  });

  it("refuses to pass a build without a lesson page or without a post page", async () => {
    const noLessons = Object.fromEntries(
      Object.entries(valid).filter(([name]) => !name.startsWith("courses/")),
    );
    expect(await run(noLessons)).toContain("no lesson page or no post page");
    expect(await run({ "robots.txt": "" })).toContain("no lesson page or no post page");
  });
});
