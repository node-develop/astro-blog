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
    "Claude-Web",
    "anthropic-ai",
    "PerplexityBot",
    "Perplexity-User",
    "Google-Extended",
  ];

  it.each(namedBots)("declares an explicit User-agent block for %s", (bot) => {
    expect(robots).toMatch(new RegExp(`^User-agent:\\s*${bot}\\s*$`, "m"));
  });

  it("disallows admin, api, login under every block", () => {
    const blocks = robots.split(/\n\n+/).filter((b) => /^User-agent:/m.test(b));
    expect(blocks.length).toBeGreaterThanOrEqual(10); // 9 named + catch-all *
    for (const block of blocks) {
      expect(block).toMatch(/^Disallow:\s*\/admin\//m);
      expect(block).toMatch(/^Disallow:\s*\/api\//m);
      expect(block).toMatch(/^Disallow:\s*\/login\b/m);
    }
  });

  it("retains the sitemap directive", () => {
    expect(robots).toMatch(/^Sitemap:\s+https:\/\/artka\.dev\/sitemap-index\.xml\s*$/m);
  });

  it("keeps the catch-all User-agent: * block last", () => {
    const lastBlock = robots
      .split(/\n\n+/)
      .filter((b) => /^User-agent:/m.test(b))
      .pop()!;
    expect(lastBlock).toMatch(/^User-agent:\s*\*\s*$/m);
  });
});
