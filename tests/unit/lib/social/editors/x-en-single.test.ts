import { describe, it, expect, vi } from "vitest";
import { mockAnthropicWithFixture } from "../../../../fixtures/anthropic/index.js";
import type { Article, Draft } from "~/lib/social/types";

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockAnthropicWithFixture("editor-x_en-single") },
  })),
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

describe("editXEn — single", () => {
  it("preserves single→single type", async () => {
    const { editXEn } = await import("~/lib/social/editors/x-en");
    const draft: Draft = { body: "Original draft.", mediaUrl: null };
    const r = await editXEn(article, draft);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.threadTail).toBeUndefined();
  });

  it("preserves mediaUrl from input draft", async () => {
    const { editXEn } = await import("~/lib/social/editors/x-en");
    const draft: Draft = { body: "Original.", mediaUrl: "https://artka.dev/c.jpg" };
    const r = await editXEn(article, draft);
    if (r.ok) expect(r.value.mediaUrl).toBe("https://artka.dev/c.jpg");
  });
});
