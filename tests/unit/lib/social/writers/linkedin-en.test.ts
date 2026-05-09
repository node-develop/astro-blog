import { describe, it, expect, vi } from "vitest";
import { mockAnthropicWithFixture } from "../../../../fixtures/anthropic/index.js";
import type { Article } from "~/lib/social/types";

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockAnthropicWithFixture("writer-li_en-happy") },
  })),
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

describe("writeLiEn", () => {
  it("returns draft within 1300-1900 chars", async () => {
    const { writeLiEn } = await import("~/lib/social/writers/linkedin-en");
    const r = await writeLiEn({ article });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.body.length).toBeGreaterThanOrEqual(1300);
      expect(r.value.body.length).toBeLessThanOrEqual(1900);
    }
  });

  it("contains 3-5 PascalCase hashtags", async () => {
    const { writeLiEn } = await import("~/lib/social/writers/linkedin-en");
    const r = await writeLiEn({ article });
    if (r.ok) {
      const hashtags = r.value.body.match(/#[A-Z][A-Za-z0-9]*/g) ?? [];
      expect(hashtags.length).toBeGreaterThanOrEqual(3);
      expect(hashtags.length).toBeLessThanOrEqual(5);
    }
  });

  it("threadTail is undefined for LinkedIn", async () => {
    const { writeLiEn } = await import("~/lib/social/writers/linkedin-en");
    const r = await writeLiEn({ article });
    if (r.ok) expect(r.value.threadTail).toBeUndefined();
  });
});
