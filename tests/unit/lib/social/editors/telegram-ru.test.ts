import { describe, it, expect, vi } from "vitest";
import { mockAnthropicWithFixture } from "../../../../fixtures/anthropic/index.js";
import { validateMarkdownV2 } from "~/lib/social/markdown-v2";
import type { Article, Draft } from "~/lib/social/types";

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockAnthropicWithFixture("editor-tg_ru-happy") },
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

describe("editTgRu", () => {
  it("returns valid MarkdownV2 in 200-600 chars", async () => {
    const { editTgRu } = await import("~/lib/social/editors/telegram-ru");
    const input: Draft = { body: "stub", mediaUrl: null };
    const r = await editTgRu(article, input);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.body.length).toBeGreaterThanOrEqual(200);
      expect(r.value.body.length).toBeLessThanOrEqual(600);
      expect(validateMarkdownV2(r.value.body).ok).toBe(true);
    }
  });

  it("threadTail undefined for Telegram", async () => {
    const { editTgRu } = await import("~/lib/social/editors/telegram-ru");
    const input: Draft = { body: "stub", mediaUrl: null };
    const r = await editTgRu(article, input);
    if (r.ok) expect(r.value.threadTail).toBeUndefined();
  });
});
