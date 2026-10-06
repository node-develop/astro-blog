import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  articleDocumentSchema,
  articleInputSchema,
  completeArticle,
  createArticleSchema,
  createKeySchema,
  cursorSchema,
  encodeCursor,
  postMetaOrderSchema,
  postMetaPatchSchema,
  publishBatchSchema,
} from "../../../src/lib/content-api/contract";
import { readFileSync } from "node:fs";
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
    // The body image's size travels in the header so the page can reserve its space.
    expect(parsed.imageSizes).toEqual({ "https://cdn.example/image.png": [800, 600] });
    expect(raw).toContain("https://cdn.example/image.png");
    expect(raw).not.toContain("asset:");
    expect(raw).toContain("\\<script>");
  });
  it("writes no imageSizes for a body without asset images, so existing headers stay as they were", async () => {
    const id = "349ad05b-41ae-4b63-93ab-d7679c82c886";
    const raw = await serializeArticle(
      { ...document, cover: { assetId: id, alt: "Cover" } },
      [{ id, url: "https://cdn.example/image.png", width: 800, height: 600 }],
      "349ad05b-41ae-4b63-93ab-d7679c82c886",
      new Date("2026-09-07T10:00:00Z"),
    );
    expect(yaml.load(raw.split("---\n")[1]!) as Record<string, unknown>).not.toHaveProperty(
      "imageSizes",
    );
  });
  it("writes a plain-url cover without inventing social image dimensions", async () => {
    const raw = await serializeArticle(
      { ...document, cover: { url: "/uploads/cover.png", alt: "Cover", caption: "A caption" } },
      [],
      "349ad05b-41ae-4b63-93ab-d7679c82c886",
      new Date("2026-09-07T10:00:00Z"),
    );
    const fm = yaml.load(raw.split("---\n")[1]!) as Record<string, unknown>;
    const parsed = postSchema.parse(fm);
    expect(parsed.cover).toBe("/uploads/cover.png");
    expect(parsed.coverAlt).toBe("Cover");
    expect(fm).not.toHaveProperty("socialImage");
    expect(fm).not.toHaveProperty("socialImageWidth");
    expect(fm).not.toHaveProperty("socialImageHeight");
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

describe("list query and cursor", () => {
  const good = { at: "2026-10-01T12:30:45.123456Z", id: "349ad05b-41ae-4b63-93ab-d7679c82c886" };
  const raw = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

  it("round-trips a cursor including the microseconds", () => {
    expect(cursorSchema.parse(encodeCursor(good))).toEqual(good);
  });
  it.each([
    ["not base64url JSON", "!!!"],
    ["not JSON", Buffer.from("{oops").toString("base64url")],
    ["not an object", raw([1, 2])],
    ["millisecond precision only", raw({ ...good, at: "2026-10-01T12:30:45.123Z" })],
    ["impossible date", raw({ ...good, at: "2026-13-45T99:00:00.000000Z" })],
    ["id not a uuid", raw({ ...good, id: "nope" })],
    ["extra key", raw({ ...good, extra: 1 })],
  ])("rejects a cursor that is %s with a ZodError", (_name, value) => {
    expect(() => cursorSchema.parse(value)).toThrow(z.ZodError);
  });
});

describe("publishBatchSchema", () => {
  const a = "349ad05b-41ae-4b63-93ab-d7679c82c886";
  const b = "5d1a0c52-3a0f-4a53-a0e0-8a2e4d6b7f10";
  const item = (id: string) => ({ id, expectedVersion: 1 });
  it("rejects a repeated id but accepts two distinct ones", () => {
    expect(publishBatchSchema.safeParse({ items: [item(a), item(a)] }).success).toBe(false);
    expect(publishBatchSchema.safeParse({ items: [item(a), item(b)] }).success).toBe(true);
  });
});

describe("cover as an asset or a plain url", () => {
  const withCover = (cover: unknown) => articleDocumentSchema.safeParse({ ...document, cover });
  it.each(["/uploads/cover.png", "/uploads/2026/10/a-b_c.WEBP", "https://cdn.example/c.png?v=1"])(
    "accepts the url %s",
    (url) => {
      expect(withCover({ url, alt: "Cover" }).success).toBe(true);
    },
  );
  it.each([
    "/uploads/../secret.png",
    "/uploads/.hidden/x.png",
    "/uploads/a/..%2Fb.png",
    "/uploads/notes.txt",
    "http://cdn.example/c.png",
    "/og-default.png",
    "//cdn.example/c.png",
    "https://127.0.0.1/c.png",
    "https://[::1]/c.png",
    "https://localhost/c.png",
    "https://postgres/c.png",
    "https://db.internal/c.png",
  ])("rejects the url %s", (url) => {
    expect(withCover({ url, alt: "Cover" }).success).toBe(false);
  });
  it("rejects a cover that names both an asset and a url", () => {
    expect(
      withCover({
        assetId: "349ad05b-41ae-4b63-93ab-d7679c82c886",
        url: "/uploads/a.png",
        alt: "Cover",
      }).success,
    ).toBe(false);
  });
});

describe("completeArticle", () => {
  const { externalId: _externalId, provenance: _provenance, ...bare } = document;
  const input = articleInputSchema.parse(bare);
  it("fills externalId and agent when the client omitted them", () => {
    const completed = completeArticle(input, { externalId: "the-slug", agent: "key-name" });
    expect(completed.externalId).toBe("the-slug");
    expect(completed.provenance).toEqual({ agent: "key-name" });
  });
  it("keeps what the client sent", () => {
    const completed = completeArticle(
      { ...input, externalId: "mine", provenance: { agent: "own", model: "m1" } },
      { externalId: "the-slug", agent: "key-name" },
    );
    expect(completed.externalId).toBe("mine");
    expect(completed.provenance).toEqual({ agent: "own", model: "m1" });
  });
  it("reports a too-long default agent under article.provenance.agent", () => {
    const attempt = () => completeArticle(input, { externalId: "x", agent: "k".repeat(101) });
    expect(attempt).toThrow(z.ZodError);
    try {
      attempt();
    } catch (error) {
      expect((error as z.ZodError).issues[0]?.path.join(".")).toBe("article.provenance.agent");
    }
  });
  it("documents a request that validates: docs/api/article.example.json", () => {
    const example = JSON.parse(readFileSync("docs/api/article.example.json", "utf8"));
    expect(createArticleSchema.safeParse(example).success).toBe(true);
  });
});

describe("keys and posts-meta request schemas", () => {
  it("refuses the reserved key names in any case, and repeated scopes", () => {
    const scopes = ["articles:read"];
    expect(createKeySchema.safeParse({ name: "agent-1", scopes }).success).toBe(true);
    expect(createKeySchema.safeParse({ name: "admin-session", scopes }).success).toBe(false);
    expect(createKeySchema.safeParse({ name: " Admin ", scopes }).success).toBe(false);
    expect(
      createKeySchema.safeParse({ name: "a", scopes: ["articles:read", "articles:read"] }).success,
    ).toBe(false);
  });
  it("refuses a repeated slug in an order", () => {
    expect(postMetaPatchSchema.safeParse({ pinned: false }).success).toBe(true);
    expect(postMetaOrderSchema.safeParse({ slugs: ["a", "a"] }).success).toBe(false);
    expect(postMetaOrderSchema.safeParse({ slugs: ["a", "b"] }).success).toBe(true);
  });
});
