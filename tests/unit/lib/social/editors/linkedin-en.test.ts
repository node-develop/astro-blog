import { describe, it, expect, vi } from "vitest";
import { mockAnthropicWithFixture } from "../../../../fixtures/anthropic/index.js";
import type { Article, Draft } from "~/lib/social/types";

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(function () {
    return {
      messages: { create: mockAnthropicWithFixture("editor-li_en-happy") },
    };
  }),
}));

const article: Article = {
  collection: "posts",
  slug: "x",
  title: "T",
  summary: "S",
  body: "B",
  tags: [],
  pubDate: new Date(),
  cover: null,
  lang: "ru",
  sourceUrl: "https://artka.dev/x",
  hasEnTwin: true,
};

describe("editLiEn", () => {
  it("returns rewritten draft 1300-1900 chars with hashtags", async () => {
    const { editLiEn } = await import("~/lib/social/editors/linkedin-en");
    const input: Draft = { body: "stub", mediaUrl: null };
    const r = await editLiEn(article, input);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.body.length).toBeGreaterThanOrEqual(1300);
      expect(r.value.body.length).toBeLessThanOrEqual(1900);
      const tags = r.value.body.match(/#[A-Z][A-Za-z0-9]*/g) ?? [];
      expect(tags.length).toBeGreaterThanOrEqual(3);
      expect(tags.length).toBeLessThanOrEqual(5);
    }
  });

  it("threadTail undefined for LinkedIn", async () => {
    const { editLiEn } = await import("~/lib/social/editors/linkedin-en");
    const input: Draft = { body: "stub", mediaUrl: null };
    const r = await editLiEn(article, input);
    if (r.ok) expect(r.value.threadTail).toBeUndefined();
  });
});
