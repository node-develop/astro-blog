import { describe, expect, it } from "vitest";
import { renderAgent404Markdown, renderHomeMarkdown } from "~/lib/agents/markdown";

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
