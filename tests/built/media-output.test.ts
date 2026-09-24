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

// The one post that ships an actual cover file rather than the placeholder,
// and it comes from a third-party media origin. Both the intrinsic-size and
// the preconnect rules below are about exactly this shape of post.
const REAL_COVER_POST = {
  source: "src/content/posts/custom-domain-email-mailu-dokploy.md",
  built: "dist/client/blog/custom-domain-email-mailu-dokploy/index.html",
} as const;

describe("built post media", () => {
  // The editorial redesign replaced the /og-default.* placeholder cover with
  // a decorative slug-seeded artwork banner (aria-hidden inline SVG). This
  // fixture uses the placeholder, so it asserts the banner path; the
  // eager-with-intrinsic-dimensions contract for REAL covers is asserted on
  // the built REAL_COVER_POST below.
  it("renders the editorial artwork banner instead of the placeholder cover", () => {
    const html = readFileSync(
      join(process.cwd(), "dist/client/en/blog/claude-md-12-rules/index.html"),
      "utf8",
    );

    expect(html).toMatch(/class=["'][^"']*post__art[^"']*["']/);
    expect(html).not.toMatch(/class=["'][^"']*post__cover[^"']*["']/);
    expect(html).not.toMatch(/og-default\.(svg|png)/);
  });

  // The rule, not the numbers: a cover's intrinsic size is whatever the post's
  // frontmatter recorded for it. Hardcoded 1200×630 reserved an OG-card box for
  // an image of another shape, so the page shifted when the cover landed.
  it("sizes a real cover from the post's own frontmatter", () => {
    const source = readFileSync(join(process.cwd(), REAL_COVER_POST.source), "utf8");
    const declared = {
      width: source.match(/^socialImageWidth:\s*(\d+)\s*$/m)?.[1],
      height: source.match(/^socialImageHeight:\s*(\d+)\s*$/m)?.[1],
    };

    expect(declared.width).toBeDefined();
    expect(declared.height).toBeDefined();
    // The recorded size is the social image's. It is the cover's size only
    // while both fields name the same file, which is what this fixture proves.
    const coverFile = source.match(/^cover:\s*(\S+)\s*$/m)?.[1];
    expect(coverFile).toBeDefined();
    expect(source.match(/^socialImage:\s*(\S+)\s*$/m)?.[1]).toBe(coverFile);

    const html = readFileSync(join(process.cwd(), REAL_COVER_POST.built), "utf8");
    const cover = html.match(/<figure\b[^>]*class="post__cover"[^>]*>[\s\S]*?<img\b[^>]*>/)?.[0];

    expect(cover).toBeDefined();
    expect(attribute(cover!, "width")).toBe(declared.width);
    expect(attribute(cover!, "height")).toBe(declared.height);
    expect(attribute(cover!, "loading")).toBe("eager");
    expect(attribute(cover!, "fetchpriority")).toBe("high");
  });

  // A cover on a third-party origin is the largest element of the first
  // screen, and the browser only learns that origin exists when it reaches
  // the <img>. PostLayout hands BaseLayout the origin to preconnect to; a
  // same-origin or placeholder cover must hand it nothing.
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
