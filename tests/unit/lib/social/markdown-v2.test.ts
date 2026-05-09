import { describe, it, expect } from "vitest";
import { escapeMarkdownV2, validateMarkdownV2 } from "~/lib/social/markdown-v2";

describe("MarkdownV2 escape", () => {
  it.each([
    ["a.b", "a\\.b"],
    ["foo (bar)", "foo \\(bar\\)"],
    ["1+2=3!", "1\\+2\\=3\\!"],
    ["hash # tag", "hash \\# tag"],
    ["link_text", "link\\_text"],
    ["**bold**", "**bold**"],
    ["*italic*", "*italic*"],
    ["[label](url)", "[label](url)"],
    ["plain text", "plain text"],
  ])("escapeMarkdownV2(%j) = %j", (input, expected) => {
    expect(escapeMarkdownV2(input)).toBe(expected);
  });
});

describe("MarkdownV2 validate", () => {
  it("passes valid escaped text", () => {
    const r = validateMarkdownV2("Hello\\, world\\! Visit artka\\.dev");
    expect(r.ok).toBe(true);
  });

  it("flags unescaped reserved char", () => {
    const r = validateMarkdownV2("Hello, world! Visit artka.dev");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.length).toBeGreaterThan(0);
  });

  it("allows formatters", () => {
    const r = validateMarkdownV2("**bold** *italic* `code` [link](https://x.com)");
    expect(r.ok).toBe(true);
  });

  it("flags unbalanced bold", () => {
    const r = validateMarkdownV2("**bold");
    expect(r.ok).toBe(false);
  });
});
