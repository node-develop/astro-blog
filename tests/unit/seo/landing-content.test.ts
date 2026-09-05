import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load } from "~/lib/yaml";
import { describe, expect, it } from "vitest";

interface LandingFrontmatter {
  readonly title: string;
}

interface ArticleFrontmatter {
  readonly title: string;
  readonly description: string;
  readonly pubDate: Date;
  readonly tags: readonly string[];
  readonly draft: boolean;
  readonly cover: string;
  readonly summary: string;
  readonly coverAlt: string;
  readonly keywords: readonly string[];
  readonly lang: string;
  readonly sourceHash: string;
  readonly manuallyEdited: boolean;
  readonly faq: ReadonlyArray<{ readonly question: string; readonly answer: string }>;
}

const readFrontmatter = <T>(path: string): T => {
  const source = readFileSync(join(process.cwd(), path), "utf8");
  const yaml = source.match(/^---\s*\n([\s\S]*?)\n---/)?.[1];
  if (!yaml) throw new Error(`Missing frontmatter in ${path}`);
  return load(yaml) as T;
};

const readArticle = <T>(path: string): { readonly frontmatter: T; readonly body: string } => {
  const source = readFileSync(join(process.cwd(), path), "utf8");
  const frontmatterBlock = source.match(/^---\s*\n([\s\S]*?)\n---\n/);
  if (!frontmatterBlock?.[1]) throw new Error(`Missing frontmatter in ${path}`);
  return {
    frontmatter: load(frontmatterBlock[1]) as T,
    body: source.slice(frontmatterBlock[0].length),
  };
};

const visibleText = (html: string): string =>
  html
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replace(/\s+/g, " ")
    .trim();

describe("landing page headings", () => {
  const routes = [
    { route: "about", entry: "src/content/site/about.md" },
    { route: "en/about", entry: "src/content/site/en/about.md" },
    { route: "uses", entry: "src/content/site/uses.md" },
    { route: "en/uses", entry: "src/content/site/en/uses.md" },
    { route: "now", entry: "src/content/site/now.md" },
    { route: "en/now", entry: "src/content/site/en/now.md" },
  ] as const;

  it.each(routes)(
    "renders exactly one visible content-title H1 on /$route/",
    ({ route, entry }) => {
      const html = readFileSync(join(process.cwd(), "dist/client", route, "index.html"), "utf8");
      const headings = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((match) =>
        visibleText(match[1] ?? ""),
      );
      const frontmatter = readFrontmatter<LandingFrontmatter>(entry);

      expect(headings).toEqual([frontmatter.title]);
    },
  );
});

describe("English CLAUDE.md article metadata", () => {
  it("has the exact reviewed localization and preserves the pre-task body", () => {
    const { frontmatter: english, body } = readArticle<ArticleFrontmatter>(
      "src/content/posts/en/claude-md-12-rules.md",
    );
    const russian = readFrontmatter<ArticleFrontmatter>("src/content/posts/claude-md-12-rules.md");
    const localizedText = [
      english.title,
      english.description,
      english.summary,
      english.coverAlt,
      ...english.faq.flatMap((item) => [item.question, item.answer]),
    ];

    expect(english).toEqual({
      title: "12 Rules for CLAUDE.md: Extending Karpathy for 2026 Failure Modes",
      description:
        "Mnilax tested 12 CLAUDE.md rules across 30 codebases over six weeks, extending Karpathy's template for agent loops, checkpoints, and fail-loud behavior. This article explains the evidence.",
      pubDate: new Date("2026-05-10T00:00:00.000Z"),
      tags: ["ai", "claude-code", "prompt-engineering"],
      draft: false,
      cover: "/og-default.svg",
      coverAlt: "12 rules for CLAUDE.md — an extension of Karpathy's template",
      summary:
        "Karpathy proposed four CLAUDE.md rules in January. Mnilax expanded them to twelve for token budgets, checkpoints, fail-loud behavior, and newer coding-agent failure modes. Here is what the set covers and how to adopt it without bloating the file.",
      keywords: [
        "claude code",
        "claude.md",
        "karpathy claude rules",
        "prompt engineering",
        "coding agent reliability",
        "token budget agents",
        "multi-step ai workflows",
        "behavioral contract llm",
      ],
      faq: [
        {
          question: "Why use CLAUDE.md if Claude Code already reads project context?",
          answer:
            "CLAUDE.md establishes behavioral constraints before the model reads the code. Without it, Claude repeatedly guesses the stack, conventions, and prohibitions, consuming tokens and producing less consistent sessions. Anthropic describes the file as advisory, but an absent contract cannot guide behavior at all.",
        },
        {
          question: "Why expand the template to twelve rules if Karpathy's four were enough?",
          answer:
            "The original rules predated today's long multi-step agents, hook chains, and cross-session workflows. Mnilax's measurements attribute an additional reduction in errors to eight rules covering those newer failure modes while keeping compliance nearly unchanged.",
        },
        {
          question: "Can I copy someone else's CLAUDE.md and leave it unchanged?",
          answer:
            "It works only as a starting point. As a codebase evolves, generic rules drift away from reality. A useful CLAUDE.md is a behavioral contract for failures observed in the actual project and must evolve with that project.",
        },
        {
          question: "What should I do if my CLAUDE.md is already longer than 200 lines?",
          answer:
            "Move long stack, command, and subsystem references into imported documents. Keep the root CLAUDE.md focused on rules and brief context so important constraints are not buried in noise.",
        },
        {
          question: "Do these rules help in an API session without Claude Code?",
          answer:
            "Yes. Put the stable rules in the system prompt so they form a cache-friendly prefix. Budget, checkpoint, and fail-loud rules improve multi-step Anthropic SDK workflows even without the CLI.",
        },
      ],
      lang: "en",
      sourceHash: "07660cd4ad93b31d9b38e2ab5ed52708cccd60f9b4d74674d7e87502bd738457",
      manuallyEdited: true,
    });
    expect(english.title).not.toBe(russian.title);
    expect(localizedText.every((value) => value.trim().length > 0)).toBe(true);
    expect(localizedText.join("\n")).not.toMatch(/[А-Яа-яЁё]/);
    expect(createHash("sha256").update(body).digest("hex")).toBe(
      "057ef3a4fe8a5c934af855aa8e0c3e497d595cc575427c7874408f3446f0ffa5",
    );
  });
});
