import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

const POSTS_DIR = join(process.cwd(), "src/content/posts");
const FENCE = /^---\r?\n([\s\S]*?)\r?\n---/;
const CUTOFF_ISO = "2026-05-02";

interface RawPost {
  readonly file: string;
  readonly fm: Record<string, unknown>;
}

const collectPosts = (dir: string): readonly RawPost[] => {
  const out: RawPost[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      out.push(...collectPosts(join(dir, entry.name)));
      continue;
    }
    if (!/\.(md|mdx)$/.test(entry.name)) continue;
    const raw = readFileSync(join(dir, entry.name), "utf8");
    const m = FENCE.exec(raw);
    if (!m || !m[1]) continue;
    const fm = (yaml.load(m[1]) ?? {}) as Record<string, unknown>;
    out.push({ file: join(dir, entry.name), fm });
  }
  return out;
};

const posts = collectPosts(POSTS_DIR);

const isoOf = (v: unknown): string => {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "string") return v.slice(0, 10);
  return "";
};

describe("post schema — back-compat for existing posts", () => {
  it("all existing posts (pubDate < cutoff) parse without summary", () => {
    const old = posts.filter((p) => isoOf(p.fm["pubDate"]) < CUTOFF_ISO);
    // Standalone posts that remain in /blog after the claude-code-guide
    // series moved to /courses/claude-code-guide/. The course lessons live
    // in their own collection now and are validated by lesson-schema tests.
    expect(old.length).toBeGreaterThanOrEqual(1);
    for (const p of old) {
      // No assertion on `summary` presence — back-compat by design.
      expect(typeof p.fm["title"]).toBe("string");
    }
  });
});

describe("post schema — required fields after cutoff", () => {
  it("every post with pubDate >= 2026-05-02 has a summary", () => {
    const fresh = posts.filter((p) => isoOf(p.fm["pubDate"]) >= CUTOFF_ISO);
    const missing = fresh.filter((p) => typeof p.fm["summary"] !== "string");
    if (missing.length > 0) {
      const list = missing.map((p) => `  - ${p.file}`).join("\n");
      throw new Error(
        `Posts published on/after ${CUTOFF_ISO} must define \`summary\` ` +
          `(60–280 chars TL;DR). Missing in:\n${list}`,
      );
    }
  });

  it("if `summary` is present it is 60–280 chars", () => {
    for (const p of posts) {
      const s = p.fm["summary"];
      if (typeof s !== "string") continue;
      expect(s.length).toBeGreaterThanOrEqual(60);
      expect(s.length).toBeLessThanOrEqual(280);
    }
  });

  it("if `faq` is present each item has question + answer", () => {
    for (const p of posts) {
      const faq = p.fm["faq"];
      if (!Array.isArray(faq)) continue;
      for (const item of faq) {
        expect(typeof (item as Record<string, unknown>)["question"]).toBe("string");
        expect(typeof (item as Record<string, unknown>)["answer"]).toBe("string");
      }
    }
  });

  it("if `lang` is present it is 'ru' or 'en'", () => {
    for (const p of posts) {
      const lang = p.fm["lang"];
      if (lang === undefined) continue;
      expect(["ru", "en"]).toContain(lang);
    }
  });
});
