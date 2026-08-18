import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Element, Properties, Root } from "hast";
import { describe, expect, it } from "vitest";
import lazyContentImages from "~/lib/rehype/lazy-content-images";

const attribute = (tag: string, name: string): string | undefined =>
  tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`, "i"))?.[1];

const image = (src: string, properties: Properties = {}): Element => ({
  type: "element",
  tagName: "img",
  properties: { src, ...properties },
  children: [],
});

describe("built post media", () => {
  it("renders the post cover eagerly with truthful intrinsic dimensions", () => {
    const html = readFileSync(
      join(process.cwd(), "dist/client/en/blog/claude-md-12-rules/index.html"),
      "utf8",
    );
    const cover = html.match(
      /<figure\b[^>]*class=["'][^"']*post__cover[^"']*["'][^>]*>[\s\S]*?(<img\b[^>]*>)/i,
    )?.[1];

    expect(cover).toBeDefined();
    expect(attribute(cover!, "loading")).toBe("eager");
    expect(attribute(cover!, "width")).toBe("1200");
    expect(attribute(cover!, "height")).toBe("630");
    expect(attribute(cover!, "fetchpriority")).toBe("high");
  });

  it("lazily decodes Mermaid images produced during the Markdown build", () => {
    const html = readFileSync(
      join(process.cwd(), "dist/client/en/blog/claude-md-12-rules/index.html"),
      "utf8",
    );
    const mermaid = html.match(/<img\b(?=[^>]*\bsrc=["']data:image\/svg\+xml,)[^>]*>/i)?.[0];

    expect(mermaid).toBeDefined();
    expect(attribute(mermaid!, "loading")).toBe("lazy");
    expect(attribute(mermaid!, "decoding")).toBe("async");
  });
});

describe("lazyContentImages", () => {
  it("adds lazy/async behavior only to content images without an eager policy", async () => {
    const ordinary = image("/uploads/content.png");
    const mermaid = image("data:image/svg+xml,%3Csvg%3E%3C/svg%3E", { width: 640 });
    const dataEager = image("/uploads/data-eager.png", { dataEager: "" });
    const highPriority = image("/uploads/high-priority.png", { fetchPriority: "high" });
    const explicitLoading = image("/uploads/explicit-loading.png", { loading: "eager" });
    const tree: Root = {
      type: "root",
      children: [ordinary, mermaid, dataEager, highPriority, explicitLoading],
    };

    await lazyContentImages()(tree, undefined);

    expect(ordinary.properties).toMatchObject({ loading: "lazy", decoding: "async" });
    expect(mermaid.properties).toMatchObject({
      loading: "lazy",
      decoding: "async",
      width: 640,
    });
    expect(dataEager.properties).toEqual({ src: "/uploads/data-eager.png", dataEager: "" });
    expect(highPriority.properties).toEqual({
      src: "/uploads/high-priority.png",
      fetchPriority: "high",
    });
    expect(explicitLoading.properties).toEqual({
      src: "/uploads/explicit-loading.png",
      loading: "eager",
    });
  });
});
