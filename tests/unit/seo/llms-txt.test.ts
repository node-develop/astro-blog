import type { APIContext } from "astro";
import { describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { GET, prerender } from "../../../src/pages/llms.txt";
import { buildLlmsTxt, type LlmsInput } from "~/lib/agents/llms";

// llms.txt moved from a static public/ file to a generated endpoint so the
// post inventory can never drift from the content again (the static
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
};

describe("buildLlmsTxt", () => {
  const content = buildLlmsTxt(fixture);

  it("starts with an H1 site name and llmstxt.org sections", () => {
    expect(content).toMatch(/^# artka\.dev$/m);
    for (const section of ["## Docs", "## Posts", "## Optional"]) {
      expect(content).toMatch(new RegExp(`^${section}$`, "m"));
    }
  });

  it("lists every RU post with its EN twin and Markdown URL", () => {
    expect(content).toContain(
      "- [CLAUDE.md: 12 правил](https://artka.dev/blog/claude-md/): Как писать CLAUDE.md. (2026-05-01; Markdown: https://artka.dev/blog/claude-md.md) EN: https://artka.dev/en/blog/claude-md/",
    );
    expect(content).toContain("- [Только RU \\[черновик\\]](https://artka.dev/blog/ru-only/)");
    expect(content).not.toContain("EN: https://artka.dev/en/blog/ru-only/");
  });

  // The summary used to promise gRPC, Kafka and FastAPI coverage that no post
  // had; it is now built from the posts' tags (EN labels).
  it("summarises only topics the posts are tagged with", () => {
    expect(content).toContain("> AI engineer. Published so far: articles on Claude Code.");
    expect(content).not.toMatch(/gRPC|Kafka|FastAPI/);
  });

  it("links the canonical authoritative pages", () => {
    expect(content).toContain("https://artka.dev/about/");
    expect(content).toContain("https://artka.dev/blog/");
    expect(content).toContain("https://artka.dev/rss.xml");
    expect(content).toContain("https://artka.dev/en/rss.xml");
    expect(content).toContain("https://artka.dev/llms-full.txt");
    expect(content).toContain("https://artka.dev/contact/");
    expect(content).toContain("https://artka.dev/privacy/");
  });

  it("follows llms.txt ordering and reserves H2 sections for linked file lists", () => {
    const tree = unified().use(remarkParse).parse(content);
    expect(tree.children[0]).toMatchObject({ type: "heading", depth: 1 });
    expect(tree.children[1]?.type).toBe("blockquote");
    const firstSection = tree.children.findIndex(
      (node) => node.type === "heading" && node.depth === 2,
    );
    expect(firstSection).toBeGreaterThan(1);
    for (const node of tree.children.slice(firstSection)) {
      if (node.type === "heading") {
        expect(node.depth).toBe(2);
      } else {
        expect(node.type).toBe("list");
        if (node.type !== "list") continue;
        for (const item of node.children) {
          expect(item.children[0]).toMatchObject({
            type: "paragraph",
            children: expect.arrayContaining([expect.objectContaining({ type: "link" })]),
          });
        }
      }
    }
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
    expect(body).toContain("**When to use artka.dev**");
    // Was "< 4096" for the static file; the generated index now enumerates every
    // post and twin, so the ceiling is raised (still a small index).
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
