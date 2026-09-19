import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { postOgPath, postOgSlug } from "~/lib/og/post-pages";
import { lessonOgEyebrow, lessonOgPath, lessonOgSlug } from "~/lib/og/lesson-pages";

describe("post OG image paths", () => {
  it("gives each locale its own file", () => {
    expect(postOgPath("robots-txt-ai-crawlers-2026", "ru")).toBe(
      "/og/robots-txt-ai-crawlers-2026-ru.png",
    );
    expect(postOgPath("robots-txt-ai-crawlers-2026", "en")).toBe(
      "/og/robots-txt-ai-crawlers-2026-en.png",
    );
    expect(postOgPath("x", "ru")).not.toBe(postOgPath("x", "en"));
  });

  it("follows the same <name>-<locale> convention as landing cards", async () => {
    // landing-pages.ts pulls in astro:content, so assert its shape from the
    // source the way landing-dependencies.test.ts does rather than importing.
    const landing = await readFile(join(process.cwd(), "src/lib/og/landing-pages.ts"), "utf8");

    expect(landing).toContain("`/og/landing/${page}-${locale}.png`");
    expect(postOgSlug("blog", "en")).toBe("blog-en");
  });

  it("keeps an RU post slugged like an EN twin off that twin's card", () => {
    // The bug class a bare-RU + suffixed-EN scheme would reintroduce: with
    // "/og/<slug>.png" for RU and "/og/<slug>-en.png" for EN, an RU post
    // slugged "canonical-en" and the EN twin of "canonical" both land on
    // "/og/canonical-en.png" and one silently overwrites the other.
    expect(postOgSlug("canonical-en", "ru")).not.toBe(postOgSlug("canonical", "en"));
  });

  it("never lets two distinct (slug, locale) pairs share a file name", () => {
    const pairs = [
      ["canonical", "ru"],
      ["canonical", "en"],
      ["canonical-en", "ru"],
      ["canonical-en", "en"],
      ["canonical-ru", "ru"],
      ["canonical-ru", "en"],
    ] as const;
    const slugs = pairs.map(([slug, locale]) => postOgSlug(slug, locale));
    expect(new Set(slugs).size).toBe(pairs.length);
  });
});

describe("lesson OG image paths", () => {
  it("namespaces by course and locale", () => {
    expect(lessonOgPath("claude-code-guide", "01-introduction", "ru")).toBe(
      "/og/lesson/claude-code-guide/01-introduction-ru.png",
    );
    expect(lessonOgPath("claude-code-guide", "01-introduction", "en")).toBe(
      "/og/lesson/claude-code-guide/01-introduction-en.png",
    );
    expect(lessonOgSlug("01-introduction", "ru")).not.toBe(lessonOgSlug("01-introduction", "en"));
  });

  it("labels the lesson position in the page's own language", () => {
    const courseTitle = "Claude Code Guide";
    expect(lessonOgEyebrow({ locale: "ru", index: 3, courseTitle })).toBe(
      "УРОК 3 · CLAUDE CODE GUIDE",
    );
    expect(lessonOgEyebrow({ locale: "en", index: 3, courseTitle })).toBe(
      "LESSON 3 · CLAUDE CODE GUIDE",
    );
  });
});

describe("layout wiring", () => {
  it("builds the post card path through postOgPath, not an inline template", async () => {
    const source = await readFile(join(process.cwd(), "src/layouts/PostLayout.astro"), "utf8");

    expect(source).toMatch(/from\s+["']~\/lib\/og\/post-pages["']/);
    expect(source).toMatch(/const ogImagePath = postOgPath\(slug, locale\)/);
    // An inline path would drop the locale again the next time someone edits it.
    expect(source).not.toMatch(/`\/og\/\$\{slug\}\.png`/);
  });
});
