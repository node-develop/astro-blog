import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// RU + EN feeds share src/lib/feeds/build-rss.ts; the per-locale endpoints
// are thin pass-throughs. Asserting markdown-it usage on the shared builder
// covers both languages in one go.
const builder = readFileSync(join(process.cwd(), "src/lib/feeds/build-rss.ts"), "utf8");
const ru = readFileSync(join(process.cwd(), "src/pages/rss.xml.ts"), "utf8");
const en = readFileSync(join(process.cwd(), "src/pages/en/rss.xml.ts"), "utf8");

describe("RSS feeds emit full content", () => {
  it("shared builder renders post.body via markdown-it into the content field", () => {
    expect(builder).toMatch(/import\s+MarkdownIt\s+from\s+["']markdown-it["']/);
    expect(builder).toMatch(/parser\.render\(p\.entry\.body\)/);
    expect(builder).toMatch(/content:\s*p\.entry\.body\s*\?\s*parser\.render/);
  });

  it.each([
    ["ru", ru, /locale: "ru"/],
    ["en", en, /locale: "en"/],
  ])("%s endpoint delegates to the shared builder", (_label, source, marker) => {
    expect(source).toMatch(/buildRssFeed/);
    expect(source).toMatch(marker);
  });
});
