import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const robots = readFileSync(join(process.cwd(), "public/robots.txt"), "utf8");

describe("public/robots.txt", () => {
  const namedBots = [
    "GPTBot",
    "OAI-SearchBot",
    "ChatGPT-User",
    "ClaudeBot",
    "Claude-SearchBot",
    "Claude-User",
    "PerplexityBot",
    "Perplexity-User",
    "Google-Extended",
    // Added 2026-09-05: retrieval/answer crawlers that gained traffic share.
    "CCBot",
    "Applebot-Extended",
    "Bytespider",
    "meta-externalagent",
    "Meta-ExternalFetcher",
    "Amazonbot",
    "cohere-ai",
    "DuckAssistBot",
    "MistralAI-User",
    "Diffbot",
  ];

  it.each(namedBots)("declares an explicit User-agent block for %s", (bot) => {
    expect(robots).toMatch(new RegExp(`^User-agent:\\s*${bot}\\s*$`, "m"));
  });

  it("disallows private admin/API routes while leaving noindex utility pages crawlable", () => {
    const blocks = robots.split(/\n\n+/).filter((b) => /^User-agent:/m.test(b));
    expect(blocks.length).toBeGreaterThanOrEqual(namedBots.length + 1); // named + catch-all *
    for (const block of blocks) {
      expect(block).toMatch(/^Disallow:\s*\/admin\//m);
      expect(block).toMatch(/^Disallow:\s*\/api\//m);
      expect(block).not.toMatch(/^Disallow:\s*\/login\b/m);
      expect(block).not.toMatch(/^Disallow:\s*\/(?:en\/)?search\b/m);
    }
  });

  it("retains the sitemap directive", () => {
    expect(robots).toMatch(/^Sitemap:\s+https:\/\/artka\.dev\/sitemap-index\.xml\s*$/m);
  });

  it("points agents at llms.txt / llms-full.txt and carries the review date", () => {
    expect(robots).toContain("https://artka.dev/llms.txt");
    expect(robots).toContain("https://artka.dev/llms-full.txt");
    expect(robots).toMatch(/^# robots\.txt — last reviewed \d{4}-\d{2}-\d{2}$/m);
  });

  it("keeps the catch-all User-agent: * block last", () => {
    const lastBlock = robots
      .split(/\n\n+/)
      .filter((b) => /^User-agent:/m.test(b))
      .pop()!;
    expect(lastBlock).toMatch(/^User-agent:\s*\*\s*$/m);
  });
});
