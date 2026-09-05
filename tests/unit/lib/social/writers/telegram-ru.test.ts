import { describe, it, expect, vi } from "vitest";
import { mockAnthropicWithFixture } from "../../../../fixtures/anthropic/index.js";
import { validateMarkdownV2 } from "~/lib/social/markdown-v2";
import type { Article } from "~/lib/social/types";

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(function () {
    return {
      messages: { create: mockAnthropicWithFixture("writer-tg_ru-happy") },
    };
  }),
}));

const article: Article = {
  collection: "posts",
  slug: "multi-agent-postgres",
  title: "Postgres outbox",
  summary: "S",
  body: "B",
  tags: [],
  pubDate: new Date(),
  cover: null,
  lang: "ru",
  sourceUrl: "https://artka.dev/blog/multi-agent-postgres",
  hasEnTwin: true,
};

describe("writeTgRu", () => {
  it("returns valid MarkdownV2 in 200-600 chars", async () => {
    const { writeTgRu } = await import("~/lib/social/writers/telegram-ru");
    const r = await writeTgRu({ article });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.body.length).toBeGreaterThanOrEqual(200);
      expect(r.value.body.length).toBeLessThanOrEqual(600);
      const v = validateMarkdownV2(r.value.body);
      expect(v.ok).toBe(true);
    }
  });

  it("threadTail undefined for Telegram", async () => {
    const { writeTgRu } = await import("~/lib/social/writers/telegram-ru");
    const r = await writeTgRu({ article });
    if (r.ok) expect(r.value.threadTail).toBeUndefined();
  });
});
