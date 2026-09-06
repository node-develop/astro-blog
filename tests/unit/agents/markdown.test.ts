import { describe, expect, it } from "vitest";
import {
  renderAgent404Markdown,
  renderDocumentMarkdown,
  renderHomeMarkdown,
} from "~/lib/agents/markdown";

describe("agent-facing Markdown", () => {
  it("renders a useful bilingual home representation with canonical recovery links", () => {
    const markdown = renderHomeMarkdown({
      locale: "en",
      title: "Production notes on AI agents and backend systems",
      introduction:
        "Field-tested explanations of Claude Code internals, agent workflows, retrieval, and distributed systems.",
      posts: [
        {
          title: "Context and cache",
          description: "How context windows and prompt caching affect reliability and cost.",
          url: "https://artka.dev/en/blog/context-and-cache/",
        },
      ],
    });

    expect(markdown).toMatch(/^# artka\.dev/m);
    expect(markdown).toContain("https://artka.dev/en/courses/claude-code-guide/");
    expect(markdown).toContain("https://artka.dev/en/contact/");
    expect(markdown).toContain("https://artka.dev/llms.txt");
    expect(markdown).toContain("Context and cache");
  });

  it("keeps a 404 status recovery body short and actionable", () => {
    const markdown = renderAgent404Markdown("ru", "/missing/");

    expect(markdown).toMatch(/^# 404 — Страница не найдена/m);
    expect(markdown).toContain("`/missing/`");
    expect(markdown).toContain("https://artka.dev/sitemap-index.xml");
    expect(markdown).toContain("https://artka.dev/llms.txt");
    expect(markdown.length).toBeLessThan(1_500);
  });
});

describe("renderDocumentMarkdown", () => {
  it("prefixes the authored body with a header that carries the canonical URL", () => {
    const markdown = renderDocumentMarkdown({
      locale: "ru",
      title: 'Заголовок "в кавычках"',
      description: "Описание.",
      canonical: "https://artka.dev/blog/foo/",
      alternate: "https://artka.dev/en/blog/foo/",
      author: "Artyom Kashuta",
      pubDate: new Date("2026-05-01T10:00:00.000Z"),
      updatedDate: new Date("2026-06-01T10:00:00.000Z"),
      tags: ["claude-code", "guide"],
      extra: [["lesson", "1 of 14"]],
      body: "\n\n## Раздел\n\nТекст.\n",
    });

    expect(markdown).toBe(
      [
        "---",
        'title: "Заголовок \\"в кавычках\\""',
        'description: "Описание."',
        "canonical: https://artka.dev/blog/foo/",
        "alternate: https://artka.dev/en/blog/foo/",
        'author: "Artyom Kashuta"',
        "language: ru-RU",
        "published: 2026-05-01",
        "updated: 2026-06-01",
        "tags: [claude-code, guide]",
        "lesson: 1 of 14",
        "---",
        "",
        '# Заголовок "в кавычках"',
        "",
        "## Раздел",
        "",
        "Текст.",
        "",
      ].join("\n"),
    );
  });

  it("omits optional header lines when data is absent", () => {
    const markdown = renderDocumentMarkdown({
      locale: "en",
      title: "T",
      description: "D",
      canonical: "https://artka.dev/en/blog/t/",
      author: "A",
      pubDate: new Date("2026-05-01T00:00:00.000Z"),
      body: "Body",
    });
    expect(markdown).not.toContain("alternate:");
    expect(markdown).not.toContain("updated:");
    expect(markdown).not.toContain("tags:");
    expect(markdown).toContain("language: en-US");
  });
});
