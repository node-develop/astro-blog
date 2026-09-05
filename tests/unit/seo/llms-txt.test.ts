import type { APIContext } from "astro";
import { describe, expect, it } from "vitest";
import { GET, prerender } from "../../../src/pages/llms.txt";
import { buildLlmsTxt, type LlmsInput } from "~/lib/agents/llms";

// llms.txt moved from a static public/ file to a generated endpoint so the
// post/lesson inventory can never drift from the content again (the static
// file claimed sitemap hreflang and a "full" digest that did not exist).

const fixture: LlmsInput = {
  ruPosts: [
    {
      slug: "claude-md",
      title: "CLAUDE.md: 12 правил",
      description: "Как писать CLAUDE.md.",
      pubDate: new Date("2026-05-01T00:00:00.000Z"),
      tags: ["claude-code"],
      body: "# Заголовок\n\nТекст поста.",
    },
    {
      slug: "ru-only",
      title: "Только RU [черновик]",
      description: "Без перевода.",
      pubDate: new Date("2026-05-02T00:00:00.000Z"),
      tags: [],
      body: "Текст.",
    },
  ],
  enPosts: [
    {
      slug: "claude-md",
      title: "CLAUDE.md: 12 rules",
      description: "How to write CLAUDE.md.",
      pubDate: new Date("2026-05-01T00:00:00.000Z"),
      tags: ["claude-code"],
      body: "# Heading\n\nPost text.",
    },
  ],
  ruLessons: [
    {
      courseSlug: "claude-code-guide",
      courseTitle: "Claude Code Guide",
      slug: "01-introduction",
      title: "01. Введение",
      description: "Зачем курс.",
      position: 1,
    },
  ],
  enLessons: [
    {
      courseSlug: "claude-code-guide",
      courseTitle: "Claude Code Guide",
      slug: "01-introduction",
      title: "01. Introduction",
      description: "Why this course.",
      position: 1,
    },
  ],
};

describe("buildLlmsTxt", () => {
  const content = buildLlmsTxt(fixture);

  it("starts with an H1 site name and llmstxt.org sections", () => {
    expect(content).toMatch(/^# artka\.dev$/m);
    for (const section of ["## Docs", "## Posts", "## Lessons", "## Optional"]) {
      expect(content).toMatch(new RegExp(`^${section}$`, "m"));
    }
  });

  it("lists every RU post with its EN twin and Markdown URL, plus every lesson", () => {
    expect(content).toContain(
      "- [CLAUDE.md: 12 правил](https://artka.dev/blog/claude-md/): Как писать CLAUDE.md. (2026-05-01; Markdown: https://artka.dev/blog/claude-md.md) EN: https://artka.dev/en/blog/claude-md/",
    );
    expect(content).toContain("- [Только RU \\[черновик\\]](https://artka.dev/blog/ru-only/)");
    expect(content).not.toContain("EN: https://artka.dev/en/blog/ru-only/");
    expect(content).toContain(
      "- [01. Введение](https://artka.dev/courses/claude-code-guide/01-introduction/): Зачем курс. (Markdown: https://artka.dev/courses/claude-code-guide/01-introduction.md)",
    );
    expect(content).toContain("https://artka.dev/en/courses/claude-code-guide/01-introduction/");
    expect(content).toContain(
      "[Claude Code Guide](https://artka.dev/courses/claude-code-guide/): 1-lesson course",
    );
  });

  it("links the canonical authoritative pages", () => {
    expect(content).toContain("https://artka.dev/about/");
    expect(content).toContain("https://artka.dev/blog/");
    expect(content).toContain("https://artka.dev/rss.xml");
    expect(content).toContain("https://artka.dev/en/rss.xml");
    expect(content).toContain("https://artka.dev/llms-full.txt");
  });

  it("declares the preferred attribution string", () => {
    expect(content).toMatch(/preferred attribution/i);
    expect(content).toContain("Артём Кашута");
  });

  it("no longer makes claims the site cannot back", () => {
    expect(content).not.toMatch(/every post in one file/i);
  });
});

describe("llms.txt endpoint", () => {
  it("renders the index at runtime as cacheable plain text", async () => {
    const response = await GET({} as APIContext);
    const body = await response.text();

    expect(prerender).toBe(false);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=3600");
    expect(body).toMatch(/^# artka\.dev$/m);
    expect(body).toMatch(/^## When to use artka\.dev$/m);
    // Was "< 4096" for the static file; the generated index now enumerates every
    // post, twin and lesson, so the ceiling is raised (still a small index).
    expect(Buffer.byteLength(body, "utf8")).toBeGreaterThan(1_000);
    expect(Buffer.byteLength(body, "utf8")).toBeLessThan(24 * 1024);
  });
});

describe("buildLlmsTxt — note clipping", () => {
  it("clips long descriptions at a word boundary so the index stays skimmable", () => {
    const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
    const content = buildLlmsTxt({
      ...fixture,
      ruPosts: [{ ...fixture.ruPosts[0]!, description: long }],
    });
    const line = content.split("\n").find((l) => l.includes("/blog/claude-md/)"))!;
    const note = line.slice(line.indexOf("): ") + 3, line.indexOf(" (2026"));
    expect(note.endsWith("…")).toBe(true);
    expect(note.length).toBeLessThanOrEqual(161);
    // Never cut mid-word: every emitted token must be a complete source token.
    const tokens = new Set(long.split(" "));
    for (const token of note.slice(0, -1).split(" ")) expect(tokens.has(token), token).toBe(true);
  });
});
