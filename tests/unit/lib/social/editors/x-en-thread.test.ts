import { describe, it, expect, vi } from "vitest";
import { mockAnthropicWithFixture } from "../../../../fixtures/anthropic/index.js";
import type { Article, Draft } from "~/lib/social/types";

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(function () {
    return {
      messages: { create: mockAnthropicWithFixture("editor-x_en-thread") },
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

describe("editXEn — thread", () => {
  it("preserves thread→thread type with same parts count", async () => {
    const { editXEn } = await import("~/lib/social/editors/x-en");
    const inputThread: Draft = {
      body: "T1",
      threadTail: ["T2", "T3", "T4", "T5", "T6", "T7", "T8"],
      mediaUrl: null,
    };
    const r = await editXEn(article, inputThread);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.threadTail).toBeDefined();
      expect(r.value.threadTail!.length).toBe(7); // 8 parts → 7 tail
    }
  });
});
