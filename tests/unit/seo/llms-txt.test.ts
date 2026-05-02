import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const path = join(process.cwd(), "public/llms.txt");

describe("public/llms.txt", () => {
  it("exists and is non-empty", () => {
    const stat = statSync(path);
    expect(stat.isFile()).toBe(true);
    expect(stat.size).toBeGreaterThan(200);
    expect(stat.size).toBeLessThan(4096); // <= 4KB per llmstxt.org guidance
  });

  const content = readFileSync(path, "utf8");

  it("starts with an H1 site name", () => {
    expect(content).toMatch(/^# artka\.dev$/m);
  });

  it("links the canonical authoritative pages", () => {
    expect(content).toContain("https://artka.dev/about");
    expect(content).toContain("https://artka.dev/blog");
    expect(content).toContain("https://artka.dev/rss.xml");
    expect(content).toContain("https://artka.dev/en/rss.xml");
  });

  it("declares the preferred attribution string", () => {
    expect(content).toMatch(/preferred attribution/i);
    expect(content).toContain("Артём Кашута");
  });
});
