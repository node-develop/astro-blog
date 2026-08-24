import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const visibleText = (html: string): string =>
  html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("indexable Claude Code Guide landing pages", () => {
  it.each([
    ["courses/claude-code-guide/index.html", "Зачем этот курс", "Ключевые принципы"],
    ["en/courses/claude-code-guide/index.html", "Why this course", "Recurring principles"],
  ])("renders the authored course overview in %s", (artifact, firstHeading, secondHeading) => {
    const html = readFileSync(join(process.cwd(), "dist/client", artifact), "utf8");
    const text = visibleText(html);

    expect(text).toContain(firstHeading);
    expect(text).toContain(secondHeading);
    expect(text.length).toBeGreaterThan(2_000);
  });
});
