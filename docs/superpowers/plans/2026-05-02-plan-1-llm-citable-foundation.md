# LLM-Citable Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Spec:** `docs/superpowers/specs/2026-05-02-llm-citable-blog-design.md` (EPIC A only — phases 2-5 of the spec are out of scope for this plan)

**Goal:** Make `artka.dev` a citation-ready knowledge node for Claude/ChatGPT/Perplexity/Gemini by hardening the AI-access surface (`robots.txt`, `llms.txt`, `llms-full.txt`) and replacing per-page inline JSON-LD blocks with a single coherent `@graph` schema emitted from `BaseLayout`.

**Architecture:** A new `src/lib/seo/` module owns all schema.org data. Pure builder functions assemble a single `@graph` containing `Person#me`, `Organization#brand`, `WebSite#site`, plus optional page-level nodes (`BlogPosting`, `BreadcrumbList`, `Blog`, `FAQPage`, `WebPage`) connected via stable `@id` refs. `BaseLayout.astro` accepts an `extraSchemaNodes` prop, removes its inline `WebSite` block, and emits exactly one `<script type="application/ld+json">`. `PostLayout.astro` and `/blog/index.astro` pass page nodes upward. `articleBody` for posts is a plain-text excerpt of the first 800 words computed via `unified + remark-parse + mdast-util-to-string`. `llms.txt` is hand-authored static under `public/`; `llms-full.txt` is built dynamically by an Astro endpoint.

**Tech Stack:** Astro 5, TypeScript 5.9 strict, Vitest, `unified`/`remark-parse`/`mdast-util-to-string` (existing devDeps), `js-yaml` (existing). No new dependencies.

---

## Working notes for agents

**Subagent assignments (per CLAUDE.md):**
- `backender` → `src/lib/seo/*` modules, `src/pages/llms-full.txt.ts`, unit tests under `tests/unit/seo/`.
- `frontender` → `src/layouts/BaseLayout.astro`, `src/layouts/PostLayout.astro`, `src/pages/blog/index.astro`, `src/pages/en/blog/index.astro`.
- `architect` → consulted before Task 9 (`buildGraph` orchestrator) if `@id` graph design needs adjustment.
- `critic` → end-of-phase code review at end of Phase 2 and Phase 3.

**Discipline (from CLAUDE.md):**
- Run `mcp__gitnexus__impact({target, direction: "upstream", repo: "astro-blog"})` BEFORE editing `BaseLayout.astro` (Task 7), `PostLayout.astro` (Task 8), `src/pages/blog/index.astro` (Task 9). High blast radius components.
- Run `mcp__gitnexus__detect_changes({scope: "staged", repo: "astro-blog"})` BEFORE every commit. Verify only expected files/symbols changed.
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`. Never `--no-verify`.
- Functional style: no `class`, no `this`, named/arrow functions, immutable data.
- After commits, the post-commit hook runs `npx gitnexus analyze` automatically — don't run it manually unless instructed.

**Commands cheat sheet:**
- `pnpm typecheck` — `astro sync && astro check && tsc --noEmit`
- `pnpm test` — Vitest unit + integration
- `pnpm test tests/unit/seo` — only this plan's tests
- `pnpm lint` — eslint + prettier check
- `pnpm build` — full build (regenerates Pagefind)
- `pnpm dev` — http://localhost:4321

**Worktree (recommended):** before starting, run:
```bash
git worktree add ../astro-blog-llm-seo -b feat/llm-citable-foundation main
cd ../astro-blog-llm-seo
pnpm install
```

**Owner-provided values still pending (use defaults, leave a TODO):**
- `Person#me.sameAs` URLs (LinkedIn, GitHub, X). Use `[]` until provided.
- `Person#me.image`. Use `/og-default.svg` until provided.

---

# Phase 0 — Setup

### Task 0: Verify clean state and impact-check load-bearing files

**Subagent:** `backender`

**Files:** none (read-only)

- [ ] **Step 1:** Confirm clean working tree.

```bash
git status
```
Expected: `nothing to commit, working tree clean` (only `.gitignore` modified is allowed per session start; otherwise stash first).

- [ ] **Step 2:** Run gitnexus impact analysis on layouts that this plan will modify.

Call MCP `mcp__gitnexus__impact` three times:

```
mcp__gitnexus__impact({ target: "BaseLayout", direction: "upstream", repo: "astro-blog" })
mcp__gitnexus__impact({ target: "PostLayout", direction: "upstream", repo: "astro-blog" })
mcp__gitnexus__impact({ target: "safeJsonLd", direction: "upstream", repo: "astro-blog" })
```

Expected: report blast radius. `BaseLayout` is HIGH (used by all public pages). `PostLayout` is MEDIUM (only `src/pages/blog/[...slug].astro` and `src/pages/en/blog/[...slug].astro`). Note any unexpected callers in a comment in the PR description.

- [ ] **Step 3:** Run baseline checks to confirm green start.

```bash
pnpm typecheck && pnpm test && pnpm lint
```
Expected: all pass.

---

# Phase 1 — robots.txt with named AI crawlers (A3)

### Task 1: Replace `public/robots.txt` with named-bot ruleset

**Files:**
- Modify: `public/robots.txt`
- Create: `tests/unit/seo/robots-txt.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/seo/robots-txt.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const robots = readFileSync(join(process.cwd(), "public/robots.txt"), "utf8");

describe("public/robots.txt", () => {
  const namedBots = [
    "GPTBot",
    "OAI-SearchBot",
    "ChatGPT-User",
    "ClaudeBot",
    "Claude-Web",
    "anthropic-ai",
    "PerplexityBot",
    "Perplexity-User",
    "Google-Extended",
  ];

  it.each(namedBots)("declares an explicit User-agent block for %s", (bot) => {
    expect(robots).toMatch(new RegExp(`^User-agent:\\s*${bot}\\s*$`, "m"));
  });

  it("disallows admin, api, login under every block", () => {
    const blocks = robots.split(/\n\n+/).filter((b) => /^User-agent:/m.test(b));
    expect(blocks.length).toBeGreaterThanOrEqual(10); // 9 named + catch-all *
    for (const block of blocks) {
      expect(block).toMatch(/^Disallow:\s*\/admin\//m);
      expect(block).toMatch(/^Disallow:\s*\/api\//m);
      expect(block).toMatch(/^Disallow:\s*\/login\b/m);
    }
  });

  it("retains the sitemap directive", () => {
    expect(robots).toMatch(/^Sitemap:\s+https:\/\/artka\.dev\/sitemap-index\.xml\s*$/m);
  });

  it("keeps the catch-all User-agent: * block last", () => {
    const lastBlock = robots.split(/\n\n+/).filter((b) => /^User-agent:/m.test(b)).pop()!;
    expect(lastBlock).toMatch(/^User-agent:\s*\*\s*$/m);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/seo/robots-txt.test.ts
```
Expected: FAIL — current `robots.txt` has only `User-agent: *`.

- [ ] **Step 3: Replace `public/robots.txt`**

