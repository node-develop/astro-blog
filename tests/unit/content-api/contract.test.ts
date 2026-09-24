import { describe, expect, it } from "vitest";
import { articleDocumentSchema, createArticleSchema } from "../../../src/lib/content-api/contract";
import { inspectMarkdown, serializeArticle } from "../../../src/lib/content-api/markdown";
import { inspectImage } from "../../../src/lib/content-api/media";
import { readBytes, readJson } from "../../../src/lib/content-api/http";
import { postSchema } from "../../../src/lib/content/schemas";
import * as yaml from "~/lib/yaml";
import sharp from "sharp";
import { check, resolveConfig } from "prettier";

const document = articleDocumentSchema.parse({
  externalId: "test-source-1",
  lang: "ru",
  slug: "api-test",
  title: "API publication test",
  description: "Description of a publication through the content API.",
  summary: "This is a sufficiently detailed summary to validate the complete article contract.",
  body: "## Example\n\nText with **formatting** and $x^2$.\n",
  tags: ["ai"],
  sources: [{ url: "https://example.com/source", title: "Original source" }],
  provenance: { agent: "unit-test" },
});
describe("content API contract and rendering", () => {
  it("defaults to a private draft and rejects unknown fields and paths", () => {
    expect(createArticleSchema.parse({ article: document }).mode).toBe("draft");
    expect(() => articleDocumentSchema.parse({ ...document, slug: "../escape" })).toThrow();
    expect(() =>
      articleDocumentSchema.parse({ ...document, canonical: "https://elsewhere.test" }),
    ).toThrow();
    expect(() => articleDocumentSchema.parse({ ...document, sources: [] })).toThrow();
  });
  it.each([
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "[bad](javascript:alert%281%29)",
    "[bad](//evil.example)",
    "[bad][x]\n\n[x]: data:text/html,bad",
    "# Duplicate title",
    "---\ntitle: bad\n---\ntext",
    "![alt](https://evil.example/pixel.png)",
    "![](asset:349ad05b-41ae-4b63-93ab-d7679c82c886)",
  ])("rejects unsafe or incompatible Markdown: %s", (body) => {
    expect(() => inspectMarkdown(body)).toThrow();
  });
  it("preserves code examples, math and Markdown tables", () => {
    const result = inspectMarkdown(
      "```html\n<script>example</script>\n```\n\n$x^2$\n\n| a | b |\n| - | - |\n| 1 | 2 |\n",
    );
    expect(result.body).toContain("<script>example</script>");
    expect(result.body).toContain("$x^2$");
    expect(result.body).toContain("| 1 | 2 |");
  });
  it("produces build-compatible frontmatter and escapes source labels", async () => {
    const id = "349ad05b-41ae-4b63-93ab-d7679c82c886";
    const image = { id, url: "https://cdn.example/image.png", width: 800, height: 600 };
    const raw = await serializeArticle(
      {
        ...document,
        cover: { assetId: id, alt: "Cover" },
        seo: { title: "Search title", description: "Search description of this article" },
        sources: [{ title: "<script>alert(1)</script>", url: "https://example.com/source" }],
        body: `## Example\n\n![A diagram](asset:${id})`,
      },
      [image],
      id,
      new Date("2026-09-07T10:00:00Z"),
    );
    const fm = yaml.load(raw.split("---\n")[1]!) as Record<string, unknown>;
    const parsed = postSchema.parse(fm);
    expect(parsed.apiRevision).toBe(id);
    expect(parsed.seoTitle).toBe("Search title");
    expect(parsed.socialImageWidth).toBe(800);
    expect(raw).toContain("https://cdn.example/image.png");
    expect(raw).not.toContain("asset:");
    expect(raw).toContain("\\<script>");
  });
  it("formats generated RU and EN documents exactly as the repository CI expects", async () => {
    for (const lang of ["ru", "en"] as const) {
      const raw = await serializeArticle(
        {
          ...document,
          lang,
          description: "Long description ".repeat(10),
          faq: [{ question: "A question?", answer: "A long answer ".repeat(12) }],
          body: "## Example\n\n* first\n* second\n\n| a | b |\n| - | - |\n| 1 | 2 |\n",
        },
        [],
        "revision",
        new Date("2026-09-12T12:00:00Z"),
      );
      const config = await resolveConfig("src/content/posts/example.md");
      expect(await check(raw, { ...config, parser: "markdown" })).toBe(true);
      expect(raw).toContain("## Example");
      expect(raw).toContain(lang === "ru" ? "## Источники" : "## Sources");
    }
  });
  it("fully decodes images and rejects corruption, MIME mismatches and SVG", async () => {
    const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: "red" } })
      .png()
      .toBuffer();
    await expect(inspectImage(png, "image/png")).resolves.toMatchObject({
      width: 1,
      height: 1,
      mimeType: "image/webp",
    });
    await expect(inspectImage(png, "image/jpeg")).rejects.toThrow();
    await expect(inspectImage(png.subarray(0, 30), "image/png")).rejects.toThrow();
    await expect(inspectImage(Buffer.from("<svg></svg>"), "image/svg+xml")).rejects.toThrow();
  });
  it("limits chunked bodies and rejects bad JSON without relying on Content-Length", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(100));
        controller.close();
      },
    });
    await expect(
      readBytes(
        new Request("https://test/", {
          method: "POST",
          body: stream,
          duplex: "half",
        } as RequestInit),
        50,
      ),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      readJson(
        new Request("https://test/", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{",
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});
