import { describe, it, expect } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import remarkStripMdSuffix from "./strip-md-suffix";

const transform = (input: string): string =>
  unified()
    .use(remarkParse)
    .use(remarkStripMdSuffix)
    .use(remarkStringify)
    .processSync(input)
    .toString();

describe("remarkStripMdSuffix", () => {
  it("strips .md from a relative internal link", () => {
    expect(transform("[link](./foo.md)")).toContain("](./foo)");
  });

  it("strips .md from an absolute-path internal link", () => {
    expect(transform("[link](/blog/foo.md)")).toContain("](/blog/foo)");
  });

  it("strips .md and preserves the anchor", () => {
    expect(transform("[link](./foo.md#section)")).toContain("](./foo#section)");
  });

  it("does not touch external https links", () => {
    const out = transform("[ext](https://example.com/x.md)");
    expect(out).toContain("https://example.com/x.md");
  });

  it("does not touch non-.md links", () => {
    expect(transform("[link](./foo)")).toContain("](./foo)");
    expect(transform("[link](./foo.html)")).toContain("](./foo.html)");
  });

  it("does not touch mailto links", () => {
    const out = transform("[mail](mailto:a@b.md)");
    expect(out).toContain("mailto:a@b.md");
  });

  it("strips .md from a reference-style definition", () => {
    const input = "[link][ref]\n\n[ref]: ./bar.md\n";
    const out = transform(input);
    expect(out).toContain("./bar");
    expect(out).not.toMatch(/\.md\b/);
  });
});
