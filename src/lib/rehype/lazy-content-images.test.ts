import type { Element, Properties, Root } from "hast";
import { describe, expect, it } from "vitest";
import { VFile } from "vfile";
import lazyContentImages from "./lazy-content-images";

const image = (src: string, properties: Properties = {}): Element => ({
  type: "element",
  tagName: "img",
  properties: { src, ...properties },
  children: [],
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

    await lazyContentImages()(tree, new VFile(), () => {});

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
