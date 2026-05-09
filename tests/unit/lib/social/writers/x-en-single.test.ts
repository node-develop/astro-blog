import { describe, it, expect, vi } from "vitest";
import { mockAnthropicWithFixture } from "../../../../fixtures/anthropic/index.js";
import type { Article } from "~/lib/social/types";

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockAnthropicWithFixture("writer-x_en-happy") },
  })),
}));

const article: Article = {
  collection: "posts",
  slug: "multi-agent-postgres",
  title: "Postgres outbox в роли очереди",
  summary: "TL;DR: SKIP LOCKED + 5 таблиц = простая очередь без Redis.",
  body: "Three weeks ago I started building...",
  tags: ["postgres", "outbox"],
  pubDate: new Date("2026-05-09"),
  cover: { src: "https://artka.dev/cover.jpg", alt: "diagram" },
  lang: "ru",
  sourceUrl: "https://artka.dev/blog/multi-agent-postgres",
  hasEnTwin: true,
};

describe("writeXEn — single tweet", () => {
  it("returns single-tweet draft within 270 chars", async () => {
    const { writeXEn } = await import("~/lib/social/writers/x-en");
    const r = await writeXEn({ article });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.body.length).toBeLessThanOrEqual(270);
      expect(r.value.threadTail).toBeUndefined();
      expect(r.value.mediaUrl).toBe("https://artka.dev/cover.jpg");
    }
  });
});