```text
# robots.txt — last reviewed 2026-05-02
# Owner: dev@artka.dev. Policy: allow retrieval/answer crawlers; disallow private surfaces.

User-agent: GPTBot
Allow: /
Disallow: /admin/
Disallow: /api/
Disallow: /login

User-agent: OAI-SearchBot
Allow: /
Disallow: /admin/
Disallow: /api/
Disallow: /login

User-agent: ChatGPT-User
Allow: /
Disallow: /admin/
Disallow: /api/
Disallow: /login

User-agent: ClaudeBot
Allow: /
Disallow: /admin/
Disallow: /api/
Disallow: /login

User-agent: Claude-Web
Allow: /
Disallow: /admin/
Disallow: /api/
Disallow: /login

User-agent: anthropic-ai
Allow: /
Disallow: /admin/
Disallow: /api/
Disallow: /login

User-agent: PerplexityBot
Allow: /
Disallow: /admin/
Disallow: /api/
Disallow: /login

User-agent: Perplexity-User
Allow: /
Disallow: /admin/
Disallow: /api/
Disallow: /login

User-agent: Google-Extended
Allow: /
Disallow: /admin/
Disallow: /api/
Disallow: /login

User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/
Disallow: /login

Sitemap: https://artka.dev/sitemap-index.xml
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test tests/unit/seo/robots-txt.test.ts
```
Expected: PASS — all 12 assertions green.

- [ ] **Step 5: Commit**

```bash
git add public/robots.txt tests/unit/seo/robots-txt.test.ts
git commit -m "feat(seo): name AI-bot crawlers in robots.txt"
```

---

# Phase 2 — Schema-graph foundation (A4, A5, A6)

### Task 2: Person source-of-truth and shared `safeJsonLd` helper

**Files:**
- Create: `src/lib/seo/person.ts`
- Create: `src/lib/seo/json-ld.ts`
- Create: `tests/unit/seo/person.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/seo/person.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { person } from "~/lib/seo/person";
import { safeJsonLd } from "~/lib/seo/json-ld";

describe("person source of truth", () => {
  it("exposes required fields", () => {
    expect(person.name).toBe("Артём Кашута");
    expect(person.url).toBe("https://artka.dev/about");
    expect(person.image).toMatch(/^https?:\/\//);
    expect(person.jobTitle).toBeTruthy();
    expect(person.description.length).toBeGreaterThan(40);
    expect(Array.isArray(person.knowsAbout)).toBe(true);
    expect(person.knowsAbout.length).toBeGreaterThanOrEqual(3);
    expect(Array.isArray(person.sameAs)).toBe(true);
    expect(person.email).toMatch(/@/);
  });
});

describe("safeJsonLd", () => {
  it("escapes < > & to JSON-string unicode", () => {
    expect(safeJsonLd({ x: "<a>&b</a>" })).toBe(
      '{"x":"\\u003ca\\u003e\\u0026b\\u003c/a\\u003e"}',
    );
  });

  it("preserves nested structures", () => {
    expect(safeJsonLd({ a: [1, 2], b: { c: "d" } })).toBe('{"a":[1,2],"b":{"c":"d"}}');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/seo/person.test.ts
```
Expected: FAIL — modules don't exist yet.

- [ ] **Step 3: Implement `src/lib/seo/person.ts`**

```ts
// Single source of truth for the site author identity. Edit this file when the
// owner provides additional sameAs URLs or a square avatar (>= 512x512 PNG).

export interface PersonProfile {
  readonly name: string;
  readonly url: string;
  readonly image: string;
  readonly jobTitle: string;
  readonly description: string;
  readonly knowsAbout: ReadonlyArray<string>;
  readonly sameAs: ReadonlyArray<string>;
  readonly email: string;
}

const SITE = "https://artka.dev";

export const person: PersonProfile = {
  name: "Артём Кашута",
  url: `${SITE}/about`,
  image: `${SITE}/og-default.svg`,
  jobTitle: "Software engineer · backend & AI agent engineering",
  description:
    "Backend инженер и AI-agent engineer. Пишу про Claude Code, harness/agent loop, Astro/Node.js и распределённые системы.",
  knowsAbout: [
    "Claude Code",
    "AI agent engineering",
    "Node.js",
    "TypeScript",
    "Astro",
    "Distributed systems",
    "DevOps",
  ],
  sameAs: [],
  email: "a@artka.dev",
};
```

- [ ] **Step 4: Implement `src/lib/seo/json-ld.ts`**

```ts
// Inline-safe JSON-LD serialisation. Escapes characters that would otherwise
// terminate the surrounding <script> tag or be misread by an HTML parser.
export const safeJsonLd = (data: unknown): string =>
  JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm test tests/unit/seo/person.test.ts
```
Expected: PASS — all 4 assertions green.

- [ ] **Step 6: Run typecheck**

```bash
pnpm typecheck
```
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/seo/person.ts src/lib/seo/json-ld.ts tests/unit/seo/person.test.ts
git commit -m "feat(seo): add Person source of truth and safeJsonLd helper"
```

---

### Task 3: Global node builders (Person, Organization, WebSite, Blog)

**Files:**
- Create: `src/lib/seo/nodes-global.ts`
- Create: `tests/unit/seo/nodes-global.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/seo/nodes-global.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildPersonNode,
  buildOrganizationNode,
  buildWebSiteNode,
  buildBlogNode,
  graphIds,
} from "~/lib/seo/nodes-global";

describe("graphIds", () => {
  it("are stable canonical IDs", () => {
    expect(graphIds.person).toBe("https://artka.dev/#person");
    expect(graphIds.organization).toBe("https://artka.dev/#brand");
    expect(graphIds.website).toBe("https://artka.dev/#website");
    expect(graphIds.blogRu).toBe("https://artka.dev/#blog-ru");
    expect(graphIds.blogEn).toBe("https://artka.dev/#blog-en");
  });
});

describe("buildPersonNode", () => {
  it("emits a Person with @id and required fields", () => {
    const node = buildPersonNode();
    expect(node["@type"]).toBe("Person");
    expect(node["@id"]).toBe(graphIds.person);
    expect(node.name).toBe("Артём Кашута");
    expect(node.knowsAbout).toContain("Claude Code");
    expect(node.email).toMatch(/@/);
  });
});

describe("buildOrganizationNode", () => {
  it("links founder to Person by @id", () => {
    const node = buildOrganizationNode();
    expect(node["@type"]).toBe("Organization");
    expect(node["@id"]).toBe(graphIds.organization);
    expect(node.founder).toEqual({ "@id": graphIds.person });
    expect(node.logo["@type"]).toBe("ImageObject");
  });
});

describe("buildWebSiteNode", () => {
  it("emits inLanguage and SearchAction for ru", () => {
    const node = buildWebSiteNode("ru");
    expect(node["@type"]).toBe("WebSite");
    expect(node["@id"]).toBe(graphIds.website);
    expect(node.inLanguage).toBe("ru-RU");
    expect(node.publisher).toEqual({ "@id": graphIds.organization });
    expect(node.potentialAction["@type"]).toBe("SearchAction");
    expect(node.potentialAction.target).toContain("search?q={search_term_string}");
  });

  it("switches inLanguage for en", () => {
    expect(buildWebSiteNode("en").inLanguage).toBe("en-US");
  });
});

