import { describe, expect, it } from "vitest";
import { imageTypeOf, postOgPath, postOgSlug, postShareImage } from "~/lib/og/post-pages";
import { lessonOgEyebrow, lessonOgPath, lessonOgSlug } from "~/lib/og/lesson-pages";
import {
  bareProjectSlug,
  projectOgEyebrow,
  projectOgPath,
  projectOgSlug,
} from "~/lib/og/project-pages";

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

describe("project OG image paths", () => {
  it("gives each locale its own file under /og/project/", () => {
    expect(projectOgPath("astro-blog", "ru")).toBe("/og/project/astro-blog-ru.png");
    expect(projectOgPath("astro-blog", "en")).toBe("/og/project/astro-blog-en.png");
    expect(projectOgPath("astro-blog", "ru")).not.toBe(projectOgPath("astro-blog", "en"));
  });

  it("collapses a collection id of either locale to the same bare slug", () => {
    // The page route and the image route must agree on the slug, or a page
    // asks for a card the build never emitted.
    expect(bareProjectSlug("en/astro-blog.md")).toBe("astro-blog");
    expect(bareProjectSlug("astro-blog")).toBe("astro-blog");
    expect(bareProjectSlug("en/astro-blog")).toBe(bareProjectSlug("astro-blog.md"));
  });

  it("never lets two distinct (slug, locale) pairs share a file name", () => {
    // Same bug class the post route was fixed for: with a bare-RU scheme an
    // RU project slugged "foo-en" would take over the EN card of "foo".
    const pairs = [
      ["astro-blog", "ru"],
      ["astro-blog", "en"],
      ["astro-blog-en", "ru"],
      ["astro-blog-en", "en"],
      ["astro-blog-ru", "ru"],
      ["astro-blog-ru", "en"],
    ] as const;
    const slugs = pairs.map(([slug, locale]) => projectOgSlug(slug, locale));
    expect(new Set(slugs).size).toBe(pairs.length);
  });

  it("labels the section in the page's own language, uppercased", () => {
    expect(projectOgEyebrow({ locale: "ru", year: 2026 })).toBe("ПРОЕКТ · 2026");
    expect(projectOgEyebrow({ locale: "en", year: 2026 })).toBe("PROJECT · 2026");
    // Uppercase is baked in: Satori is not asked to honour text-transform.
    const eyebrow = projectOgEyebrow({ locale: "en", year: 2026 });
    expect(eyebrow).toBe(eyebrow.toUpperCase());
  });
});

describe("the image that represents a post in feeds, JSON-LD and social drafts", () => {
  const ORIGIN = "https://artka.dev";

  it.each([
    ["no cover", undefined],
    ["the generic PNG placeholder", "/og-default.png"],
    ["the generic SVG placeholder", "/og-default.svg"],
  ])("%s falls back to the post's own card, per locale, as an absolute URL", (_label, cover) => {
    expect(postShareImage(cover, "my-post", "ru", ORIGIN)).toBe(
      "https://artka.dev/og/my-post-ru.png",
    );
    expect(postShareImage(cover, "my-post", "en", ORIGIN)).toBe(
      "https://artka.dev/og/my-post-en.png",
    );
  });

  it("a real cover wins, whichever way it is stored", () => {
    expect(postShareImage("2026/04/file.png", "p", "ru", ORIGIN)).toBe(
      "https://artka.dev/uploads/2026/04/file.png",
    );
    expect(postShareImage("/covers/a.webp", "p", "ru", ORIGIN)).toBe(
      "https://artka.dev/covers/a.webp",
    );
    expect(postShareImage("https://media.example.com/a.jpg", "p", "ru", ORIGIN)).toBe(
      "https://media.example.com/a.jpg",
    );
  });

  it("media type follows the extension and is unknown without one", () => {
    expect(imageTypeOf("https://artka.dev/og/p-ru.png")).toBe("image/png");
    expect(imageTypeOf("https://media.example.com/a.JPG?v=2")).toBe("image/jpeg");
    expect(imageTypeOf("https://media.example.com/articles/3f9a")).toBeNull();
  });
});
