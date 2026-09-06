import type { APIContext } from "astro";
import { describe, expect, it } from "vitest";
import { GET, prerender } from "../../../src/pages/llms-full.txt";
import { buildLlmsFull, LLMS_FULL_BUDGET_BYTES, type LlmsInput } from "~/lib/agents/llms";

const post = (locale: "ru" | "en", slug: string, words: number): LlmsInput["ruPosts"][number] => ({
  slug,
  title: `${locale} ${slug}`,
  description: `Description of ${slug}`,
  pubDate: new Date("2026-05-01T00:00:00.000Z"),
  updatedDate: new Date("2026-06-01T00:00:00.000Z"),
  tags: ["seo"],
  body: Array.from({ length: words }, (_, i) => `word${i}`).join(" "),
});

const small: LlmsInput = {
  ruPosts: [post("ru", "a", 200)],
  enPosts: [post("en", "a", 200)],
  ruLessons: [
    {
      courseSlug: "c",
      courseTitle: "Course",
      slug: "01-x",
      title: "01. X",
      description: "d",
      position: 1,
    },
  ],
  enLessons: [],
};

describe("buildLlmsFull", () => {
  it("inlines full bodies of both locales when under budget and says so", () => {
    const out = buildLlmsFull(small);
    expect(out.mode).toBe("full");
    expect(out.bytes).toBeLessThanOrEqual(LLMS_FULL_BUDGET_BYTES);
    expect(out.text).toContain(
      "full Markdown bodies of every Russian post and every English translation",
    );
    expect(out.text).toContain("URL: https://artka.dev/blog/a/");
    expect(out.text).toContain("Markdown: https://artka.dev/blog/a.md");
    expect(out.text).toContain("Published: 2026-05-01");
    expect(out.text).toContain("Updated: 2026-06-01");
    expect(out.text).toContain("URL: https://artka.dev/en/blog/a/");
    expect(out.text).toContain("word199");
    expect(out.text).toContain("1. 01. X → https://artka.dev/courses/c/01-x.md");
    expect(out.text).toContain("X-Robots-Tag: noindex");
  });

  it("falls back to EN excerpts (RU stays full) when the budget would be exceeded", () => {
    const out = buildLlmsFull(
      { ...small, ruPosts: [post("ru", "a", 3_000)], enPosts: [post("en", "a", 3_000)] },
      40 * 1024,
    );
    expect(out.mode).toBe("en-excerpts");
    expect(out.text).toContain("80-word excerpts of the English translations");
    // RU body complete, EN trimmed to an excerpt.
    expect(out.text).toContain("word2999");
    expect(out.text.split("word2999")).toHaveLength(2);
    expect(out.text).toMatch(/Excerpt: word0 word1/);
  });
});

describe("llms-full.txt endpoint", () => {
  it("renders the digest as runtime plain text from shared content", async () => {
    const response = await GET({} as APIContext);
    const body = await response.text();

    expect(prerender).toBe(false);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=3600");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(["full", "en-excerpts"]).toContain(response.headers.get("X-Llms-Full-Mode"));
    expect(body).toContain("# artka.dev — full LLM digest");
    expect(body).toContain("## Author");
    expect(body).toContain("# Posts (Russian — source of truth)");
    expect(Buffer.byteLength(body, "utf8")).toBeLessThanOrEqual(LLMS_FULL_BUDGET_BYTES);
  });
});