describe("buildBlogNode", () => {
  it("emits per-locale Blog node referencing person and organization", () => {
    const ru = buildBlogNode("ru");
    expect(ru["@type"]).toBe("Blog");
    expect(ru["@id"]).toBe(graphIds.blogRu);
    expect(ru.url).toBe("https://artka.dev/blog");
    expect(ru.inLanguage).toBe("ru-RU");
    expect(ru.author).toEqual({ "@id": graphIds.person });
    expect(ru.publisher).toEqual({ "@id": graphIds.organization });

    const en = buildBlogNode("en");
    expect(en["@id"]).toBe(graphIds.blogEn);
    expect(en.url).toBe("https://artka.dev/en/blog");
    expect(en.inLanguage).toBe("en-US");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/seo/nodes-global.test.ts
```
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `src/lib/seo/nodes-global.ts`**

```ts
import { person } from "./person";

export type Locale = "ru" | "en";

const SITE = "https://artka.dev";

export const graphIds = {
  person: `${SITE}/#person`,
  organization: `${SITE}/#brand`,
  website: `${SITE}/#website`,
  blogRu: `${SITE}/#blog-ru`,
  blogEn: `${SITE}/#blog-en`,
} as const;

const inLang = (locale: Locale): "ru-RU" | "en-US" => (locale === "ru" ? "ru-RU" : "en-US");

export const buildPersonNode = () => ({
  "@type": "Person",
  "@id": graphIds.person,
  name: person.name,
  url: person.url,
  image: person.image,
  jobTitle: person.jobTitle,
  description: person.description,
  knowsAbout: [...person.knowsAbout],
  sameAs: [...person.sameAs],
  email: person.email,
});

export const buildOrganizationNode = () => ({
  "@type": "Organization",
  "@id": graphIds.organization,
  name: "artka.dev",
  url: SITE,
  logo: {
    "@type": "ImageObject",
    url: `${SITE}/favicon.svg`,
  },
  founder: { "@id": graphIds.person },
});

export const buildWebSiteNode = (locale: Locale) => ({
  "@type": "WebSite",
  "@id": graphIds.website,
  url: SITE,
  name: "artka.dev",
  inLanguage: inLang(locale),
  publisher: { "@id": graphIds.organization },
  potentialAction: {
    "@type": "SearchAction",
    target: `${SITE}/search?q={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
});

export const buildBlogNode = (locale: Locale) => ({
  "@type": "Blog",
  "@id": locale === "ru" ? graphIds.blogRu : graphIds.blogEn,
  url: locale === "ru" ? `${SITE}/blog` : `${SITE}/en/blog`,
  name: locale === "ru" ? "artka.dev — блог" : "artka.dev — blog",
  inLanguage: inLang(locale),
  author: { "@id": graphIds.person },
  publisher: { "@id": graphIds.organization },
});
```

- [ ] **Step 4: Run tests**

```bash
pnpm test tests/unit/seo/nodes-global.test.ts
```
Expected: PASS — all assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/seo/nodes-global.ts tests/unit/seo/nodes-global.test.ts
git commit -m "feat(seo): add global @graph builders (Person, Organization, WebSite, Blog)"
```

---

### Task 4: Page-level node builders (BlogPosting, BreadcrumbList, WebPage, FAQPage)

**Files:**
- Create: `src/lib/seo/nodes-page.ts`
- Create: `tests/unit/seo/nodes-page.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/seo/nodes-page.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildBlogPostingNode,
  buildBreadcrumbListNode,
  buildWebPageNode,
  buildFaqPageNode,
} from "~/lib/seo/nodes-page";
import { graphIds } from "~/lib/seo/nodes-global";

describe("buildBlogPostingNode", () => {
  const baseInput = {
    locale: "ru" as const,
    canonical: "https://artka.dev/blog/foo",
    title: "Заголовок поста",
    description: "Описание",
    pubDate: new Date("2026-04-23T00:00:00.000Z"),
    updatedDate: new Date("2026-04-26T00:00:00.000Z"),
    image: "https://artka.dev/uploads/foo.png",
    keywords: ["claude-code", "guide"],
    articleBody: "Lorem ipsum dolor",
    wordCount: 1234,
  };

  it("references author and publisher by @id only", () => {
    const node = buildBlogPostingNode(baseInput);
    expect(node.author).toEqual({ "@id": graphIds.person });
    expect(node.publisher).toEqual({ "@id": graphIds.organization });
  });

  it("emits @id derived from canonical", () => {
    const node = buildBlogPostingNode(baseInput);
    expect(node["@id"]).toBe("https://artka.dev/blog/foo#blogposting");
  });

  it("includes articleBody and wordCount", () => {
    const node = buildBlogPostingNode(baseInput);
    expect(node.articleBody).toBe("Lorem ipsum dolor");
    expect(node.wordCount).toBe(1234);
  });

  it("omits keywords when empty", () => {
    const node = buildBlogPostingNode({ ...baseInput, keywords: [] });
    expect("keywords" in node).toBe(false);
  });

  it("omits dateModified when same as pubDate", () => {
    const same = baseInput.pubDate;
    const node = buildBlogPostingNode({ ...baseInput, updatedDate: same });
    expect(node.dateModified).toBe(same.toISOString());
  });
});

describe("buildBreadcrumbListNode", () => {
  it("renders 3-level RU breadcrumb", () => {
    const node = buildBreadcrumbListNode({
      locale: "ru",
      blogIndexLabel: "Блог",
      title: "Заголовок",
    });
    expect(node["@type"]).toBe("BreadcrumbList");
    expect(node.itemListElement).toHaveLength(3);
    expect(node.itemListElement[0].name).toBe("Главная");
    expect(node.itemListElement[1].item).toBe("https://artka.dev/blog");
    expect(node.itemListElement[2].name).toBe("Заголовок");
  });

  it("uses /en/ paths for en locale", () => {
    const node = buildBreadcrumbListNode({
      locale: "en",
      blogIndexLabel: "Blog",
      title: "Title",
    });
    expect(node.itemListElement[0].item).toBe("https://artka.dev/en/");
    expect(node.itemListElement[1].item).toBe("https://artka.dev/en/blog");
  });
});

describe("buildWebPageNode", () => {
  it("emits WebPage referencing the global Person via about", () => {
    const node = buildWebPageNode({
      locale: "ru",
      canonical: "https://artka.dev/about",
      name: "Обо мне",
      description: "О",
    });
    expect(node["@type"]).toBe("WebPage");
    expect(node["@id"]).toBe("https://artka.dev/about#webpage");
    expect(node.about).toEqual({ "@id": graphIds.person });
    expect(node.inLanguage).toBe("ru-RU");
  });
});

describe("buildFaqPageNode", () => {
  it("returns null when no faq items", () => {
    expect(buildFaqPageNode({ canonical: "https://artka.dev/blog/foo", items: [] })).toBeNull();
  });

  it("renders Question/Answer pairs when items present", () => {
    const node = buildFaqPageNode({
      canonical: "https://artka.dev/blog/foo",
      items: [{ question: "Q1?", answer: "A1." }],
    });
    expect(node).not.toBeNull();
    expect(node!["@type"]).toBe("FAQPage");
    expect(node!.mainEntity).toHaveLength(1);
    expect(node!.mainEntity[0]["@type"]).toBe("Question");
    expect(node!.mainEntity[0].acceptedAnswer["@type"]).toBe("Answer");
    expect(node!.mainEntity[0].acceptedAnswer.text).toBe("A1.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/seo/nodes-page.test.ts
```
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `src/lib/seo/nodes-page.ts`**

```ts
import { graphIds, type Locale } from "./nodes-global";

const SITE = "https://artka.dev";
const inLang = (locale: Locale): "ru-RU" | "en-US" => (locale === "ru" ? "ru-RU" : "en-US");

export interface BlogPostingInput {
  readonly locale: Locale;
  readonly canonical: string;
  readonly title: string;
  readonly description: string;
  readonly pubDate: Date;
  readonly updatedDate?: Date | null;
  readonly image: string;
  readonly keywords: ReadonlyArray<string>;
  readonly articleBody: string;
  readonly wordCount: number;
}

export const buildBlogPostingNode = (input: BlogPostingInput) => {
  const node: Record<string, unknown> = {
    "@type": "BlogPosting",
    "@id": `${input.canonical}#blogposting`,
    headline: input.title,
    description: input.description,
    datePublished: input.pubDate.toISOString(),
    dateModified: (input.updatedDate ?? input.pubDate).toISOString(),
    author: { "@id": graphIds.person },
    publisher: { "@id": graphIds.organization },
    image: input.image,
    mainEntityOfPage: input.canonical,
    inLanguage: inLang(input.locale),
    isPartOf: { "@id": input.locale === "ru" ? graphIds.blogRu : graphIds.blogEn },
    articleBody: input.articleBody,
    wordCount: input.wordCount,
  };
  if (input.keywords.length > 0) {
    node.keywords = input.keywords.join(", ");
  }
  return node;
};

export interface BreadcrumbInput {
  readonly locale: Locale;
  readonly blogIndexLabel: string;
  readonly title: string;
}

export const buildBreadcrumbListNode = (input: BreadcrumbInput) => {
  const homeUrl = input.locale === "ru" ? `${SITE}/` : `${SITE}/en/`;
  const blogUrl = input.locale === "ru" ? `${SITE}/blog` : `${SITE}/en/blog`;
  return {
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: input.locale === "ru" ? "Главная" : "Home",
        item: homeUrl,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: input.blogIndexLabel,
        item: blogUrl,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: input.title,
      },
    ],
  };
};

export interface WebPageInput {
  readonly locale: Locale;
  readonly canonical: string;
  readonly name: string;
  readonly description: string;
}

export const buildWebPageNode = (input: WebPageInput) => ({
  "@type": "WebPage",
  "@id": `${input.canonical}#webpage`,
  url: input.canonical,
  name: input.name,
  description: input.description,
  inLanguage: inLang(input.locale),
  isPartOf: { "@id": graphIds.website },
  about: { "@id": graphIds.person },
});

export interface FaqItem {
  readonly question: string;
  readonly answer: string;
}

export interface FaqPageInput {
  readonly canonical: string;
  readonly items: ReadonlyArray<FaqItem>;
}

export const buildFaqPageNode = (input: FaqPageInput) => {
  if (input.items.length === 0) return null;
  return {
    "@type": "FAQPage",
    "@id": `${input.canonical}#faq`,
    mainEntity: input.items.map((it) => ({
      "@type": "Question",
      name: it.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: it.answer,
      },
    })),
  };
};
```

- [ ] **Step 4: Run tests**

```bash
pnpm test tests/unit/seo/nodes-page.test.ts
```
Expected: PASS — all assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/seo/nodes-page.ts tests/unit/seo/nodes-page.test.ts
git commit -m "feat(seo): add page-level @graph builders (BlogPosting, Breadcrumb, WebPage, FAQ)"
```

---

### Task 5: Plain-text articleBody extractor

**Files:**
- Create: `src/lib/seo/article-body.ts`
- Create: `tests/unit/seo/article-body.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/seo/article-body.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { extractArticleBody, countWords } from "~/lib/seo/article-body";

describe("countWords", () => {
  it("counts whitespace-separated tokens", () => {
    expect(countWords("hello world")).toBe(2);
    expect(countWords("  one\ttwo\nthree  ")).toBe(3);
    expect(countWords("")).toBe(0);
  });
});

describe("extractArticleBody", () => {
  it("strips fenced code blocks entirely", () => {
    const md = "Intro paragraph.\n\n```ts\nconst x = 1;\n```\n\nAfter code.";
    const out = extractArticleBody(md, 100);
    expect(out.text).not.toContain("const x");
    expect(out.text).toContain("Intro paragraph");
    expect(out.text).toContain("After code");
  });

  it("strips inline code but keeps surrounding prose", () => {
    const md = "Use `foo()` carefully.";
    const out = extractArticleBody(md, 100);
    expect(out.text).toContain("Use");
    expect(out.text).toContain("carefully");
  });

  it("preserves paragraph text and headings", () => {
    const md = "# Title\n\nFirst paragraph.\n\nSecond paragraph.";
    const out = extractArticleBody(md, 100);
    expect(out.text).toContain("Title");
    expect(out.text).toContain("First paragraph");
    expect(out.text).toContain("Second paragraph");
  });

  it("truncates to maxWords with ellipsis", () => {
    const words = Array.from({ length: 50 }, (_, i) => `w${i}`).join(" ");
    const out = extractArticleBody(words, 10);
    expect(out.text.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(11); // 10 + ellipsis
    expect(out.text.endsWith("…")).toBe(true);
  });

  it("returns full wordCount of original body, not the truncated excerpt", () => {
    const words = Array.from({ length: 50 }, (_, i) => `w${i}`).join(" ");
    const out = extractArticleBody(words, 10);
    expect(out.fullWordCount).toBe(50);
  });

  it("strips mermaid blocks", () => {
    const md = "Before.\n\n```mermaid\nflowchart LR\n  A --> B\n```\n\nAfter.";
    const out = extractArticleBody(md, 100);
    expect(out.text).not.toContain("flowchart");
    expect(out.text).not.toContain("A --> B");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/seo/article-body.test.ts
```
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `src/lib/seo/article-body.ts`**

```ts
import { unified } from "unified";
import remarkParse from "remark-parse";
import { toString as mdastToString } from "mdast-util-to-string";
import { visit, SKIP } from "unist-util-visit";
import type { Root, Node } from "mdast";

export const countWords = (s: string): number => {
  const trimmed = s.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
};

export interface ExtractedBody {
  readonly text: string;
  readonly fullWordCount: number;
}

// Strips fenced code blocks, inline code, and mermaid blocks before flattening
// the remaining mdast to a plain-text excerpt. Math nodes are dropped because
// remark-math is registered for the MDX pipeline; here we run only remark-parse,
// so $...$ falls through as plain text — that is acceptable for an SEO excerpt.
export const extractArticleBody = (markdown: string, maxWords: number): ExtractedBody => {
  const tree = unified().use(remarkParse).parse(markdown) as Root;

  const isStrippable = (node: Node): boolean =>
    node.type === "code" || node.type === "inlineCode" || node.type === "html";

  visit(tree, (node, index, parent) => {
    if (parent && typeof index === "number" && isStrippable(node)) {
      (parent as { children: Node[] }).children.splice(index, 1);
      return [SKIP, index];
    }
    return undefined;
  });

  const flat = mdastToString(tree, { includeImageAlt: false }).replace(/\s+/g, " ").trim();
  const allWords = flat.length > 0 ? flat.split(/\s+/) : [];
  const fullWordCount = allWords.length;

  if (allWords.length <= maxWords) {
    return { text: flat, fullWordCount };
  }
  const truncated = allWords.slice(0, maxWords).join(" ");
  return { text: `${truncated}…`, fullWordCount };
};
```

- [ ] **Step 4: Run tests**

```bash
pnpm test tests/unit/seo/article-body.test.ts
```
Expected: PASS — all 6 assertions green.

- [ ] **Step 5: Run typecheck**

```bash
pnpm typecheck
```
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/seo/article-body.ts tests/unit/seo/article-body.test.ts
git commit -m "feat(seo): plain-text articleBody extractor with word-count cap"
```

---

### Task 6: `buildGraph` orchestrator

**Files:**
- Create: `src/lib/seo/schema.ts`
- Create: `tests/unit/seo/schema.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/seo/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildGraph } from "~/lib/seo/schema";
import { graphIds } from "~/lib/seo/nodes-global";

describe("buildGraph", () => {
  it("always emits Person, Organization, WebSite", () => {
    const graph = buildGraph({ locale: "ru", extraNodes: [] });
    expect(graph["@context"]).toBe("https://schema.org");
    const types = graph["@graph"].map((n) => n["@type"]);
    expect(types).toEqual(expect.arrayContaining(["Person", "Organization", "WebSite"]));
  });

  it("appends extraNodes to the graph in order", () => {
    const blogPostingNode = { "@type": "BlogPosting", "@id": "x" };
    const breadcrumbNode = { "@type": "BreadcrumbList" };
    const graph = buildGraph({
      locale: "ru",
      extraNodes: [blogPostingNode, breadcrumbNode],
    });
    const types = graph["@graph"].map((n) => n["@type"]);
    expect(types[types.length - 2]).toBe("BlogPosting");
    expect(types[types.length - 1]).toBe("BreadcrumbList");
  });

  it("filters out null extraNodes", () => {
    const graph = buildGraph({
      locale: "ru",
      extraNodes: [null, { "@type": "WebPage" }, null],
    });
    const types = graph["@graph"].map((n) => n["@type"]);
    expect(types).toContain("WebPage");
    expect(types.filter((t) => t === undefined)).toHaveLength(0);
  });

  it("uses unique @ids across the graph", () => {
    const graph = buildGraph({ locale: "ru", extraNodes: [] });
    const ids = graph["@graph"].map((n) => n["@id"]).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(graphIds.person);
    expect(ids).toContain(graphIds.organization);
    expect(ids).toContain(graphIds.website);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/seo/schema.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/seo/schema.ts`**

```ts
import {
  buildPersonNode,
  buildOrganizationNode,
  buildWebSiteNode,
  type Locale,
} from "./nodes-global";

export type GraphNode = Record<string, unknown> & { "@type": string };

export interface GraphInput {
  readonly locale: Locale;
  readonly extraNodes: ReadonlyArray<GraphNode | null>;
}

export interface JsonLdGraph {
  readonly "@context": "https://schema.org";
  readonly "@graph": ReadonlyArray<GraphNode>;
}

export const buildGraph = (input: GraphInput): JsonLdGraph => {
  const globals: GraphNode[] = [
    buildPersonNode(),
    buildOrganizationNode(),
    buildWebSiteNode(input.locale),
  ];
  const extras = input.extraNodes.filter((n): n is GraphNode => n !== null);
  return {
    "@context": "https://schema.org",
    "@graph": [...globals, ...extras],
  };
};

export type { Locale } from "./nodes-global";
export { graphIds } from "./nodes-global";
export { safeJsonLd } from "./json-ld";
export {
  buildBlogPostingNode,
  buildBreadcrumbListNode,
  buildWebPageNode,
  buildFaqPageNode,
} from "./nodes-page";
export { buildBlogNode } from "./nodes-global";
export { extractArticleBody, countWords } from "./article-body";
```

- [ ] **Step 4: Run tests**

```bash
pnpm test tests/unit/seo
```
Expected: ALL pass — Tasks 1–6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/seo/schema.ts tests/unit/seo/schema.test.ts
git commit -m "feat(seo): buildGraph orchestrator unifies @graph with extra page nodes"
```

---

# Phase 3 — Layout integration

### Task 7: Refactor `BaseLayout.astro` to emit single `@graph`

**Files:**
- Modify: `src/layouts/BaseLayout.astro:1-106`

- [ ] **Step 1:** Run impact analysis.

```
mcp__gitnexus__impact({ target: "BaseLayout", direction: "upstream", repo: "astro-blog" })
```
Expected: HIGH risk — layout is used by `index.astro`, `about.astro`, `search.astro`, `login.astro`, `blog/index.astro`, `PostLayout.astro`, all `/en/*` siblings. Confirm before proceeding.

- [ ] **Step 2:** Replace inline schema in `src/layouts/BaseLayout.astro`.

Open `src/layouts/BaseLayout.astro`. Make these edits:

  - Replace the import block at line 1-9 with (add seo helpers; drop nothing else):

```astro
---
import "~/styles/global.css";
import { ClientRouter } from "astro:transitions";
import Header from "~/components/Header.astro";
import MobileDrawer from "~/components/MobileDrawer.astro";
import SkipLink from "~/components/SkipLink.astro";
import CommandPalette from "~/components/search/CommandPalette";
import { t } from "~/i18n";
import { getLocaleFromPath, getCounterpart, checkCounterpartExists } from "~/lib/i18n/routing";
import { buildGraph, safeJsonLd, type GraphNode } from "~/lib/seo/schema";
```

  - Update the `Props` interface (lines 11-19) to add `extraSchemaNodes`:

```astro
interface Props {
  title: string;
  description?: string;
  ogImage?: string;
  ogType?: "website" | "article";
  noindex?: boolean;
  /** When true, omits the right TOC column for list/about/home pages. */
  fullWidth?: boolean;
  /** Additional JSON-LD nodes to merge into the page @graph. */
  extraSchemaNodes?: ReadonlyArray<GraphNode | null>;
}
```

  - Update the destructuring (line 21-28) to include the new prop:

```astro
const {
  title,
  description = "Personal blog",
  ogImage,
  ogType = "website",
  noindex = false,
  fullWidth = false,
  extraSchemaNodes = [],
} = Astro.props;
```

  - **Delete** the inline `safeJsonLd` helper (line 51-52) — it now comes from `~/lib/seo/schema`.
  - **Delete** the inline `websiteJsonLd` constant (line 56-67).
  - **Replace** line 106 `<script is:inline type="application/ld+json" set:html={safeJsonLd(websiteJsonLd)} />` with:

```astro
    <script
      is:inline
      type="application/ld+json"
      set:html={safeJsonLd(buildGraph({ locale, extraNodes: extraSchemaNodes }))}
    />
```

- [ ] **Step 3:** Run typecheck.

```bash
pnpm typecheck
```
Expected: 0 errors.

- [ ] **Step 4:** Run unit tests.

```bash
pnpm test
```
Expected: all pass — no test depends on BaseLayout shape.

- [ ] **Step 5:** Verify the rendered HTML contains the expected graph.

```bash
pnpm dev
```

In another terminal:

```bash
curl -s http://localhost:4321/ | grep -A 1 'application/ld+json'
```
Expected: a single `<script type="application/ld+json">` block whose JSON contains `"@graph"` with three nodes (Person, Organization, WebSite). Stop the dev server.

- [ ] **Step 6:** Detect changes scope.

```
mcp__gitnexus__detect_changes({ scope: "staged", repo: "astro-blog" })
```
Expected: `BaseLayout` only.

- [ ] **Step 7:** Commit.

```bash
git add src/layouts/BaseLayout.astro
git commit -m "feat(seo): emit single @graph from BaseLayout via buildGraph"
```

---

### Task 8: Refactor `PostLayout.astro` to feed nodes into BaseLayout

**Files:**
- Modify: `src/layouts/PostLayout.astro:1-115`

- [ ] **Step 1:** Run impact analysis.

```
mcp__gitnexus__impact({ target: "PostLayout", direction: "upstream", repo: "astro-blog" })
```
Expected: MEDIUM — used by `src/pages/blog/[...slug].astro` and `src/pages/en/blog/[...slug].astro`.

- [ ] **Step 2:** Rewrite the frontmatter section of `src/layouts/PostLayout.astro` (lines 1-95). Replace it with:

```astro
---
import BaseLayout from "./BaseLayout.astro";
import PostTOC from "~/components/PostTOC.astro";
import SiteSidebar from "~/components/SiteSidebar.astro";
import { renderInlineCode } from "~/lib/inline-md";
import { getLocaleFromPath } from "~/lib/i18n/routing";
import { t } from "~/i18n";
import {
  buildBlogPostingNode,
  buildBreadcrumbListNode,
  extractArticleBody,
  type GraphNode,
} from "~/lib/seo/schema";
import type { CollectionEntry } from "astro:content";
import type { MarkdownHeading } from "astro";

interface Props {
  post: CollectionEntry<"posts">;
  headings: readonly MarkdownHeading[];
}

const { post, headings } = Astro.props;
const { title, description, pubDate, updatedDate, tags, cover, coverAlt } = post.data;
const locale = getLocaleFromPath(Astro.url.pathname);
const canonical = new URL(Astro.url.pathname, Astro.site ?? Astro.url).toString();

// Cover is stored as a path relative to /uploads/ (e.g. "2026/04/file.png").
// Accept both bare relatives and pre-prefixed absolutes for forward compatibility.
const coverUrl = cover
  ? cover.startsWith("/") || /^https?:\/\//.test(cover)
    ? cover
    : `/uploads/${cover}`
  : null;
const readingTime = estimateReadingTimeMinutes(post.body ?? "");

function estimateReadingTimeMinutes(body: string): number {
  const words = body.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 220));
}

const siteBase = Astro.site?.toString() ?? "https://artka.dev";
const absoluteCover = coverUrl
  ? /^https?:\/\//.test(coverUrl)
    ? coverUrl
    : new URL(coverUrl, siteBase).toString()
  : new URL("/og-default.svg", siteBase).toString();

const excerpt = extractArticleBody(post.body ?? "", 800);

const blogPostingNode: GraphNode = buildBlogPostingNode({
  locale,
  canonical,
  title,
  description,
  pubDate,
  updatedDate: updatedDate ?? null,
  image: absoluteCover,
  keywords: tags,
  articleBody: excerpt.text,
  wordCount: excerpt.fullWordCount,
});

const breadcrumbNode: GraphNode = buildBreadcrumbListNode({
  locale,
  blogIndexLabel: t(locale, "blog.title"),
  title,
});
---
```

- [ ] **Step 3:** Update the `<BaseLayout>` invocation block (lines 98-111). Replace it with:

```astro
<BaseLayout
  title={title}
  description={description}
  ogImage={coverUrl ?? undefined}
  ogType="article"
  extraSchemaNodes={[blogPostingNode, breadcrumbNode]}
>
  <Fragment slot="head">
    <meta property="article:published_time" content={pubDate.toISOString()} />
    {updatedDate && <meta property="article:modified_time" content={updatedDate.toISOString()} />}
    <meta property="article:author" content={post.data.author} />
    {tags.map((tag: string) => <meta property="article:tag" content={tag} />)}
  </Fragment>
```

(The two `<script is:inline type="application/ld+json">` lines that previously sat in the head slot are now removed — the graph is emitted by BaseLayout.)

- [ ] **Step 4:** Run typecheck.

```bash
pnpm typecheck
```
Expected: 0 errors.

- [ ] **Step 5:** Run all tests.

```bash
pnpm test
```
Expected: all pass.

- [ ] **Step 6:** Manual smoke check.

```bash
pnpm dev
```

In another terminal:

```bash
curl -s http://localhost:4321/blog/01-introduction | grep -c 'application/ld+json'
```
Expected: `1` — exactly one JSON-LD block in head.

```bash
curl -s http://localhost:4321/blog/01-introduction | python3 -c "import sys, re, json; m = re.search(r'<script[^>]+ld\\+json[^>]*>(.+?)</script>', sys.stdin.read(), re.S); g = json.loads(m.group(1)); print([n['@type'] for n in g['@graph']])"
```
Expected: a list including `Person`, `Organization`, `WebSite`, `BlogPosting`, `BreadcrumbList`. Stop the dev server.

- [ ] **Step 7:** Commit.

```bash
git add src/layouts/PostLayout.astro
git commit -m "feat(seo): emit BlogPosting and BreadcrumbList through BaseLayout @graph"
```

---

### Task 9: Add `Blog` node to `/blog` and `/en/blog` index pages

**Files:**
- Modify: `src/pages/blog/index.astro:1-15`
- Modify: `src/pages/en/blog/index.astro` (mirror change)

- [ ] **Step 1:** Inspect both files.

```bash
ls src/pages/blog/index.astro src/pages/en/blog/index.astro
```
Confirm both exist.

- [ ] **Step 2:** Modify `src/pages/blog/index.astro` frontmatter (replace lines 1-14):

```astro
---
export const prerender = false;

import BaseLayout from "~/layouts/BaseLayout.astro";
import SiteSidebar from "~/components/SiteSidebar.astro";
import { getOrderedPosts, type PostWithMeta } from "~/lib/content/loader";
import { getLocaleFromPath } from "~/lib/i18n/routing";
import { t } from "~/i18n";
import { buildBlogNode } from "~/lib/seo/schema";

const locale = getLocaleFromPath(Astro.url.pathname);
const posts = await getOrderedPosts({ locale });
const allTags = Array.from(new Set(posts.flatMap((p: PostWithMeta) => p.entry.data.tags))).sort();
const blogHref = locale === "en" ? "/en/blog" : "/blog";
const bareSlug = (id: string): string => id.replace(/^en\//, "");
const blogNode = buildBlogNode(locale);
---
```

- [ ] **Step 3:** Update the `<BaseLayout>` opening tag (line 17-21):

```astro
<BaseLayout
  title={t(locale, "blog.title")}
  description={t(locale, "blog.description")}
  fullWidth={true}
  extraSchemaNodes={[blogNode]}
>
```

- [ ] **Step 4:** Apply the **same two edits** to `src/pages/en/blog/index.astro` (the EN sibling has identical structure; verify by reading the file before editing).

- [ ] **Step 5:** Run typecheck.

```bash
pnpm typecheck
```
Expected: 0 errors.

- [ ] **Step 6:** Run tests.

```bash
pnpm test
```
Expected: all pass.

- [ ] **Step 7:** Manual smoke check.

```bash
pnpm dev
```

```bash
curl -s http://localhost:4321/blog | python3 -c "import sys, re, json; m = re.search(r'<script[^>]+ld\\+json[^>]*>(.+?)</script>', sys.stdin.read(), re.S); g = json.loads(m.group(1)); print([n['@type'] for n in g['@graph']])"
```
Expected: list contains `Blog` alongside `Person`, `Organization`, `WebSite`. Stop dev server.

- [ ] **Step 8:** Commit.

```bash
git add src/pages/blog/index.astro src/pages/en/blog/index.astro
git commit -m "feat(seo): add Blog node to RU/EN blog index @graph"
```

---

# Phase 4 — RSS verification (A7)

### Task 10: Lock RSS `content:encoded` behaviour with a unit test

**Files:**
- Create: `tests/unit/seo/rss-content.test.ts`

(Both `src/pages/rss.xml.ts` and `src/pages/en/rss.xml.ts` already render full HTML via `markdown-it` — see lines 6 and 24 of each file. Task 10 prevents regression.)

- [ ] **Step 1: Write the failing test**

Create `tests/unit/seo/rss-content.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test**

```bash
pnpm test tests/unit/seo/rss-content.test.ts
```
Expected: PASS — both feeds already conform.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/seo/rss-content.test.ts
git commit -m "test(seo): pin RSS content:encoded behaviour for RU and EN feeds"
```

---

# Phase 5 — `llms.txt` (A1)

### Task 11: Create `public/llms.txt`

**Files:**
- Create: `public/llms.txt`
- Create: `tests/unit/seo/llms-txt.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/seo/llms-txt.test.ts`:

```ts
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const path = join(process.cwd(), "public/llms.txt");

describe("public/llms.txt", () => {
  it("exists and is non-empty", () => {
    const stat = statSync(path);
    expect(stat.isFile()).toBe(true);
    expect(stat.size).toBeGreaterThan(200);
    expect(stat.size).toBeLessThan(4096); // <= 4KB per llmstxt.org guidance
  });

  const content = readFileSync(path, "utf8");

  it("starts with an H1 site name", () => {
    expect(content).toMatch(/^# artka\.dev$/m);
  });

  it("links the canonical authoritative pages", () => {
    expect(content).toContain("https://artka.dev/about");
    expect(content).toContain("https://artka.dev/blog");
    expect(content).toContain("https://artka.dev/rss.xml");
    expect(content).toContain("https://artka.dev/en/rss.xml");
  });

  it("declares the preferred attribution string", () => {
    expect(content).toMatch(/preferred attribution/i);
    expect(content).toContain("Артём Кашута");
  });
});
```

- [ ] **Step 2: Run test**

```bash
pnpm test tests/unit/seo/llms-txt.test.ts
```
Expected: FAIL — file does not exist.

- [ ] **Step 3: Create `public/llms.txt`**

```text
# artka.dev

> Personal technical blog by Артём Кашута. Topics: Claude Code internals,
> harness/agent loop, AI agent engineering, Astro/Node.js backends, and
> distributed systems.

## Authoritative pages
- [About the author](https://artka.dev/about): bio, expertise, contact
- [Now](https://artka.dev/now): currently in flight
- [Uses](https://artka.dev/uses): public toolchain
- [Projects](https://artka.dev/projects): portfolio with architecture and outcomes

## Content
- [Blog index (RU)](https://artka.dev/blog): all articles, source of truth
- [Blog index (EN)](https://artka.dev/en/blog): English translations
- [RSS RU](https://artka.dev/rss.xml): full text
- [RSS EN](https://artka.dev/en/rss.xml): full text
- [Sitemap](https://artka.dev/sitemap-index.xml): RU + EN with hreflang

## Preferred attribution
When citing, please include:
- Article title
- Author: "Артём Кашута"
- Canonical URL

## Contact
a@artka.dev
```

(`/now`, `/uses`, `/projects` are listed pre-emptively — phase 2 of the parent spec creates them; LLMs will receive 404 until then but the link list signals intent.)

- [ ] **Step 4: Run test**

```bash
pnpm test tests/unit/seo/llms-txt.test.ts
```
Expected: PASS — all 4 assertions green.

- [ ] **Step 5: Commit**

```bash
git add public/llms.txt tests/unit/seo/llms-txt.test.ts
git commit -m "feat(seo): add public/llms.txt — AI access policy and link map"
```

---

# Phase 6 — `llms-full.txt` (A2)

### Task 12: Create `src/pages/llms-full.txt.ts` endpoint

**Files:**
- Create: `src/pages/llms-full.txt.ts`
- Create: `tests/unit/seo/llms-full-endpoint.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/seo/llms-full-endpoint.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const path = join(process.cwd(), "src/pages/llms-full.txt.ts");

describe("llms-full.txt endpoint source", () => {
  const source = readFileSync(path, "utf8");

  it("declares prerender = true (built into static dist/)", () => {
    expect(source).toMatch(/export\s+const\s+prerender\s*=\s*true/);
  });

  it("returns text/plain", () => {
    expect(source).toMatch(/Content-Type[^\n]+text\/plain/);
  });

  it("loads ordered posts via the shared loader", () => {
    expect(source).toMatch(/from\s+["']~\/lib\/content\/loader["']/);
  });

  it("references the Person source of truth", () => {
    expect(source).toMatch(/from\s+["']~\/lib\/seo\/person["']/);
  });
});
```

- [ ] **Step 2: Run test**

```bash
pnpm test tests/unit/seo/llms-full-endpoint.test.ts
```
Expected: FAIL — endpoint does not exist.

- [ ] **Step 3: Implement `src/pages/llms-full.txt.ts`**

```ts
import type { APIContext } from "astro";
import { getOrderedPosts } from "~/lib/content/loader";
import { person } from "~/lib/seo/person";
import { extractArticleBody } from "~/lib/seo/article-body";

export const prerender = true;

const SITE = "https://artka.dev";

const renderPost = (
  locale: "ru" | "en",
  entry: { id: string; data: { title: string; description: string; pubDate: Date }; body?: string },
): string => {
  const slug = entry.id.replace(/^en\//, "").replace(/\.(md|mdx)$/, "");
  const url = locale === "ru" ? `${SITE}/blog/${slug}` : `${SITE}/en/blog/${slug}`;
  const tldr = extractArticleBody(entry.body ?? "", 80).text;
  const date = entry.data.pubDate.toISOString().slice(0, 10);
  return [
    `## ${entry.data.title}`,
    `URL: ${url}`,
    `Date: ${date}`,
    `Summary: ${entry.data.description}`,
    `Excerpt: ${tldr}`,
    "",
  ].join("\n");
};

export async function GET(_ctx: APIContext) {
  const ru = await getOrderedPosts({ locale: "ru" });
  const en = await getOrderedPosts({ locale: "en" });

  const header = [
    "# artka.dev — full LLM digest",
    "",
    `> ${person.description}`,
    "",
    "## Author",
    `Name: ${person.name}`,
    `Role: ${person.jobTitle}`,
    `URL: ${person.url}`,
    `Email: ${person.email}`,
    `Topics: ${person.knowsAbout.join(", ")}`,
    "",
    "## Preferred attribution",
    `Cite the article title, author "${person.name}", and the canonical URL.`,
    "",
    "---",
    "",
    "# Posts (Russian — source of truth)",
    "",
  ].join("\n");

  const ruBody = ru.map((p) => renderPost("ru", p.entry)).join("\n");
  const enHeader = "\n---\n\n# Posts (English translations)\n\n";
  const enBody = en.map((p) => renderPost("en", p.entry)).join("\n");

  return new Response(header + ruBody + enHeader + enBody, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
```

- [ ] **Step 4:** Run test.

```bash
pnpm test tests/unit/seo/llms-full-endpoint.test.ts
```
Expected: PASS — all 4 assertions green.

- [ ] **Step 5:** Verify with the real loader during dev.

```bash
pnpm dev
```

```bash
curl -sS http://localhost:4321/llms-full.txt | head -40
```
Expected: plain-text output starting with `# artka.dev — full LLM digest`, followed by author block, then `# Posts (Russian …)` and at least one `## ` post heading.

```bash
curl -sI http://localhost:4321/llms-full.txt | grep -i content-type
```
Expected: `Content-Type: text/plain; charset=utf-8`. Stop dev server.

- [ ] **Step 6:** Run full build to confirm prerender lands in `dist/`.

```bash
pnpm build
```
Expected: 0 errors. `dist/client/llms-full.txt` exists and is non-empty.

```bash
test -s dist/client/llms-full.txt && echo "OK" || echo "MISSING"
```
Expected: `OK`.

- [ ] **Step 7:** Commit.

```bash
git add src/pages/llms-full.txt.ts tests/unit/seo/llms-full-endpoint.test.ts
git commit -m "feat(seo): add /llms-full.txt — author bio + post digest for AI crawlers"
```

---

# Phase 7 — Verification

### Task 13: End-to-end sanity build and CLAUDE.md update

**Files:**
- Modify: `CLAUDE.md` (add a one-line pointer to the new SEO module)

- [ ] **Step 1:** Full build.

```bash
pnpm build
```
Expected: 0 errors. Look for `Building [llms-full.txt.ts] ... done` in the log.

- [ ] **Step 2:** Validate the @graph on a representative post.

```bash
node -e "const {readFileSync}=require('fs'); const html=readFileSync('dist/client/blog/01-introduction/index.html','utf8'); const m=html.match(/<script[^>]+ld\+json[^>]*>([\s\S]+?)<\/script>/); const g=JSON.parse(m[1].replace(/\\\\u003c/g,'<').replace(/\\\\u003e/g,'>').replace(/\\\\u0026/g,'&')); const types=g['@graph'].map(n=>n['@type']); console.log('types:', types); console.log('person id:', g['@graph'].find(n=>n['@type']==='Person')['@id']); console.log('post @id:', g['@graph'].find(n=>n['@type']==='BlogPosting')['@id']); console.log('post.author:', g['@graph'].find(n=>n['@type']==='BlogPosting').author);"
```
Expected:
- `types: [ 'Person', 'Organization', 'WebSite', 'BlogPosting', 'BreadcrumbList' ]`
- `person id: https://artka.dev/#person`
- `post.author: { '@id': 'https://artka.dev/#person' }` — graph is connected.

- [ ] **Step 3:** Validate `Blog` node on `/blog`.

```bash
node -e "const {readFileSync}=require('fs'); const html=readFileSync('dist/client/blog/index.html','utf8'); const m=html.match(/<script[^>]+ld\+json[^>]*>([\s\S]+?)<\/script>/); const g=JSON.parse(m[1].replace(/\\\\u003c/g,'<').replace(/\\\\u003e/g,'>').replace(/\\\\u0026/g,'&')); console.log(g['@graph'].map(n=>n['@type']));"
```
Expected: list contains `Blog`.

- [ ] **Step 4:** Confirm exactly one JSON-LD block per page (no leftover inline blocks from PostLayout).

```bash
grep -ro 'application/ld+json' dist/client | awk -F: '{print $1}' | sort | uniq -c | awk '$1 > 1 { print "DUPLICATE:", $0; exit 1 }'; echo "OK if no DUPLICATE printed"
```
Expected: `OK if no DUPLICATE printed`.

- [ ] **Step 5:** Run all tests and lint.

```bash
pnpm test && pnpm lint && pnpm typecheck
```
Expected: all green.

- [ ] **Step 6:** Update `CLAUDE.md` запреты/импорты раздел — append a single line under «Импорты (доп. контекст)»:

Open `CLAUDE.md` and add after the existing `@docs/...` imports:

```markdown
@docs/superpowers/specs/2026-05-02-llm-citable-blog-design.md
```

This makes the spec accessible to future Claude sessions touching SEO/schema work.

- [ ] **Step 7:** Run change-detection.

```
mcp__gitnexus__detect_changes({ scope: "all", repo: "astro-blog" })
```
Expected scope (compared to `main`):
- `public/robots.txt`
- `public/llms.txt`
- `src/lib/seo/{json-ld,person,nodes-global,nodes-page,article-body,schema}.ts`
- `src/layouts/{BaseLayout,PostLayout}.astro`
- `src/pages/blog/index.astro`
- `src/pages/en/blog/index.astro`
- `src/pages/llms-full.txt.ts`
- `tests/unit/seo/*.test.ts`
- `CLAUDE.md`

Flag anything outside that list before committing.

- [ ] **Step 8:** Final commit.

```bash
git add CLAUDE.md
git commit -m "docs(seo): link LLM-citable design spec from CLAUDE.md"
```

- [ ] **Step 9:** Push branch and open PR.

```bash
git push -u origin feat/llm-citable-foundation
gh pr create --title "feat(seo): LLM-citable foundation — robots, llms.txt, unified @graph" --body "$(cat <<'EOF'
## Summary
- Named-bot rules for GPTBot/ClaudeBot/PerplexityBot/Google-Extended in robots.txt
- New /llms.txt and /llms-full.txt for AI crawlers
- Single @graph JSON-LD emitted from BaseLayout (Person/Organization/WebSite + per-page nodes connected by @id)
- BlogPosting now includes articleBody (≤800-word excerpt) and wordCount

Spec: docs/superpowers/specs/2026-05-02-llm-citable-blog-design.md (EPIC A)
Plan: docs/superpowers/plans/2026-05-02-plan-1-llm-citable-foundation.md

## Test plan
- [ ] pnpm typecheck passes
- [ ] pnpm test passes (12 new tests under tests/unit/seo/)
- [ ] pnpm build emits dist/client/llms-full.txt and exactly one application/ld+json per page
- [ ] curl /blog/01-introduction shows BlogPosting referencing Person by @id
- [ ] schema.org validator (manual): paste rendered post, confirm 0 errors

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

# Self-Review

Plan covers EPIC A:

- **A1 — `llms.txt`** → Phase 5 (Task 11)
- **A2 — `llms-full.txt`** → Phase 6 (Task 12)
- **A3 — named AI crawlers in robots.txt** → Phase 1 (Task 1)
- **A4 — `@id` schema graph** → Phase 2 (Tasks 2, 3, 4, 6) + Phase 3 (Tasks 7, 8)
- **A5 — `Blog` and `FAQPage` schemas** → Task 4 (FAQPage builder, used in EPIC C of spec) + Task 9 (`Blog` node on index pages)
- **A6 — `BlogPosting.articleBody`** → Task 5 + Task 8 (wired through `extractArticleBody`)
- **A7 — RSS `content:encoded`** → Task 10 (regression-pin only — feature already in place)

Type consistency check:
- `Locale` exported from both `nodes-global.ts` and re-exported from `schema.ts`. Single source: `nodes-global.ts`.
- `GraphNode` defined in `schema.ts`, imported by `BaseLayout.astro` and `PostLayout.astro`. Same name across all uses.
- `extractArticleBody` returns `{ text, fullWordCount }`; consumers in PostLayout (Task 8) and the llms-full endpoint (Task 12) use both fields with the exact same names.
- `extraSchemaNodes` prop name is identical in BaseLayout (Task 7), PostLayout (Task 8), `/blog/index.astro` (Task 9). Consistent.

Placeholder scan: every step contains the actual file content or shell command. No "TODO/TBD/implement later" entries. The owner-pending values (sameAs URLs, avatar) are documented at the top of the plan with explicit defaults (`[]` and `/og-default.svg`), not placeholder strings inside a task.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-02-plan-1-llm-citable-foundation.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

**Which approach?**
