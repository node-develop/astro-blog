import { describe, it, expect, vi } from "vitest";
import { mockAnthropicWithFixture } from "../../../fixtures/anthropic/index.js";
import type { Article, Draft, SocialChannel } from "~/lib/social/types";

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(function () {
    return {
      messages: { create: mockAnthropicWithFixture("critic-happy") },
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

describe("runCritic", () => {
  it("returns annotations object with all 3 channels", async () => {
    const { runCritic } = await import("~/lib/social/critic");
    const drafts: { channel: SocialChannel; draft: Draft }[] = [
      { channel: "x_en", draft: { body: "X body", mediaUrl: null } },
      { channel: "li_en", draft: { body: "LI body".repeat(200), mediaUrl: null } },
      { channel: "tg_ru", draft: { body: "TG body", mediaUrl: null } },
    ];
    const r = await runCritic(article, drafts);
    expect(r).toHaveProperty("x_en");
    expect(r).toHaveProperty("li_en");
    expect(r).toHaveProperty("tg_ru");
    expect(Array.isArray(r.x_en)).toBe(true);
    expect(r.x_en.length).toBe(1); // from fixture
  });
});

describe("hasBlockAnnotations", () => {
  it("returns true if any block-severity note present", async () => {
    const { hasBlockAnnotations } = await import("~/lib/social/critic");
    expect(hasBlockAnnotations([{ severity: "block", kind: "fact", message: "x" }])).toBe(true);
    expect(hasBlockAnnotations([{ severity: "warn", kind: "tone", message: "x" }])).toBe(false);
    expect(hasBlockAnnotations(null)).toBe(false);
    expect(hasBlockAnnotations(undefined)).toBe(false);
    expect(hasBlockAnnotations([])).toBe(false);
  });
});
