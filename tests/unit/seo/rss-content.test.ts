import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ru = readFileSync(join(process.cwd(), "src/pages/rss.xml.ts"), "utf8");
const en = readFileSync(join(process.cwd(), "src/pages/en/rss.xml.ts"), "utf8");

describe("RSS feeds emit full content", () => {
  it.each([
    ["ru", ru],
    ["en", en],
  ])("%s feed renders post.body via markdown-it into the content field", (_label, source) => {
    expect(source).toMatch(/import\s+MarkdownIt\s+from\s+["']markdown-it["']/);
    expect(source).toMatch(/parser\.render\(p\.entry\.body\)/);
    expect(source).toMatch(/content:\s*p\.entry\.body\s*\?\s*parser\.render/);
  });
});
