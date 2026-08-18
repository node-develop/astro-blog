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
  // The editorial redesign replaced the /og-default.* placeholder cover with
  // a decorative slug-seeded artwork banner (aria-hidden inline SVG). Every
  // current post uses the placeholder, so the built fixture asserts the
  // banner path; the eager-with-intrinsic-dimensions contract for REAL
  // covers is pinned against the PostLayout source below.
  it("renders the editorial artwork banner instead of the placeholder cover", () => {
    const html = readFileSync(
      join(process.cwd(), "dist/client/en/blog/claude-md-12-rules/index.html"),
      "utf8",
    );

    expect(html).toMatch(/class=["'][^"']*post__art[^"']*["']/);
    expect(html).not.toMatch(/class=["'][^"']*post__cover[^"']*["']/);
    expect(html).not.toMatch(/og-default\.(svg|png)/);
  });

  it("keeps the real-cover branch eager with truthful intrinsic dimensions", () => {
    const layout = readFileSync(join(process.cwd(), "src/layouts/PostLayout.astro"), "utf8");
    const cover = layout.match(/class="post__cover">\s*<img\b([\s\S]*?)\/>/)?.[1];

    expect(cover).toBeDefined();
    expect(cover).toMatch(/loading="eager"/);
    expect(cover).toMatch(/width="1200"/);
    expect(cover).toMatch(/height="630"/);
    expect(cover).toMatch(/fetchpriority="high"/);
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
