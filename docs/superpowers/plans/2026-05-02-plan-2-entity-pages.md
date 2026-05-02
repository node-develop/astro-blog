# LLM-Citable Entity Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Spec:** `docs/superpowers/specs/2026-05-02-llm-citable-blog-design.md` (EPIC B — entity pages; phases 3-5 are out of scope)
>
> **Depends on:** `docs/superpowers/plans/2026-05-02-plan-1-llm-citable-foundation.md` must be merged first. This plan assumes `src/lib/seo/{person,schema,nodes-page,nodes-global,json-ld}.ts` exist, `BaseLayout.astro` accepts `extraSchemaNodes`, and `public/llms.txt` already lists `/about`, `/now`, `/uses`, `/projects` as authoritative URLs.

**Goal:** Turn `artka.dev` into a coherent author-entity surface for LLM citation by extending `/about` into a rich expert profile, shipping three new evergreen pages (`/now`, `/uses`, `/projects`), introducing a typed `projects` content collection with `CreativeWork` JSON-LD per item, and adding an `AuthorCard` to every post that closes the loop back to `/about` and `/projects`.

**Architecture:** `src/lib/seo/person.ts` grows four optional fields (`notableWork`, `yearsExperience`, `techStack`, `expertiseAreas`) without breaking existing imports. RU markdown under `src/content/site/{about,now,uses}.md` is the source of truth; EN twins live under `src/content/site/en/` and are produced by the existing translate pipeline. A new `src/content/projects/` collection is added to `src/content.config.ts` with a strict zod schema; the script gets a parallel pass for projects. New Astro routes `src/pages/{now,uses,projects/index,projects/[slug]}.astro` (and `/en/` siblings) render the entity pages and pass `WebPage` / `CollectionPage` / `CreativeWork` nodes via the `extraSchemaNodes` prop. `AuthorCard` is a server-rendered `.astro` component that reads from `~/lib/seo/person.ts`; `PostLayout.astro` slots it in below the body.

**Tech Stack:** Astro 5, TypeScript 5.9 strict, Vitest, Tailwind 4 via existing tokens. No new dependencies.

---

## Working notes for agents

**Subagent assignments (per CLAUDE.md):**
- `frontender` → all `.astro` pages (`about`, `now`, `uses`, `projects/*`), `AuthorCard.astro`, header tweaks.
- `backender` → `src/lib/seo/person.ts` extension, `src/content.config.ts` schema, `scripts/translate.ts` projects pass, `src/lib/seo/nodes-projects.ts`.
- `architect` → consulted before Task 7 (projects collection schema) if owner adds extra fields beyond the v1 spec.
- `critic` → end-of-phase code review at end of Phase 2 and Phase 5.

**Discipline (from CLAUDE.md):**
- Run `mcp__gitnexus__impact({target, direction: "upstream", repo: "astro-blog"})` BEFORE editing `PostLayout.astro` (Task 14) and `person.ts` (Task 1). Plan 1 already touched PostLayout — re-check after merge.
- Run `mcp__gitnexus__detect_changes({scope: "staged", repo: "astro-blog"})` BEFORE every commit.
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`. Never `--no-verify`.
- Functional style: no `class`, no `this`, named/arrow functions, immutable data.
- After commits, the post-commit hook runs `npx gitnexus analyze` automatically — don't run it manually unless instructed.

**Commands cheat sheet:**
- `pnpm typecheck` — `astro sync && astro check && tsc --noEmit`
- `pnpm test` — Vitest unit + integration
- `pnpm test tests/unit/entity` — only this plan's tests
- `pnpm lint` / `pnpm build` / `pnpm dev` (http://localhost:4321)
- `pnpm translate` — RU → EN content + i18n catalogs
- `pnpm translate -- --force projects/<slug>` — force re-translate one project
- `pnpm translate:check` — verify no EN drift before commit

**Worktree (recommended):** before starting:
```bash
git worktree add ../astro-blog-entity-pages -b feat/entity-pages main
cd ../astro-blog-entity-pages && pnpm install
```

**Owner-pending values (use defaults; leave inline TODO comments):**
- `Person#me.sameAs` URLs (LinkedIn, GitHub, X). Stay `[]` from Plan 1.
- `Person#me.image`. Stays `/og-default.svg` from Plan 1. AuthorCard renders the same SVG (Task 13). Replace with a square ≥ 512×512 PNG when owner provides one — single edit to `person.ts`.
- Project slugs/content: Task 8 ships **two** representative project markdowns (`claude-code-guide`, `astro-blog`) so `/projects` index is non-empty. Owner can extend later; the schema requires no further code changes.

**Risk callouts:**
- **B4 (`/projects` collection)** is the heaviest task block (Tasks 6–11). New collection + new translation-pipeline pass + index route + dynamic `[slug].astro` + per-locale routing. Budget extra review time.
- **B5 (`AuthorCard` in PostLayout)** modifies the same file Plan 1 touched. **Always** rerun `mcp__gitnexus__impact({target: "PostLayout"})` first.
- **Translate pipeline coupling.** Adding a `projects` pass means `pnpm translate:check` becomes a stricter gate.

---

# Phase 0 — Setup

### Task 0: Verify Plan 1 landed and impact-check load-bearing files

**Subagent:** `backender`. **Files:** none (read-only).

- [x] **Step 1:** Confirm clean working tree.

```bash
git status
```
Expected: `nothing to commit, working tree clean` (only `.gitignore` modified is allowed per session start; otherwise stash first).

- [x] **Step 2:** Confirm Plan 1 deliverables exist.

```bash
test -f src/lib/seo/person.ts && \
test -f src/lib/seo/schema.ts && \
test -f src/lib/seo/nodes-page.ts && \
grep -q "extraSchemaNodes" src/layouts/BaseLayout.astro || echo "MISSING_PLAN_1"
```
Expected: no `MISSING_PLAN_1` printed. If anything is missing, stop and execute Plan 1 first.

- [x] **Step 3:** Run gitnexus impact analysis.

```
mcp__gitnexus__impact({ target: "PostLayout", direction: "upstream", repo: "astro-blog" })
mcp__gitnexus__impact({ target: "person", direction: "upstream", repo: "astro-blog" })
mcp__gitnexus__impact({ target: "BaseLayout", direction: "upstream", repo: "astro-blog" })
```

Expected: `PostLayout` MEDIUM (used by `src/pages/blog/[...slug].astro` + EN sibling); `person` HIGH (after Plan 1: `nodes-global.ts`, llms-full endpoint, plus new entity pages here); `BaseLayout` HIGH (all public pages).

- [x] **Step 4:** Baseline checks.

```bash
pnpm typecheck && pnpm test && pnpm lint
```
Expected: all pass.

---

# Phase 1 — Person profile expansion (B1 backbone)

### Task 1: Extend `PersonProfile` shape with optional expert fields

**Subagent:** `backender`.
**Files:** modify `src/lib/seo/person.ts`; create `tests/unit/entity/person-profile.test.ts`.

- [x] **Step 1: Write the failing test**

Create `tests/unit/entity/person-profile.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { person } from "~/lib/seo/person";

describe("PersonProfile — expert fields (Plan 2 additions)", () => {
  it("declares notableWork as a non-empty array of {title, url, description}", () => {
    expect(Array.isArray(person.notableWork)).toBe(true);
    expect(person.notableWork.length).toBeGreaterThanOrEqual(3);
    for (const item of person.notableWork) {
      expect(typeof item.title).toBe("string");
      expect(item.title.length).toBeGreaterThan(2);
      expect(item.url).toMatch(/^https?:\/\//);
      expect(item.description.length).toBeGreaterThan(10);
    }
  });

  it("declares yearsExperience as a positive integer", () => {
    expect(Number.isInteger(person.yearsExperience)).toBe(true);
    expect(person.yearsExperience).toBeGreaterThanOrEqual(1);
  });

  it("declares techStack with ≥ 5 entries", () => {
    expect(Array.isArray(person.techStack)).toBe(true);
    expect(person.techStack.length).toBeGreaterThanOrEqual(5);
  });

  it("declares expertiseAreas as 3–5 cluster labels", () => {
    expect(person.expertiseAreas.length).toBeGreaterThanOrEqual(3);
    expect(person.expertiseAreas.length).toBeLessThanOrEqual(5);
  });

  it("preserves all Plan-1 fields untouched", () => {
    expect(person.name).toBe("Артём Кашута");
    expect(person.email).toMatch(/@/);
    expect(person.url).toBe("https://artka.dev/about");
  });
});
```

- [x] **Step 2: Run — expect FAIL** (`pnpm test tests/unit/entity/person-profile.test.ts`).

- [x] **Step 3: Replace `src/lib/seo/person.ts`**

```ts
// Single source of truth for the site author identity. Edit this file when the
// owner provides additional sameAs URLs or a square avatar (>= 512x512 PNG).
// Plan 2 added: notableWork, yearsExperience, techStack, expertiseAreas — kept in
// sync with markdown copy under src/content/site/.

export interface NotableWorkItem {
  readonly title: string;
  readonly url: string;
  readonly description: string;
}

export interface PersonProfile {
  readonly name: string;
  readonly url: string;
  readonly image: string;
  readonly jobTitle: string;
  readonly description: string;
  readonly knowsAbout: ReadonlyArray<string>;
  readonly sameAs: ReadonlyArray<string>;
  readonly email: string;
  readonly notableWork: ReadonlyArray<NotableWorkItem>;
  readonly yearsExperience: number;
  readonly techStack: ReadonlyArray<string>;
  readonly expertiseAreas: ReadonlyArray<string>;
}

const SITE = "https://artka.dev";

export const person: PersonProfile = {
  name: "Артём Кашута",
  url: `${SITE}/about`,
  // TODO(owner): replace with a square ≥ 512×512 PNG (spec open-question #5).
  image: `${SITE}/og-default.svg`,
  jobTitle: "Software engineer · backend & AI agent engineering",
  description:
    "Backend инженер и AI-agent engineer. Пишу про Claude Code, harness/agent loop, Astro/Node.js и распределённые системы.",
  knowsAbout: [
    "Claude Code", "AI agent engineering", "Node.js", "TypeScript",
    "Astro", "Distributed systems", "DevOps",
  ],
  // TODO(owner): add LinkedIn / GitHub / X URLs (spec open-question #2).
  sameAs: [],
  email: "a@artka.dev",

  notableWork: [
    {
      title: "Claude Code Guide (RU, 14 частей)",
      url: `${SITE}/blog`,
      description:
        "Серия про harness/agent loop, context, skills, hooks, MCP, subagents и антипаттерны Claude Code.",
    },
    {
      title: "artka.dev — этот блог",
      url: SITE,
      description:
        "Astro 5 + Postgres + Drizzle, билингв RU/EN, SSG-острова под админку.",
    },
    {
      title: "AI agent engineering writeups",
      url: `${SITE}/blog`,
      description:
        "Постмортемы и разборы агентских систем: tool design, evaluation, harness и production failure modes.",
    },
  ],
  yearsExperience: 10,
  techStack: [
    "TypeScript", "Node.js", "Astro", "PostgreSQL", "Drizzle ORM",
    "Docker", "GitHub Actions", "Claude Code", "Anthropic SDK",
  ],
  expertiseAreas: [
    "AI agent engineering",
    "Backend & distributed systems",
    "Developer tooling",
    "DevOps & deploy automation",
  ],
};
```

- [x] **Step 4: Run — expect PASS** (`pnpm test tests/unit/entity/person-profile.test.ts`).

- [x] **Step 5: Run Plan-1 person test — must remain GREEN** (`pnpm test tests/unit/seo/person.test.ts`).

- [x] **Step 6: Typecheck** (`pnpm typecheck` → 0 errors).

- [x] **Step 7: Commit**

```bash
git add src/lib/seo/person.ts tests/unit/entity/person-profile.test.ts
git commit -m "feat(seo): extend PersonProfile with notableWork, techStack, expertiseAreas, yearsExperience"
```

---

### Task 2: Surface new fields in Person JSON-LD node

**Subagent:** `backender`.
**Files:** modify `src/lib/seo/nodes-global.ts`; extend `tests/unit/seo/nodes-global.test.ts`.

`subjectOf[]` carries `notableWork` (correct schema.org idiom). `expertiseAreas` is appended to `knowsAbout` and deduped. `techStack` rides on `/uses` page text — no schema field added.

- [x] **Step 1: Append failing tests** to `tests/unit/seo/nodes-global.test.ts`:

```ts
import { person } from "~/lib/seo/person";

describe("buildPersonNode — Plan 2 additions", () => {
  it("appends expertiseAreas to knowsAbout (deduped)", () => {
    const node = buildPersonNode();
    for (const area of person.expertiseAreas) {
      expect(node.knowsAbout).toContain(area);
    }
    expect(new Set(node.knowsAbout).size).toBe(node.knowsAbout.length);
  });

  it("emits subjectOf[] mirroring person.notableWork", () => {
    const node = buildPersonNode();
    expect(node.subjectOf).toHaveLength(person.notableWork.length);
    for (let i = 0; i < person.notableWork.length; i++) {
      const w = person.notableWork[i]!;
      const out = node.subjectOf[i]!;
      expect(out["@type"]).toBe("CreativeWork");
      expect(out.name).toBe(w.title);
      expect(out.url).toBe(w.url);
      expect(out.description).toBe(w.description);
    }
  });
});
```

- [x] **Step 2: Run — expect FAIL** (`pnpm test tests/unit/seo/nodes-global.test.ts`).

- [x] **Step 3: Replace only the `buildPersonNode` function** in `src/lib/seo/nodes-global.ts`:

```ts
export const buildPersonNode = () => {
  const merged = Array.from(
    new Set<string>([...person.knowsAbout, ...person.expertiseAreas]),
  );
  return {
    "@type": "Person",
    "@id": graphIds.person,
    name: person.name,
    url: person.url,
    image: person.image,
    jobTitle: person.jobTitle,
    description: person.description,
    knowsAbout: merged,
    sameAs: [...person.sameAs],
    email: person.email,
    subjectOf: person.notableWork.map((w) => ({
      "@type": "CreativeWork",
      name: w.title,
      url: w.url,
      description: w.description,
    })),
  };
};
```

(Other exports — `buildOrganizationNode`, `buildWebSiteNode`, `buildBlogNode`, `graphIds`, `Locale` — unchanged.)

- [x] **Step 4: Run — expect PASS** (`pnpm test tests/unit/seo/nodes-global.test.ts`). Plan 1 + Plan 2 assertions both green.

- [x] **Step 5: Typecheck** (`pnpm typecheck`).

- [x] **Step 6: Commit**

```bash
git add src/lib/seo/nodes-global.ts tests/unit/seo/nodes-global.test.ts
git commit -m "feat(seo): surface notableWork (subjectOf) and expertiseAreas in Person JSON-LD"
```

---

# Phase 2 — Extended `/about` (B1 content + page)

### Task 3: Rewrite `src/content/site/about.md` as expert profile

**Subagent:** `frontender`.
**Files:** modify `src/content/site/about.md`; create `tests/unit/entity/about-content.test.ts`.

- [x] **Step 1: Write failing test**

Create `tests/unit/entity/about-content.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ru = readFileSync(join(process.cwd(), "src/content/site/about.md"), "utf8");

describe("src/content/site/about.md — expert profile", () => {
  const required = ["## Кто я", "## Чем занимаюсь", "## Стек", "## Что написал", "## Контакты"];
  it.each(required)("contains %s heading", (h) => expect(ru).toContain(h));

  it("declares years of experience numerically (≥ 1)", () => {
    const m = ru.match(/(\d+)\+?\s*(год|лет|года)/i);
    expect(m).not.toBeNull();
    expect(parseInt(m![1]!, 10)).toBeGreaterThanOrEqual(1);
  });

  it("lists at least 3 notable works as bullets under '## Что написал'", () => {
    const section = ru.split("## Что написал")[1]?.split(/^##\s/m)[0] ?? "";
    const bullets = section.split("\n").filter((l) => /^\s*-\s+/.test(l));
    expect(bullets.length).toBeGreaterThanOrEqual(3);
  });

  it("contains a mailto: contact link", () => {
    expect(ru).toMatch(/\[.*\]\(mailto:[^)]+\)/);
  });

  it("body has no h1 (#) — title comes from frontmatter", () => {
    const body = ru.replace(/^---[\s\S]*?---\r?\n/, "");
    for (const line of body.split("\n")) expect(line.startsWith("# ")).toBe(false);
  });

  it("frontmatter has title and description", () => {
    expect(ru).toMatch(/^---[\s\S]*?title:[\s\S]*?description:[\s\S]*?---/);
  });
});
```

- [x] **Step 2: Run — expect FAIL**.

- [x] **Step 3: Replace `src/content/site/about.md`** with:

```markdown
---
title: Обо мне
description: "Артём Кашута — backend и AI agent engineer. 10+ лет в индустрии. Пишу про Claude Code, агентские системы, Astro и распределённые бэкенды."
---

## Кто я

Артём Кашута. 10+ лет в разработке: бэкенд, инфраструктура, последние годы — agentic системы и tooling вокруг LLM. Базируюсь дистанционно. Пишу на русском, читаю и работаю по-английски.

## Чем занимаюсь

- **AI agent engineering** — harness/agent loop, tool design, evaluation, MCP, отладка цикла «context → action → observe».
- **Backend и распределённые системы** — Node.js, TypeScript, PostgreSQL, очереди, идемпотентность, наблюдаемость.
- **Developer tooling** — Astro/Vite-based внутренние инструменты, CLI-обвязка, скрипты для команды.
- **DevOps и deploy automation** — Docker, GitHub Actions, GHCR, Dokploy, миграции при старте контейнера.

## Стек

- **Языки:** TypeScript, Node.js, немного Python.
- **Веб:** Astro 5, React (только когда нужен island), Tailwind 4.
- **БД:** PostgreSQL 18, Drizzle ORM.
- **Инфра:** Docker (multi-stage), GitHub Actions, GHCR, Dokploy.
- **AI:** Claude Code (Opus 4.7 / Sonnet / Haiku), Anthropic SDK, MCP-серверы.

Подробный список с обоснованиями — на странице [/uses](/uses).

## Что написал

- **[Claude Code Guide](/blog)** — серия из 14 частей про устройство Claude Code изнутри: harness, context window, skills, hooks, MCP, subagents, модели, антипаттерны. Источник на русском, есть [перевод EN](/en/blog).
- **[artka.dev](/projects/astro-blog)** — этот сайт. Astro 5 + Postgres + Drizzle, билингв RU/EN, SSG + динамическая админка, рендер Mermaid и LaTeX в build-time.
- **AI agent engineering writeups** — постмортемы и разборы агентских систем (см. теги в [/blog](/blog)): tool design, evaluation, production failure modes.

Текущая работа и в-планах — на странице [/now](/now).

## Контакты

- Email: [a@artka.dev](mailto:a@artka.dev)
- Блог: [artka.dev](https://artka.dev)
- RSS: [RU](https://artka.dev/rss.xml) · [EN](https://artka.dev/en/rss.xml)

LinkedIn / GitHub / X появятся, когда будет, что туда вешать (spec open-question #2).
```

- [x] **Step 4: Run — expect PASS**.

- [x] **Step 5: Typecheck** (content schema only requires `title` + optional `description`).

- [x] **Step 6: Regenerate EN twin**

```bash
pnpm translate -- --force about
```
Expected: `[site] about: translated`. Writes `src/content/site/en/about.md`.

- [x] **Step 7: Quick read** (`head -30 src/content/site/en/about.md`) — title in English, section headers translated.

- [x] **Step 8: Commit**

```bash
git add src/content/site/about.md src/content/site/en/about.md tests/unit/entity/about-content.test.ts
git commit -m "feat(content): expand /about into expert profile (RU + EN twin)"
```

---

### Task 4: Wire `/about` page to emit `WebPage` JSON-LD

**Subagent:** `frontender`.
**Files:** modify `src/pages/about.astro` and `src/pages/en/about.astro`; create `tests/unit/entity/about-page.test.ts`.

- [x] **Step 1: Write failing test**

Create `tests/unit/entity/about-page.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ru = readFileSync(join(process.cwd(), "src/pages/about.astro"), "utf8");
const en = readFileSync(join(process.cwd(), "src/pages/en/about.astro"), "utf8");

describe.each([["ru", ru], ["en", en]])("/%s/about page wires WebPage JSON-LD", (_l, src) => {
  it("imports buildWebPageNode from ~/lib/seo/schema", () => {
    expect(src).toMatch(/import\s*\{[^}]*buildWebPageNode[^}]*\}\s+from\s+["']~\/lib\/seo\/schema["']/);
  });
  it("passes the WebPage node through extraSchemaNodes", () => {
    expect(src).toMatch(/extraSchemaNodes=\{\[[^\]]*webPageNode[^\]]*\]\}/);
  });
  it("uses canonical and getLocaleFromPath", () => {
    expect(src).toMatch(/const\s+canonical\s*=/);
    expect(src).toMatch(/getLocaleFromPath/);
  });
});
```

- [x] **Step 2: Run — expect FAIL**.

- [x] **Step 3: Replace `src/pages/about.astro`** with:

```astro
---
import BaseLayout from "~/layouts/BaseLayout.astro";
import SiteSidebar from "~/components/SiteSidebar.astro";
import { getEntry, render } from "astro:content";
import { t } from "~/i18n";
import { getLocaleFromPath } from "~/lib/i18n/routing";
import { buildWebPageNode, type GraphNode } from "~/lib/seo/schema";

const locale = getLocaleFromPath(Astro.url.pathname);
const slug = locale === "en" ? "en/about" : "about";
const entry = await getEntry("site", slug);
if (!entry) return new Response(null, { status: 404 });
const { Content } = await render(entry);

const canonical = new URL(Astro.url.pathname, Astro.site ?? Astro.url).toString();
const webPageNode: GraphNode = buildWebPageNode({
  locale,
  canonical,
  name: entry.data.title,
  description: entry.data.description ?? t(locale, "meta.about.description"),
});
---

<BaseLayout
  title={entry.data.title}
  description={entry.data.description ?? t(locale, "meta.about.description")}
  fullWidth={true}
  extraSchemaNodes={[webPageNode]}
>
  <SiteSidebar slot="sidebar" />
  <article class="prose">
    <Content />
  </article>
</BaseLayout>
```

- [x] **Step 4: Replace `src/pages/en/about.astro`** with the **same content** (locale is read from `Astro.url.pathname`, both files identical by design).

- [x] **Step 5: Run — expect PASS** (6 assertions).

- [x] **Step 6: Typecheck + smoke**

```bash
pnpm typecheck
pnpm dev
```

In another terminal:

```bash
curl -s http://localhost:4321/about | python3 -c "import sys, re, json; m = re.search(r'<script[^>]+ld\\+json[^>]*>(.+?)</script>', sys.stdin.read(), re.S); g = json.loads(m.group(1).replace('\\\\u003c','<').replace('\\\\u003e','>').replace('\\\\u0026','&')); print([n['@type'] for n in g['@graph']])"
```
Expected: list contains `Person`, `Organization`, `WebSite`, `WebPage`. Stop dev server.

- [x] **Step 7: Commit**

```bash
git add src/pages/about.astro src/pages/en/about.astro tests/unit/entity/about-page.test.ts
git commit -m "feat(seo): emit WebPage JSON-LD on /about and /en/about referencing Person#me"
```

---

# Phase 3 — `/now` (B2)

### Task 5a: Create `src/content/site/now.md` (RU) + EN twin

**Subagent:** `frontender`.
**Files:** create `src/content/site/now.md`; create `tests/unit/entity/now-content.test.ts`.

- [x] **Step 1: Write failing test**

Create `tests/unit/entity/now-content.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const path = join(process.cwd(), "src/content/site/now.md");

describe("src/content/site/now.md", () => {
  it("exists", () => expect(existsSync(path)).toBe(true));
  const md = existsSync(path) ? readFileSync(path, "utf8") : "";

  it("frontmatter has title and description", () => {
    expect(md).toMatch(/^---[\s\S]*title:[\s\S]*description:[\s\S]*---/);
  });
  it("body has a 'last updated' line in YYYY-MM format or full date", () => {
    expect(md).toMatch(/(?:обновлено|updated)[^\n]*?\d{4}-\d{2}/i);
  });
  it("contains a '## Сейчас' section header", () => {
    expect(md).toMatch(/^##\s+Сейчас\b/m);
  });
  it("body has no h1", () => {
    const body = md.replace(/^---[\s\S]*?---\r?\n/, "");
    for (const line of body.split("\n")) expect(line.startsWith("# ")).toBe(false);
  });
});
```

- [x] **Step 2: Run — expect FAIL**.

- [x] **Step 3: Create `src/content/site/now.md`**:

```markdown
---
title: Сейчас
description: "Что я делаю прямо сейчас в работе и пет-проектах. Обновляется примерно раз в месяц."
---

> Последнее обновление: 2026-05-02

Это страница в духе [nownownow.com](https://nownownow.com): что в фокусе прямо сейчас, без планов на десятилетие.

## Сейчас

- **artka.dev v2** — превращаю блог в LLM-citable knowledge node. Spec: `docs/superpowers/specs/2026-05-02-llm-citable-blog-design.md`. EPIC A (foundation, schema-graph, robots/llms.txt) задеплоен, EPIC B (entity pages) — в работе.
- **Claude Code Guide, EN** — допереводы и фактчекинг английских версий после изменений в RU-источнике.
- **Эксперименты с MCP-серверами** — личная wiki + git-граф (GitNexus) внутри редактора, тестирую границы tool-design для агентов.

## Недавно закрыто

- Структурированные данные на блоге: единый `@graph`, `BlogPosting.articleBody`, `Blog` schema, `llms.txt`, `llms-full.txt`, named-bot rules.
- Bilingual pipeline (RU → EN через Claude Haiku 4.5) с per-key hash tracking и CI-гвардом `pnpm translate:check`.
- Деплой через Dokploy webhook + миграции при старте контейнера.

## Что дальше

- EPIC C из spec'а: retrieval frontmatter (`summary`, `keywords`, `faq`) + MDX компоненты `<Tldr>`/`<Faq>`/`<Compare>`.
- EPIC D: tag archives `/tags`, `/tags/<slug>`, related-posts по Jaccard overlap.
- Постмортемы по производственным задачам — оформить накопленный материал.

---

Если хочется обсудить — пишите на [a@artka.dev](mailto:a@artka.dev).
```

- [x] **Step 4: Run — expect PASS**.

- [x] **Step 5: Generate EN twin**

```bash
pnpm translate -- --force now
```
Expected: `[site] now: translated`.

- [x] **Step 6: Verify** (`head -20 src/content/site/en/now.md`) — English title, translated headers, `2026-05-02` preserved verbatim.

- [x] **Step 7: Commit**

```bash
git add src/content/site/now.md src/content/site/en/now.md tests/unit/entity/now-content.test.ts
git commit -m "feat(content): add /now page (RU + EN twin) — current focus, monthly cadence"
```

---

### Task 5b: Create `/now` Astro routes

**Subagent:** `frontender`.
**Files:** create `src/pages/now.astro` + `src/pages/en/now.astro`; create `tests/unit/entity/now-page.test.ts`.

- [x] **Step 1: Write failing test**

Create `tests/unit/entity/now-page.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ruP = join(process.cwd(), "src/pages/now.astro");
const enP = join(process.cwd(), "src/pages/en/now.astro");

describe.each([["ru", ruP], ["en", enP]])("/%s/now page", (_l, p) => {
  it("exists", () => expect(existsSync(p)).toBe(true));
  const src = existsSync(p) ? readFileSync(p, "utf8") : "";
  it("loads 'now' from site collection", () => {
    expect(src).toMatch(/getEntry\(["']site["'],\s*[^)]*now[^)]*\)/);
  });
  it("emits WebPage via extraSchemaNodes", () => {
    expect(src).toMatch(/buildWebPageNode/);
    expect(src).toMatch(/extraSchemaNodes=\{\[[^\]]*webPageNode[^\]]*\]\}/);
  });
  it("uses fullWidth", () => expect(src).toMatch(/fullWidth=\{true\}/));
});
```

- [x] **Step 2: Run — expect FAIL**.

- [x] **Step 3: Create `src/pages/now.astro`**:

```astro
---
import BaseLayout from "~/layouts/BaseLayout.astro";
import SiteSidebar from "~/components/SiteSidebar.astro";
import { getEntry, render } from "astro:content";
import { getLocaleFromPath } from "~/lib/i18n/routing";
import { buildWebPageNode, type GraphNode } from "~/lib/seo/schema";

const locale = getLocaleFromPath(Astro.url.pathname);
const slug = locale === "en" ? "en/now" : "now";
const entry = await getEntry("site", slug);
if (!entry) return new Response(null, { status: 404 });
const { Content } = await render(entry);

const canonical = new URL(Astro.url.pathname, Astro.site ?? Astro.url).toString();
const webPageNode: GraphNode = buildWebPageNode({
  locale,
  canonical,
  name: entry.data.title,
  description: entry.data.description ?? "Current focus, updated monthly.",
});
---

<BaseLayout
  title={entry.data.title}
  description={entry.data.description}
  fullWidth={true}
  extraSchemaNodes={[webPageNode]}
>
  <SiteSidebar slot="sidebar" />
  <article class="prose"><Content /></article>
</BaseLayout>
```

- [x] **Step 4: Create `src/pages/en/now.astro`** identical to Step 3 (copy verbatim).

- [x] **Step 5: Run — expect PASS** (8 assertions).

- [x] **Step 6: Smoke**

```bash
pnpm typecheck && pnpm dev
```

```bash
curl -sI http://localhost:4321/now | head -3
curl -sI http://localhost:4321/en/now | head -3
```
Expected: both 200. Stop dev.

- [x] **Step 7: Commit**

```bash
git add src/pages/now.astro src/pages/en/now.astro tests/unit/entity/now-page.test.ts
git commit -m "feat(pages): add /now and /en/now routes with WebPage JSON-LD"
```

---

# Phase 4 — `/uses` (B3)

### Task 6a: Create `src/content/site/uses.md` (RU) + EN twin

**Subagent:** `frontender`.
**Files:** create `src/content/site/uses.md`; create `tests/unit/entity/uses-content.test.ts`.

- [x] **Step 1: Write failing test**

Create `tests/unit/entity/uses-content.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const path = join(process.cwd(), "src/content/site/uses.md");

describe("src/content/site/uses.md", () => {
  it("exists", () => expect(existsSync(path)).toBe(true));
  const md = existsSync(path) ? readFileSync(path, "utf8") : "";

  const required = ["## Редактор", "## Бэкенд", "## Инфра", "## Наблюдаемость", "## AI-инструменты"];
  it.each(required)("has section %s", (h) => expect(md).toContain(h));

  it("declares specific versions for ≥ 5 tools", () => {
    const m = md.match(/[A-Z][a-zA-Z.+]+\s+\d+(\.\d+)?/g) ?? [];
    expect(m.length).toBeGreaterThanOrEqual(5);
  });
  it("body has no h1", () => {
    const body = md.replace(/^---[\s\S]*?---\r?\n/, "");
    for (const line of body.split("\n")) expect(line.startsWith("# ")).toBe(false);
  });
  it("frontmatter has title and description", () => {
    expect(md).toMatch(/^---[\s\S]*title:[\s\S]*description:[\s\S]*---/);
  });
});
```

- [x] **Step 2: Run — expect FAIL**.

- [x] **Step 3: Create `src/content/site/uses.md`**:

```markdown
---
title: Что я использую
description: "Публичный toolkit: редактор, бэкенд-стек, инфраструктура, наблюдаемость, AI-инструменты — с версиями и обоснованиями."
---

> Снимок на 2026-05-02. Версии указываю там, где это важно для воспроизводимости.

## Редактор

- **Cursor / VS Code** — основной редактор. Cursor когда нужен агент в IDE, VS Code когда хочется минимализма.
- **Claude Code (CLI)** — main driver для крупных задач. Запускается из любого репо, контекст из CLAUDE.md.
- **Helix** — терминальный редактор для быстрых правок.
- **JetBrains Mono Variable** — шрифт.

## Бэкенд

- **Node.js 24 LTS** — runtime по умолчанию. TypeScript 5.9 (TS 6 пока ломает `@astrojs/check`).
- **PostgreSQL 18** — единственная БД, нужная 99% задач.
- **Drizzle ORM + drizzle-kit** — schema-first в TypeScript, миграции в SQL.
- **Postgres.js** — драйвер. Прямее и быстрее `pg`.
- **Zod 4** — все DTO/валидация.
- **Astro 5** — публичная часть и админка-острова.

## Инфра

- **Docker (multi-stage, `node:24-bookworm-slim`)** — никаких alpine для проектов с native-модулями.
- **GitHub Actions** — CI и build. Образы в ghcr.io.
- **Dokploy** — деплой через webhook после успешного push в main.

## Наблюдаемость

- **Pino** — структурированные логи, JSON в stdout.
- **Sentry** — production-ошибки, source maps в build.
- **OpenTelemetry-ready** — спаны там, где есть смысл, без обязательного экспортёра.

## AI-инструменты

- **Claude Code** — daily driver. Opus 4.7 (1M context) для крупных рефакторингов и планирования, Sonnet для большинства задач, Haiku 4.5 для пайплайна переводов.
- **Anthropic SDK (`@anthropic-ai/sdk`)** — рантайм-вызовы из скриптов и эндпоинтов.
- **MCP-серверы** — GitNexus (граф кода), llm-wiki (личная wiki). Подключаются через `.mcp.json`.
- **Skill / agent / hook system** — тонкая настройка Claude Code под этот репо: см. `.claude/`.

---

Если что-то отсюда интересно — пишите на [a@artka.dev](mailto:a@artka.dev).
```

- [x] **Step 4: Run — expect PASS**.

- [x] **Step 5: Generate EN twin** (`pnpm translate -- --force uses`).

- [x] **Step 6: Quick read** (`head -20 src/content/site/en/uses.md`) — English title, version numbers preserved.

- [x] **Step 7: Commit**

```bash
git add src/content/site/uses.md src/content/site/en/uses.md tests/unit/entity/uses-content.test.ts
git commit -m "feat(content): add /uses page (RU + EN twin) — public toolkit with versions"
```

---

### Task 6b: Create `/uses` Astro routes

**Subagent:** `frontender`.
**Files:** create `src/pages/uses.astro` + `src/pages/en/uses.astro`; create `tests/unit/entity/uses-page.test.ts`.

- [x] **Step 1: Write failing test**

Create `tests/unit/entity/uses-page.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ruP = join(process.cwd(), "src/pages/uses.astro");
const enP = join(process.cwd(), "src/pages/en/uses.astro");

describe.each([["ru", ruP], ["en", enP]])("/%s/uses page", (_l, p) => {
  it("exists", () => expect(existsSync(p)).toBe(true));
  const src = existsSync(p) ? readFileSync(p, "utf8") : "";
  it("loads 'uses' from site collection", () => {
    expect(src).toMatch(/getEntry\(["']site["'],\s*[^)]*uses[^)]*\)/);
  });
  it("emits WebPage via extraSchemaNodes", () => {
    expect(src).toMatch(/buildWebPageNode/);
    expect(src).toMatch(/extraSchemaNodes=\{\[[^\]]*webPageNode[^\]]*\]\}/);
  });
});
```

- [x] **Step 2: Run — expect FAIL**.

- [x] **Step 3: Create `src/pages/uses.astro`** — same shape as `now.astro`, with `slug = locale === "en" ? "en/uses" : "uses"` and `description` fallback `"Public toolkit: editor, backend, infra, observability, AI tooling."`. Mirror Task 5b Step 3 verbatim, swapping the slug.

- [x] **Step 4: Create `src/pages/en/uses.astro`** identical to Step 3.

- [x] **Step 5: Run — expect PASS**.

- [x] **Step 6: Smoke** (`pnpm typecheck`, `pnpm dev`, `curl -sI http://localhost:4321/uses` and `/en/uses` → 200 each).

- [x] **Step 7: Commit**

```bash
git add src/pages/uses.astro src/pages/en/uses.astro tests/unit/entity/uses-page.test.ts
git commit -m "feat(pages): add /uses and /en/uses routes with WebPage JSON-LD"
```

---

# Phase 5 — Projects collection (B4)

> **Risk callout:** Tasks 7→11 are interdependent — finish 7 (schema) before 8 (content), 8 before 9 (translate pass), 9 before 10 (index page), 10 before 11 (detail page). Don't reorder.

### Task 7: Add `projects` content collection to `src/content.config.ts`

**Subagent:** `backender`.
**Files:** modify `src/content.config.ts`; create `tests/unit/entity/projects-schema.test.ts`.

- [x] **Step 1: Write failing test**

Create `tests/unit/entity/projects-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const cfg = readFileSync(join(process.cwd(), "src/content.config.ts"), "utf8");

describe("projects content collection", () => {
  it("declares projects alongside posts and site", () => {
    expect(cfg).toMatch(/const\s+projects\s*=\s*defineCollection/);
    expect(cfg).toMatch(/collections\s*=\s*\{[^}]*projects[^}]*\}/);
  });
  it("loads from src/content/projects via glob", () => {
    expect(cfg).toMatch(/base:\s*["']\.\/src\/content\/projects["']/);
    expect(cfg).toMatch(/pattern:\s*["']\*\*\/\*\.md["']/);
  });
  it("schema requires title, description, role, status, pubDate, stack", () => {
    expect(cfg).toMatch(/title:\s*z\.string\(\)/);
    expect(cfg).toMatch(/description:\s*z\.string\(\)/);
    expect(cfg).toMatch(/role:\s*z\.string\(\)/);
    expect(cfg).toMatch(/status:\s*z\.enum\(\[/);
    expect(cfg).toMatch(/pubDate:\s*z\.coerce\.date\(\)/);
    expect(cfg).toMatch(/stack:\s*z\.array\(z\.string\(\)\)/);
  });
  it("schema declares optional links and outcomes arrays", () => {
    expect(cfg).toMatch(/links:\s*z\.array/);
    expect(cfg).toMatch(/outcomes:\s*z\.array/);
  });
  it("preserves existing posts and site collections", () => {
    expect(cfg).toMatch(/const\s+posts\s*=\s*defineCollection/);
    expect(cfg).toMatch(/const\s+site\s*=\s*defineCollection/);
  });
});
```

- [x] **Step 2: Run — expect FAIL**.

- [x] **Step 3: Replace `src/content.config.ts`** with:

```ts
import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const posts = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/posts" }),
  schema: z.object({
    title: z.string().min(3).max(120),
    description: z.string().min(10).max(200),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    cover: z.string().optional(),
    coverAlt: z.string().optional(),
    sourceHash: z.string().optional(),
    manuallyEdited: z.boolean().default(false),
    author: z.string().default("Артём"),
  }),
});

const site = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/site" }),
  schema: z.object({
    title: z.string(),
    description: z.string().min(10).max(200).optional(),
    sourceHash: z.string().optional(),
    manuallyEdited: z.boolean().default(false),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/projects" }),
  schema: z.object({
    title: z.string().min(3).max(120),
    description: z.string().min(10).max(200),
    role: z.string().min(2).max(80),
    status: z.enum(["active", "maintained", "archived"]),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    stack: z.array(z.string()).default([]),
    outcomes: z.array(z.string()).default([]),
    links: z
      .array(z.object({ label: z.string().min(2), url: z.string().url() }))
      .default([]),
    cover: z.string().optional(),
    coverAlt: z.string().optional(),
    featured: z.boolean().default(false),
    sourceHash: z.string().optional(),
    manuallyEdited: z.boolean().default(false),
  }),
});

export const collections = { posts, site, projects };
```

- [x] **Step 4: Run — expect PASS**.

- [x] **Step 5: `pnpm astro sync`** — regenerates `.astro/types.d.ts` so `CollectionEntry<"projects">` is valid.

- [x] **Step 6: Typecheck** (`pnpm typecheck` → 0 errors).

- [x] **Step 7: Commit**

```bash
git add src/content.config.ts tests/unit/entity/projects-schema.test.ts
git commit -m "feat(content): add projects collection schema (role, status, stack, outcomes, links)"
```

---

### Task 8: Author two representative project markdowns

**Subagent:** `frontender`.
**Files:** create `src/content/projects/{astro-blog,claude-code-guide}.md`; create `tests/unit/entity/projects-content.test.ts`.

- [x] **Step 1: Write failing test**

Create `tests/unit/entity/projects-content.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getCollection } from "astro:content";

describe("projects collection", () => {
  it("contains ≥ 2 RU entries", async () => {
    const all = await getCollection("projects", (e) => !e.id.startsWith("en/"));
    expect(all.length).toBeGreaterThanOrEqual(2);
  });
  it("every entry has stack and outcomes populated", async () => {
    const all = await getCollection("projects", (e) => !e.id.startsWith("en/"));
    for (const e of all) {
      expect(e.data.stack.length).toBeGreaterThan(0);
      expect(e.data.outcomes.length).toBeGreaterThan(0);
    }
  });
  it("at least one entry is featured", async () => {
    const all = await getCollection("projects", (e) => !e.id.startsWith("en/"));
    expect(all.some((e) => e.data.featured)).toBe(true);
  });
});
```

- [x] **Step 2: Run — expect FAIL**.

- [x] **Step 3: Create `src/content/projects/astro-blog.md`**:

```markdown
---
title: artka.dev (этот блог)
description: "Личный сайт и блог. Astro 5 SSG + динамическая админка, билингв RU/EN, рендер Mermaid и LaTeX в build-time."
role: "Solo: design, backend, frontend, deploy"
status: active
pubDate: 2026-04-15
updatedDate: 2026-05-02
featured: true
stack:
  - Astro 5
  - TypeScript 5.9
  - PostgreSQL 18
  - Drizzle ORM
  - Better-Auth
  - Tailwind 4
  - Vitest 3
  - Playwright
  - Docker
  - GitHub Actions
  - Dokploy
outcomes:
  - "SSG-первый сайт с on-demand островами для админки и SSR-only маршрутами для авторизации."
  - "Билингв RU/EN с pipeline'ом перевода через Claude Haiku 4.5 и per-key hash tracking; CI-гвард `pnpm translate:check`."
  - "Структурированные данные одним `@graph` (Person/Organization/WebSite/Blog/BlogPosting) с articleBody-excerpt'ом для LLM-цитирования."
  - "Build-time рендер Mermaid через Playwright (SSR-safe SVG) и LaTeX через KaTeX."
  - "Деплой: GHCR + Dokploy webhook; миграции при старте контейнера."
links:
  - label: GitHub
    url: https://github.com/artka-dev/astro-blog
  - label: Live
    url: https://artka.dev
---

## Контекст

Хотел один простой сайт под все мои публикации, без CMS-зоопарка. Astro 5 — естественный выбор: SSG для контента, on-demand острова там, где нужен сервер.

## Архитектура

- **Контент** в Markdown/MDX в `src/content/posts/*.md`. Source of truth — RU; EN — auto-generated через скрипт перевода с git-committed артефактами.
- **Админка** — SSR-only маршруты под `/admin/*`, защищены middleware с Better-Auth.
- **БД** — Postgres + Drizzle. Хранит `posts_meta` (curated order, pinned, hidden) и search_vector для FTS.
- **Поиск** — Pagefind для публичной части (статика), Postgres FTS для админки.
- **SEO/LLM** — единый `@graph` JSON-LD из `src/lib/seo/`, `llms.txt`/`llms-full.txt`, named-bot rules в `robots.txt`.

## Что узнал

- Astro 5 i18n с `prefixDefaultLocale: false` отлично работает, если RU — источник правды и EN получают `/en/`-префикс.
- Mermaid через `rehype-mermaid` (Playwright) даёт SSR-safe SVG, без клиентского JS.
- Bilingual translation pipeline через Claude Haiku 4.5 окупается уже на 5–10 постах.

## Что дальше

Spec на v2: `docs/superpowers/specs/2026-05-02-llm-citable-blog-design.md`. Превращаю блог в LLM-citable knowledge node — entity-страницы (то, что вы читаете), retrieval frontmatter, MDX-компоненты.
```

- [x] **Step 4: Create `src/content/projects/claude-code-guide.md`**:

```markdown
---
title: Claude Code Guide (RU, 14 частей)
description: "Серия из четырнадцати статей про устройство Claude Code: harness/agent loop, context, skills, hooks, MCP, subagents, модели и антипаттерны."
role: "Author, editor, translator (RU → EN)"
status: maintained
pubDate: 2026-04-01
updatedDate: 2026-04-27
featured: true
stack:
  - Markdown / MDX
  - Mermaid (build-time)
  - Astro content collections
  - Bilingual pipeline (Claude Haiku 4.5)
outcomes:
  - "14 частей, ~80 тысяч знаков на RU. Покрытие от harness/agent loop до антипаттернов."
  - "Полный EN-перевод с per-key hash tracking; CI-гвард не даёт пушнуть RU без commit'а EN-двойника."
  - "Каждая часть — самостоятельный артефакт для цитирования: TL;DR + чёткие подзаголовки."
links:
  - label: Index (RU)
    url: https://artka.dev/blog
  - label: Index (EN)
    url: https://artka.dev/en/blog
---

## Контекст

Большая часть туториалов по Claude Code — либо «поставь и пиши», либо «вот мой workflow». Не хватало материала, который объясняет, **как оно устроено внутри**: что такое harness, как считается context window, чем skill отличается от agent'а, как hooks вклиниваются в lifecycle.

## Структура

14 частей, каждая 3000–8000 знаков: введение и harness/agent loop; context window; CLAUDE.md и system context; skills; hooks; MCP-серверы и tool-design; subagents; models (Opus/Sonnet/Haiku); plan mode; worktrees; cost mechanics; Travel Agent blueprint; best practices; verification of claims.

## Что узнал

- Перевод через LLM-pipeline даёт стабильное качество ровно до тех пор, пока RU остаётся coherent — любая mid-sentence правка ломает hash.
- Mermaid-диаграммы в техническом тексте окупаются: они становятся частью извлекаемого LLM'ами контента.
- TL;DR-блоки в начале (вводятся в EPIC C) повышают вероятность цитирования больше, чем правильные H-заголовки.

## Что дальше

EPIC C parent-spec'а: добавить `summary`/`faq` frontmatter и MDX-компоненты в существующие 14 частей.
```

- [x] **Step 5: Run — expect PASS** (3 assertions).

- [x] **Step 6: Typecheck** (zod schema validates each markdown file) — 0 errors. If a file fails validation, fix the frontmatter, **don't** loosen the schema.

- [x] **Step 7: Commit (RU only — EN twins land in Task 9)**

```bash
git add src/content/projects/astro-blog.md src/content/projects/claude-code-guide.md tests/unit/entity/projects-content.test.ts
git commit -m "feat(content): seed projects collection with astro-blog and claude-code-guide"
```

---

### Task 9: Extend `scripts/translate.ts` with a `projects` pass

**Subagent:** `backender`.
**Files:** modify `scripts/lib/site-config.ts` and `scripts/translate.ts`; create `tests/unit/entity/translate-projects.test.ts`.

- [x] **Step 1: Write failing test**

Create `tests/unit/entity/translate-projects.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const cfg = readFileSync(join(process.cwd(), "scripts/lib/site-config.ts"), "utf8");
const script = readFileSync(join(process.cwd(), "scripts/translate.ts"), "utf8");

describe("translate pipeline supports projects collection", () => {
  it("site-config exposes projectsDir and projectsEnDir", () => {
    expect(cfg).toMatch(/projectsDir:\s*join\(ROOT,\s*["']src\/content\/projects["']\)/);
    expect(cfg).toMatch(/projectsEnDir:\s*join\(ROOT,\s*["']src\/content\/projects\/en["']\)/);
  });
  it("translate.ts wires up translateAllProjects", () => {
    expect(script).toMatch(/translateAllProjects/);
  });
  it("main() invokes translateAllProjects", () => {
    const mainBody = script.split("const main")[1] ?? "";
    expect(mainBody).toMatch(/translateAllProjects/);
  });
  it("translateProjectFile translates outcomes[] and links[].label", () => {
    expect(script).toMatch(/outcome_/);
    expect(script).toMatch(/link_label_/);
  });
});
```

- [x] **Step 2: Run — expect FAIL**.

- [x] **Step 3: Replace `scripts/lib/site-config.ts`** with:

```ts
import { join } from "node:path";

const ROOT = process.cwd();

export const PATHS = {
  postsDir: join(ROOT, "src/content/posts"),
  postsEnDir: join(ROOT, "src/content/posts/en"),
  siteDir: join(ROOT, "src/content/site"),
  siteEnDir: join(ROOT, "src/content/site/en"),
  projectsDir: join(ROOT, "src/content/projects"),
  projectsEnDir: join(ROOT, "src/content/projects/en"),
  i18nDir: join(ROOT, "src/i18n"),
} as const;
```

- [x] **Step 4: Add `translateProjectFile` + `translateAllProjects` to `scripts/translate.ts`**

After the existing `translateAllSite` function, insert:

```ts
const translateProjectFile = async (
  inputPath: string,
  outputPath: string,
  slug: string,
): Promise<FileResult> => {
  const source = await readFile(inputPath, "utf8");
  const ruHash = sha256(source);
  const existingEn = await readExistingEnState(outputPath);
  const force = FORCE_ALL || (FORCE_SLUG !== null && FORCE_SLUG === slug);

  const decision = decideAction({ ruHash, existingEn, force });
  if (decision.action === "skip")
    return { slug, status: "skipped", ...(decision.reason !== undefined ? { note: decision.reason } : {}) };
  if (decision.action === "warn")
    return {
      slug,
      status: "warned",
      note: `RU source changed since manual edit; run \`pnpm translate -- --force projects/${slug}\` to re-baseline.`,
    };

  const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
  const fenceMatch = FENCE.exec(source);
  if (!fenceMatch || fenceMatch[1] === undefined) throw new Error("No frontmatter block found");
  const rawData = yaml.load(fenceMatch[1]) as Record<string, unknown>;
  const body = source.slice(fenceMatch[0].length).replace(/^\s*\n/, "");

  // Translatable strings: title, description, role, coverAlt, outcomes[], links[].label.
  const fmStrings: Record<string, string> = {};
  if (typeof rawData["title"] === "string") fmStrings["title"] = rawData["title"];
  if (typeof rawData["description"] === "string") fmStrings["description"] = rawData["description"];
  if (typeof rawData["role"] === "string") fmStrings["role"] = rawData["role"];
  if (typeof rawData["coverAlt"] === "string") fmStrings["coverAlt"] = rawData["coverAlt"];
  const outcomes = Array.isArray(rawData["outcomes"]) ? (rawData["outcomes"] as unknown[]) : [];
  outcomes.forEach((o, i) => {
    if (typeof o === "string") fmStrings[`outcome_${i}`] = o;
  });
  const links = Array.isArray(rawData["links"]) ? (rawData["links"] as unknown[]) : [];
  links.forEach((l, i) => {
    if (l && typeof l === "object" && "label" in l && typeof (l as { label: unknown }).label === "string") {
      fmStrings[`link_label_${i}`] = (l as { label: string }).label;
    }
  });

  const fmTranslated =
    Object.keys(fmStrings).length > 0
      ? await translateStrings({
          apiKey: apiKey!,
          sourceLocale: "ru",
          targetLocale: "en",
          strings: fmStrings,
        })
      : {};

  const { placeholders, skeleton } = extractProse(body, { rewriteInternalLink: () => undefined });
  const translated = await translateProse({
    apiKey: apiKey!,
    sourceLocale: "ru",
    targetLocale: "en",
    placeholders,
  });
  const enBody = reassemble(skeleton, translated);

  const enOutcomes = outcomes.map((o, i) =>
    typeof o === "string" ? (fmTranslated[`outcome_${i}`] ?? o) : o,
  );
  const enLinks = links.map((l, i) => {
    if (l && typeof l === "object" && "label" in l && "url" in l) {
      const link = l as { label: string; url: string };
      return { label: fmTranslated[`link_label_${i}`] ?? link.label, url: link.url };
    }
    return l;
  });

  const enData: Record<string, unknown> = {
    ...rawData,
    title: fmTranslated["title"] ?? rawData["title"],
    description: fmTranslated["description"] ?? rawData["description"],
    role: fmTranslated["role"] ?? rawData["role"],
    ...(fmTranslated["coverAlt"] ? { coverAlt: fmTranslated["coverAlt"] } : {}),
    outcomes: enOutcomes,
    links: enLinks,
    sourceHash: ruHash,
    manuallyEdited: false,
  };
  const rawYml = yaml.dump(enData, { lineWidth: 120 });
  const enFile = `---\n${rawYml}---\n\n${enBody}`;

  await mkdir(join(outputPath, ".."), { recursive: true });
  await writeFile(outputPath, enFile, "utf8");
  return { slug, status: "translated" };
};

const translateAllProjects = async (): Promise<readonly FileResult[]> => {
  if (!existsSync(PATHS.projectsDir)) return [];
  const files = (await readdir(PATHS.projectsDir)).filter(
    (f) => /\.md$/.test(f) && !f.startsWith("."),
  );
  const results: FileResult[] = [];
  for (const file of files) {
    const slug = file.replace(/\.md$/, "");
    const inputPath = join(PATHS.projectsDir, file);
    const outputPath = join(PATHS.projectsEnDir, file);
    try {
      const r = await translateProjectFile(inputPath, outputPath, slug);
      results.push(r);
      console.warn(`[projects] ${slug}: ${r.status}${r.note ? " (" + r.note + ")" : ""}`);
    } catch (err) {
      results.push({ slug, status: "failed", note: String(err) });
      console.error(`[projects] ${slug}: failed —`, err);
    }
  }
  return results;
};
```

- [x] **Step 5: Wire it into `main()`**

In `scripts/translate.ts`, replace the existing `main()` with:

```ts
const main = async (): Promise<void> => {
  console.warn("==> Translating posts");
  const posts = await translateAllPosts();
  console.warn("==> Translating site content");
  const site = await translateAllSite();
  console.warn("==> Translating projects");
  const projects = await translateAllProjects();
  console.warn("==> Translating string catalog");
  await translateStringCatalog();
  console.warn("==> Translating tag catalog");
  await translateTagCatalog();

  const all = [...posts, ...site, ...projects];
  const failed = all.filter((r) => r.status === "failed");
  const warned = all.filter((r) => r.status === "warned");
  if (warned.length) {
    console.warn(`\n${warned.length} manually-edited file(s) have stale source:`);
    for (const w of warned) console.warn(`  - ${w.slug}: ${w.note}`);
  }
  if (failed.length) {
    console.error(`\n${failed.length} file(s) failed`);
    process.exit(1);
  }
  console.warn("\nTranslation complete");
};
```

- [x] **Step 6: Run unit test — expect PASS** (4 assertions).

- [x] **Step 7: Typecheck** (`pnpm typecheck` → 0 errors).

- [x] **Step 8: Run translate**

```bash
pnpm translate
```
Expected:
- `[projects] astro-blog: translated`
- `[projects] claude-code-guide: translated`
- existing posts/site unchanged.

If `ANTHROPIC_API_KEY` missing, the script exits at the top — set it in `.env` first.

- [x] **Step 9: Inspect EN files**

```bash
ls src/content/projects/en/
head -30 src/content/projects/en/astro-blog.md
```
Expected: both `.md` files present, English title, translated outcomes, `links[].url` preserved verbatim.

- [x] **Step 10: Run translate:check** (`pnpm translate:check`) — clean output.

- [x] **Step 11: Commit**

```bash
git add scripts/lib/site-config.ts scripts/translate.ts src/content/projects/en/ tests/unit/entity/translate-projects.test.ts
git commit -m "feat(content): translate pipeline supports projects collection (RU → EN twins)"
```

---

### Task 10: Build `/projects` index page (RU + EN) with `CollectionPage` JSON-LD

**Subagent:** `frontender` (page) + `backender` (schema builder).
**Files:** create `src/lib/seo/nodes-projects.ts`, `tests/unit/seo/nodes-projects.test.ts`, `src/pages/projects/index.astro`, `src/pages/en/projects/index.astro`. Modify `src/lib/seo/schema.ts`, `src/i18n/strings.ru.json`.

- [x] **Step 1: Write failing schema-builder test**

Create `tests/unit/seo/nodes-projects.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildCollectionPageNode, buildCreativeWorkNode } from "~/lib/seo/nodes-projects";
import { graphIds } from "~/lib/seo/nodes-global";

describe("buildCollectionPageNode", () => {
  it("emits CollectionPage referencing Person via author", () => {
    const node = buildCollectionPageNode({
      locale: "ru",
      canonical: "https://artka.dev/projects",
      name: "Проекты",
      description: "Портфолио",
      itemUrls: ["https://artka.dev/projects/foo", "https://artka.dev/projects/bar"],
    });
    expect(node["@type"]).toBe("CollectionPage");
    expect(node["@id"]).toBe("https://artka.dev/projects#collection");
    expect(node.author).toEqual({ "@id": graphIds.person });
    expect(node.inLanguage).toBe("ru-RU");
    expect(node.hasPart).toEqual([
      { "@id": "https://artka.dev/projects/foo#creativework" },
      { "@id": "https://artka.dev/projects/bar#creativework" },
    ]);
  });
  it("uses en-US for en locale", () => {
    expect(
      buildCollectionPageNode({
        locale: "en", canonical: "https://artka.dev/en/projects", name: "P", description: "D", itemUrls: [],
      }).inLanguage,
    ).toBe("en-US");
  });
});

describe("buildCreativeWorkNode", () => {
  const base = {
    locale: "ru" as const,
    canonical: "https://artka.dev/projects/x",
    name: "X",
    description: "desc",
    role: "Solo",
    datePublished: new Date("2026-04-01T00:00:00Z"),
    keywords: ["TypeScript", "Astro"],
    url: "https://artka.dev/projects/x",
  };
  it("emits CreativeWork referencing Person as author/creator", () => {
    const node = buildCreativeWorkNode({ ...base, dateModified: new Date("2026-04-15T00:00:00Z") });
    expect(node["@type"]).toBe("CreativeWork");
    expect(node["@id"]).toBe("https://artka.dev/projects/x#creativework");
    expect(node.author).toEqual({ "@id": graphIds.person });
    expect(node.creator).toEqual({ "@id": graphIds.person });
    expect(node.datePublished).toBe("2026-04-01T00:00:00.000Z");
    expect(node.dateModified).toBe("2026-04-15T00:00:00.000Z");
    expect(node.keywords).toBe("TypeScript, Astro");
  });
  it("omits keywords when array empty", () => {
    expect("keywords" in buildCreativeWorkNode({ ...base, keywords: [] })).toBe(false);
  });
});
```

- [x] **Step 2: Run — expect FAIL**.

- [x] **Step 3: Implement `src/lib/seo/nodes-projects.ts`**:

```ts
import { graphIds, type Locale } from "./nodes-global";

const inLang = (locale: Locale): "ru-RU" | "en-US" => (locale === "ru" ? "ru-RU" : "en-US");

export interface CollectionPageInput {
  readonly locale: Locale;
  readonly canonical: string;
  readonly name: string;
  readonly description: string;
  readonly itemUrls: ReadonlyArray<string>;
}

export const buildCollectionPageNode = (input: CollectionPageInput) => ({
  "@type": "CollectionPage",
  "@id": `${input.canonical}#collection`,
  url: input.canonical,
  name: input.name,
  description: input.description,
  inLanguage: inLang(input.locale),
  isPartOf: { "@id": graphIds.website },
  author: { "@id": graphIds.person },
  hasPart: input.itemUrls.map((u) => ({ "@id": `${u}#creativework` })),
});

export interface CreativeWorkInput {
  readonly locale: Locale;
  readonly canonical: string;
  readonly name: string;
  readonly description: string;
  readonly role: string;
  readonly datePublished: Date;
  readonly dateModified?: Date;
  readonly keywords: ReadonlyArray<string>;
  readonly url: string;
}

export const buildCreativeWorkNode = (input: CreativeWorkInput) => {
  const node: Record<string, unknown> = {
    "@type": "CreativeWork",
    "@id": `${input.canonical}#creativework`,
    name: input.name,
    description: input.description,
    url: input.url,
    inLanguage: inLang(input.locale),
    author: { "@id": graphIds.person },
    creator: { "@id": graphIds.person },
    contributor: input.role,
    datePublished: input.datePublished.toISOString(),
  };
  if (input.dateModified) node.dateModified = input.dateModified.toISOString();
  if (input.keywords.length > 0) node.keywords = input.keywords.join(", ");
  return node;
};
```

- [x] **Step 4: Re-export from `src/lib/seo/schema.ts`** — append (do not remove Plan 1 exports):

```ts
export { buildCollectionPageNode, buildCreativeWorkNode } from "./nodes-projects";
```

- [x] **Step 5: Run schema-builder test — expect PASS**.

- [x] **Step 6: Add i18n keys to `src/i18n/strings.ru.json`** (near `meta.about.description`):

```json
  "meta.projects.description": "Портфолио: проекты с ролью, архитектурой, стеком и результатами.",
  "projects.title": "Проекты",
  "projects.eyebrow": "Портфолио",
  "projects.empty": "Пока ничего не опубликовано.",
  "projects.role": "Роль",
  "projects.stack": "Стек",
  "projects.outcomes": "Результаты",
  "projects.links": "Ссылки",
  "projects.status.active": "В активной разработке",
  "projects.status.maintained": "Поддерживается",
  "projects.status.archived": "Архив",
```

- [x] **Step 7: Translate** (`pnpm translate`) — `[strings] translating 11 key(s)`. Updates `strings.en.json` and `.strings.hashes.json`.

- [x] **Step 8: Create `src/pages/projects/index.astro`**:

```astro
---
import BaseLayout from "~/layouts/BaseLayout.astro";
import SiteSidebar from "~/components/SiteSidebar.astro";
import { getCollection } from "astro:content";
import { getLocaleFromPath } from "~/lib/i18n/routing";
import { t, type Locale } from "~/i18n";
import { buildCollectionPageNode, type GraphNode } from "~/lib/seo/schema";

const locale: Locale = getLocaleFromPath(Astro.url.pathname);
const allProjects = await getCollection("projects", (e) =>
  locale === "en" ? e.id.startsWith("en/") : !e.id.startsWith("en/"),
);
const projects = [...allProjects].sort((a, b) => {
  if (a.data.featured !== b.data.featured) return a.data.featured ? -1 : 1;
  return b.data.pubDate.getTime() - a.data.pubDate.getTime();
});

const bareSlug = (id: string): string => id.replace(/^en\//, "").replace(/\.md$/, "");
const projectsHref = locale === "en" ? "/en/projects" : "/projects";
const siteBase = Astro.site?.toString() ?? "https://artka.dev";
const itemUrls = projects.map((p) => new URL(`${projectsHref}/${bareSlug(p.id)}`, siteBase).toString());
const canonical = new URL(Astro.url.pathname, siteBase).toString();

const collectionNode: GraphNode = buildCollectionPageNode({
  locale, canonical,
  name: t(locale, "projects.title"),
  description: t(locale, "meta.projects.description"),
  itemUrls,
});

const statusLabel = (s: "active" | "maintained" | "archived"): string =>
  t(locale, `projects.status.${s}` as Parameters<typeof t>[1]);
---

<BaseLayout
  title={t(locale, "projects.title")}
  description={t(locale, "meta.projects.description")}
  fullWidth={true}
  extraSchemaNodes={[collectionNode]}
>
  <SiteSidebar slot="sidebar" />

  <section class="projects">
    <header class="projects__header">
      <p class="projects__eyebrow">{t(locale, "projects.eyebrow")}</p>
      <h1 class="projects__title">{t(locale, "projects.title")}</h1>
    </header>

    {projects.length === 0 ? (
      <p class="projects__empty">{t(locale, "projects.empty")}</p>
    ) : (
      <ul class="projects__list">
        {projects.map((p) => (
          <li class="projects__item">
            <a href={`${projectsHref}/${bareSlug(p.id)}`} class="projects__link">
              <header class="projects__card-header">
                <h2 class="projects__card-title">{p.data.title}</h2>
                <span class={`projects__status projects__status--${p.data.status}`}>{statusLabel(p.data.status)}</span>
              </header>
              <p class="projects__card-desc">{p.data.description}</p>
              <p class="projects__card-role"><span class="projects__card-role-label">{t(locale, "projects.role")}:</span> {p.data.role}</p>
              {p.data.stack.length > 0 && (
                <ul class="projects__chips" aria-label={t(locale, "projects.stack")}>
                  {p.data.stack.slice(0, 6).map((tech: string) => <li class="projects__chip">{tech}</li>)}
                </ul>
              )}
            </a>
          </li>
        ))}
      </ul>
    )}
  </section>

  <style>
    .projects { max-width: 720px; }
    .projects__header { margin-bottom: var(--space-6); padding-bottom: var(--space-4); border-bottom: 1px solid var(--color-border); }
    .projects__eyebrow { font-family: var(--font-mono); font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: var(--tracking-wide); color: var(--color-fg-subtle); margin: 0 0 var(--space-2) 0; }
    .projects__title { font-family: var(--font-serif); font-size: var(--fs-3xl); font-weight: 500; margin: 0; color: var(--color-fg); }
    .projects__empty { color: var(--color-fg-muted); font-style: italic; }
    .projects__list { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--space-5); }
    .projects__item { border: 1px solid var(--color-border); border-radius: var(--radius-md); transition: border-color var(--dur-fast) var(--ease-out); }
    .projects__item:hover { border-color: var(--color-accent); }
    .projects__link { display: block; padding: var(--space-5); color: inherit; text-decoration: none; }
    .projects__card-header { display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-3); margin-bottom: var(--space-2); }
    .projects__card-title { font-family: var(--font-serif); font-size: var(--fs-xl); font-weight: 500; margin: 0; color: var(--color-fg); }
    .projects__status { font-family: var(--font-mono); font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: var(--tracking-wide); padding: 2px 8px; border-radius: var(--radius-pill); border: 1px solid var(--color-border); color: var(--color-fg-muted); flex-shrink: 0; }
    .projects__status--active { color: var(--color-accent); border-color: var(--color-accent); }
    .projects__card-desc { margin: 0 0 var(--space-3) 0; color: var(--color-fg-muted); line-height: var(--lh-normal); }
    .projects__card-role { font-size: var(--fs-sm); color: var(--color-fg-muted); margin: 0 0 var(--space-3) 0; }
    .projects__card-role-label { font-family: var(--font-mono); font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: var(--tracking-wide); color: var(--color-fg-subtle); }
    .projects__chips { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: var(--space-2); }
    .projects__chip { font-family: var(--font-mono); font-size: var(--fs-xs); color: var(--color-fg-muted); padding: 2px 8px; border: 1px solid var(--color-border); border-radius: var(--radius-pill); }
  </style>
</BaseLayout>
```

- [x] **Step 9: Create `src/pages/en/projects/index.astro`** — copy verbatim from Step 8.

- [x] **Step 10: Typecheck** (`pnpm typecheck` → 0 errors).

- [x] **Step 11: Smoke**

```bash
pnpm dev
```

```bash
curl -s http://localhost:4321/projects | grep -oE 'href="/projects/[^"]+"' | sort -u
```
Expected: at least 2 unique hrefs.

```bash
curl -s http://localhost:4321/projects | python3 -c "import sys, re, json; m = re.search(r'<script[^>]+ld\\+json[^>]*>(.+?)</script>', sys.stdin.read(), re.S); g = json.loads(m.group(1).replace('\\\\u003c','<').replace('\\\\u003e','>').replace('\\\\u0026','&')); print([n['@type'] for n in g['@graph']])"
```
Expected: list contains `CollectionPage`. Stop dev.

- [x] **Step 12: Commit**

```bash
git add src/lib/seo/nodes-projects.ts src/lib/seo/schema.ts tests/unit/seo/nodes-projects.test.ts \
  src/i18n/strings.ru.json src/i18n/strings.en.json src/i18n/.strings.hashes.json \
  src/pages/projects/index.astro src/pages/en/projects/index.astro
git commit -m "feat(pages): /projects index with CollectionPage JSON-LD (RU + EN)"
```

---

### Task 11: Build `/projects/[slug]` detail page (RU + EN)

**Subagent:** `frontender`.
**Files:** create `src/pages/projects/[slug].astro` + EN sibling; create `tests/unit/entity/project-detail-page.test.ts`.

- [x] **Step 1: Write failing test**

Create `tests/unit/entity/project-detail-page.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ru = join(process.cwd(), "src/pages/projects/[slug].astro");
const en = join(process.cwd(), "src/pages/en/projects/[slug].astro");

describe.each([["ru", ru], ["en", en]])("/%s/projects/[slug]", (_l, p) => {
  it("exists", () => expect(existsSync(p)).toBe(true));
  const src = existsSync(p) ? readFileSync(p, "utf8") : "";
  it("declares getStaticPaths", () => {
    expect(src).toMatch(/export\s+(async\s+)?function\s+getStaticPaths/);
  });
  it("emits CreativeWork node via extraSchemaNodes", () => {
    expect(src).toMatch(/buildCreativeWorkNode/);
    expect(src).toMatch(/extraSchemaNodes=\{\[/);
  });
  it("emits a BreadcrumbList node", () => {
    expect(src).toMatch(/buildBreadcrumbListNode/);
  });
  it("renders body via render(entry)", () => {
    expect(src).toMatch(/await\s+render\(entry\)/);
  });
});
```

- [x] **Step 2: Run — expect FAIL**.

- [x] **Step 3: Create `src/pages/projects/[slug].astro`**:

```astro
---
import BaseLayout from "~/layouts/BaseLayout.astro";
import SiteSidebar from "~/components/SiteSidebar.astro";
import { getCollection, render } from "astro:content";
import type { CollectionEntry } from "astro:content";
import { getLocaleFromPath } from "~/lib/i18n/routing";
import { t, type Locale } from "~/i18n";
import {
  buildCreativeWorkNode,
  buildBreadcrumbListNode,
  type GraphNode,
} from "~/lib/seo/schema";

export async function getStaticPaths() {
  const all = await getCollection("projects", (e) => !e.id.startsWith("en/"));
  return all.map((entry) => ({
    params: { slug: entry.id.replace(/\.md$/, "") },
    props: { entry },
  }));
}

interface Props { entry: CollectionEntry<"projects">; }
const { entry } = Astro.props;
const { Content } = await render(entry);
const locale: Locale = getLocaleFromPath(Astro.url.pathname);
const canonical = new URL(Astro.url.pathname, Astro.site ?? Astro.url).toString();

const creativeWorkNode: GraphNode = buildCreativeWorkNode({
  locale, canonical,
  name: entry.data.title,
  description: entry.data.description,
  role: entry.data.role,
  datePublished: entry.data.pubDate,
  ...(entry.data.updatedDate ? { dateModified: entry.data.updatedDate } : {}),
  keywords: entry.data.stack,
  url: canonical,
});

const breadcrumbNode: GraphNode = buildBreadcrumbListNode({
  locale,
  blogIndexLabel: t(locale, "projects.title"),
  title: entry.data.title,
});

const statusLabel = t(locale, `projects.status.${entry.data.status}` as Parameters<typeof t>[1]);
---

<BaseLayout
  title={entry.data.title}
  description={entry.data.description}
  ogType="article"
  extraSchemaNodes={[creativeWorkNode, breadcrumbNode]}
>
  <SiteSidebar slot="sidebar" />

  <article class="project">
    <header class="project__header">
      <p class="project__eyebrow">
        <span>{t(locale, "projects.eyebrow")}</span>
        <span aria-hidden="true">·</span>
        <span class={`project__status project__status--${entry.data.status}`}>{statusLabel}</span>
      </p>
      <h1 class="project__title">{entry.data.title}</h1>
      <p class="project__lede">{entry.data.description}</p>
      <dl class="project__meta">
        <dt>{t(locale, "projects.role")}</dt>
        <dd>{entry.data.role}</dd>
      </dl>
    </header>

    <section class="project__sidecar">
      {entry.data.stack.length > 0 && (
        <div class="project__sidecar-block">
          <h2 class="project__sidecar-label">{t(locale, "projects.stack")}</h2>
          <ul class="project__chips">
            {entry.data.stack.map((tech: string) => <li class="project__chip">{tech}</li>)}
          </ul>
        </div>
      )}
      {entry.data.outcomes.length > 0 && (
        <div class="project__sidecar-block">
          <h2 class="project__sidecar-label">{t(locale, "projects.outcomes")}</h2>
          <ul class="project__outcomes">{entry.data.outcomes.map((o: string) => <li>{o}</li>)}</ul>
        </div>
      )}
      {entry.data.links.length > 0 && (
        <div class="project__sidecar-block">
          <h2 class="project__sidecar-label">{t(locale, "projects.links")}</h2>
          <ul class="project__links">
            {entry.data.links.map((l: { label: string; url: string }) => (
              <li><a href={l.url} target="_blank" rel="noopener noreferrer">{l.label} →</a></li>
            ))}
          </ul>
        </div>
      )}
    </section>

    <div class="project__body prose"><Content /></div>
  </article>

  <style>
    .project { max-width: 720px; }
    .project__header { margin-bottom: var(--space-6); padding-bottom: var(--space-5); border-bottom: 1px solid var(--color-border); }
    .project__eyebrow { display: flex; gap: var(--space-2); align-items: center; font-family: var(--font-mono); font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: var(--tracking-wide); color: var(--color-fg-subtle); margin: 0 0 var(--space-3) 0; }
    .project__status { color: var(--color-fg-muted); }
    .project__status--active { color: var(--color-accent); }
    .project__title { font-family: var(--font-serif); font-size: var(--fs-4xl); line-height: var(--lh-tight); font-weight: 500; margin: 0 0 var(--space-3) 0; color: var(--color-fg); }
    .project__lede { font-family: var(--font-sans); font-size: var(--fs-lg); line-height: var(--lh-normal); color: var(--color-fg-muted); margin: 0 0 var(--space-4) 0; }
    .project__meta { display: grid; grid-template-columns: max-content 1fr; gap: var(--space-2) var(--space-3); font-size: var(--fs-sm); margin: 0; }
    .project__meta dt { font-family: var(--font-mono); font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: var(--tracking-wide); color: var(--color-fg-subtle); }
    .project__meta dd { margin: 0; color: var(--color-fg); }
    .project__sidecar { display: grid; gap: var(--space-5); margin: 0 0 var(--space-7) 0; padding: var(--space-5); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-bg-elevated); }
    .project__sidecar-label { font-family: var(--font-mono); font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: var(--tracking-wide); color: var(--color-fg-subtle); margin: 0 0 var(--space-2) 0; }
    .project__chips { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: var(--space-2); }
    .project__chip { font-family: var(--font-mono); font-size: var(--fs-xs); color: var(--color-fg-muted); padding: 2px 8px; border: 1px solid var(--color-border); border-radius: var(--radius-pill); }
    .project__outcomes { margin: 0; padding-left: var(--space-4); color: var(--color-fg); line-height: var(--lh-normal); }
    .project__outcomes li + li { margin-top: var(--space-2); }
    .project__links { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: var(--space-3); }
    .project__links a { color: var(--color-accent); }
  </style>
</BaseLayout>
```

- [x] **Step 4: Create `src/pages/en/projects/[slug].astro`** — same as Step 3, but `getStaticPaths` becomes:

```ts
export async function getStaticPaths() {
  const all = await getCollection("projects", (e) => e.id.startsWith("en/"));
  return all.map((entry) => ({
    params: { slug: entry.id.replace(/^en\//, "").replace(/\.md$/, "") },
    props: { entry },
  }));
}
```

Everything else identical.

- [x] **Step 5: Run — expect PASS**.

- [x] **Step 6: Typecheck** (`pnpm typecheck`).

- [x] **Step 7: Smoke**

```bash
pnpm dev
```

```bash
curl -s http://localhost:4321/projects/astro-blog | python3 -c "import sys, re, json; m = re.search(r'<script[^>]+ld\\+json[^>]*>(.+?)</script>', sys.stdin.read(), re.S); g = json.loads(m.group(1).replace('\\\\u003c','<').replace('\\\\u003e','>').replace('\\\\u0026','&')); print([n['@type'] for n in g['@graph']])"
```
Expected: list contains `CreativeWork`, `BreadcrumbList`, `Person`, `Organization`, `WebSite`.

```bash
curl -sI http://localhost:4321/en/projects/astro-blog | head -3
```
Expected: 200. Stop dev.

- [x] **Step 8: Commit**

```bash
git add src/pages/projects/[slug].astro src/pages/en/projects/[slug].astro tests/unit/entity/project-detail-page.test.ts
git commit -m "feat(pages): /projects/[slug] detail with CreativeWork JSON-LD (RU + EN)"
```

---

# Phase 6 — AuthorCard on posts (B5)

### Task 12: Add AuthorCard strings to i18n catalog

**Subagent:** `backender`.
**Files:** modify `src/i18n/strings.ru.json` (and verify `strings.en.json` after translate).

- [x] **Step 1: Add to `src/i18n/strings.ru.json`** (near other `meta.*` keys):

```json
  "authorCard.aboutLabel": "Об авторе",
  "authorCard.viewProfile": "Профиль автора →",
  "authorCard.viewProjects": "Проекты →",
  "authorCard.role": "Backend & AI agent engineer"
```

- [x] **Step 2: Translate** (`pnpm translate` → `[strings] translating 4 key(s)`).

- [x] **Step 3: Verify**

```bash
grep -E '"authorCard\.(aboutLabel|viewProfile|viewProjects|role)"' src/i18n/strings.en.json
```
Expected: 4 matching lines.

- [x] **Step 4: Typecheck** (`pnpm typecheck` — `StringKey` updates automatically).

- [x] **Step 5: Commit**

```bash
git add src/i18n/strings.ru.json src/i18n/strings.en.json src/i18n/.strings.hashes.json
git commit -m "feat(i18n): add AuthorCard strings (about/profile/projects/role)"
```

---

### Task 13: Build `AuthorCard.astro` component

**Subagent:** `frontender`.
**Files:** create `src/components/AuthorCard.astro`; create `tests/unit/entity/author-card.test.ts`.

The component reads from `~/lib/seo/person.ts` and accepts no overrides — that would defeat "single coherent author entity".

- [x] **Step 1: Write failing test**

Create `tests/unit/entity/author-card.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const path = join(process.cwd(), "src/components/AuthorCard.astro");

describe("src/components/AuthorCard.astro", () => {
  it("exists", () => expect(existsSync(path)).toBe(true));
  const src = existsSync(path) ? readFileSync(path, "utf8") : "";

  it("imports person from ~/lib/seo/person", () => {
    expect(src).toMatch(/from\s+["']~\/lib\/seo\/person["']/);
  });
  it("imports t and getLocaleFromPath", () => {
    expect(src).toMatch(/import\s+\{[^}]*t[^}]*\}\s+from\s+["']~\/i18n["']/);
    expect(src).toMatch(/getLocaleFromPath/);
  });
  it("renders an avatar image using person.image", () => {
    expect(src).toMatch(/person\.image/);
    expect(src).toMatch(/<img[^>]+alt=/);
  });
  it("links to /about and /projects (locale-aware)", () => {
    expect(src).toMatch(/\/about/);
    expect(src).toMatch(/\/projects/);
  });
  it("has no client:* directive (server-only)", () => {
    expect(src).not.toMatch(/client:(load|idle|visible|media|only)/);
  });
});
```

- [x] **Step 2: Run — expect FAIL**.

- [x] **Step 3: Create `src/components/AuthorCard.astro`**:

```astro
---
import { person } from "~/lib/seo/person";
import { t } from "~/i18n";
import { getLocaleFromPath } from "~/lib/i18n/routing";

const locale = getLocaleFromPath(Astro.url.pathname);
const aboutHref = locale === "en" ? "/en/about" : "/about";
const projectsHref = locale === "en" ? "/en/projects" : "/projects";
---

<aside class="author-card" aria-label={t(locale, "authorCard.aboutLabel")}>
  <a href={`${aboutHref}#me`} class="author-card__avatar-link" aria-hidden="true" tabindex="-1">
    <img
      src={person.image}
      alt=""
      width="56"
      height="56"
      class="author-card__avatar"
      loading="lazy"
      decoding="async"
    />
  </a>
  <div class="author-card__body">
    <p class="author-card__label">{t(locale, "authorCard.aboutLabel")}</p>
    <p class="author-card__name"><a href={aboutHref}>{person.name}</a></p>
    <p class="author-card__role">{t(locale, "authorCard.role")}</p>
    <ul class="author-card__links">
      <li><a href={aboutHref}>{t(locale, "authorCard.viewProfile")}</a></li>
      <li><a href={projectsHref}>{t(locale, "authorCard.viewProjects")}</a></li>
    </ul>
  </div>
</aside>

<style>
  .author-card { display: grid; grid-template-columns: 56px 1fr; gap: var(--space-4); align-items: start; padding: var(--space-5); margin: var(--space-7) 0 0 0; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-bg-elevated); }
  .author-card__avatar-link { line-height: 0; }
  .author-card__avatar { width: 56px; height: 56px; border-radius: var(--radius-pill); border: 1px solid var(--color-border); background: var(--color-bg); object-fit: cover; }
  .author-card__body { display: grid; gap: var(--space-1); }
  .author-card__label { font-family: var(--font-mono); font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: var(--tracking-wide); color: var(--color-fg-subtle); margin: 0; }
  .author-card__name { font-family: var(--font-serif); font-size: var(--fs-lg); font-weight: 500; margin: 0; }
  .author-card__name a { color: var(--color-fg); text-decoration: none; }
  .author-card__name a:hover { color: var(--color-accent); }
  .author-card__role { color: var(--color-fg-muted); font-size: var(--fs-sm); margin: 0 0 var(--space-2) 0; }
  .author-card__links { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: var(--space-3); font-size: var(--fs-sm); }
  .author-card__links a { color: var(--color-accent); }
</style>
```

- [x] **Step 4: Run — expect PASS** (6 assertions).

- [x] **Step 5: Typecheck** (`pnpm typecheck`).

- [x] **Step 6: Commit**

```bash
git add src/components/AuthorCard.astro tests/unit/entity/author-card.test.ts
git commit -m "feat(ui): add AuthorCard component (avatar + name + links to /about and /projects)"
```

---

### Task 14: Wire `AuthorCard` into `PostLayout.astro`

**Subagent:** `frontender`.
**Files:** modify `src/layouts/PostLayout.astro`; create `tests/unit/entity/post-layout-author-card.test.ts`.

- [x] **Step 1: Re-run impact analysis (Plan 1 already touched this file)**

```
mcp__gitnexus__impact({ target: "PostLayout", direction: "upstream", repo: "astro-blog" })
```
Expected: MEDIUM (used by `src/pages/blog/[...slug].astro` and EN sibling). Confirm before proceeding.

- [x] **Step 2: Write failing test**

Create `tests/unit/entity/post-layout-author-card.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "src/layouts/PostLayout.astro"), "utf8");

describe("PostLayout — AuthorCard wiring", () => {
  it("imports AuthorCard from ~/components/AuthorCard.astro", () => {
    expect(src).toMatch(/import\s+AuthorCard\s+from\s+["']~\/components\/AuthorCard\.astro["']/);
  });

  it("renders <AuthorCard /> below the post body slot", () => {
    expect(src).toMatch(/<AuthorCard\s*\/?>/);
    const slotIdx = src.indexOf("<slot />");
    const cardIdx = src.indexOf("<AuthorCard");
    expect(slotIdx).toBeGreaterThan(-1);
    expect(cardIdx).toBeGreaterThan(slotIdx);
  });
});
```

- [x] **Step 3: Run — expect FAIL**.

- [x] **Step 4: Modify `src/layouts/PostLayout.astro`**

In the frontmatter `import` block (near other component imports), add:

```astro
import AuthorCard from "~/components/AuthorCard.astro";
```

Then locate the `<article class="post">…</article>` block. After the closing `</div>` of `post__body` (the wrapper around `<slot />`) and **before** the closing `</article>`, insert:

```astro
    <AuthorCard />
```

So the relevant section reads:

```astro
    <div class="post__body prose">
      <slot />
    </div>
    <AuthorCard />
  </article>
```

- [x] **Step 5: Run — expect PASS** (2 assertions).

- [x] **Step 6: Typecheck + run all tests**

```bash
pnpm typecheck && pnpm test
```
Expected: all pass (Plan 1 SEO + Plan 2 entity + existing).

- [x] **Step 7: Smoke**

```bash
pnpm dev
```

```bash
curl -s http://localhost:4321/blog/01-introduction | grep -c 'class="author-card"'
curl -s http://localhost:4321/en/blog/01-introduction | grep -c 'class="author-card"'
```
Expected: `1` and `1`. Stop dev.

- [x] **Step 8: detect_changes**

```
mcp__gitnexus__detect_changes({ scope: "staged", repo: "astro-blog" })
```
Expected: only `PostLayout.astro` and the new test file.

- [x] **Step 9: Commit**

```bash
git add src/layouts/PostLayout.astro tests/unit/entity/post-layout-author-card.test.ts
git commit -m "feat(layout): render AuthorCard at the bottom of every post"
```

---

# Phase 7 — Header navigation + llms.txt sanity

### Task 15: Add new entity pages to header navigation

**Subagent:** `frontender`.
**Files:** modify `src/components/Header.astro`, `src/i18n/strings.ru.json`.

- [x] **Step 1: Read current Header**

```bash
cat src/components/Header.astro
```
Note the link list pattern (array of `{label, href}` or inline JSX `<a>` tags).

- [x] **Step 2: Add 3 i18n keys to `src/i18n/strings.ru.json`** (near existing `nav.*`):

```json
  "nav.now": "Сейчас",
  "nav.uses": "Использую",
  "nav.projects": "Проекты"
```

- [x] **Step 3: Translate** (`pnpm translate` → `[strings] translating 3 key(s)`).

- [x] **Step 4: Modify `src/components/Header.astro`** — add three locale-aware nav items between `nav.about` and `nav.search`:
- `locale === "en" ? "/en/now" : "/now"` with label `t(locale, "nav.now")`
- `locale === "en" ? "/en/uses" : "/uses"` with label `t(locale, "nav.uses")`
- `locale === "en" ? "/en/projects" : "/projects"` with label `t(locale, "nav.projects")`

Mirror Header's existing pattern exactly — if it uses an array `links`, extend the array; if inline `<a>` tags, add three more inline.

- [x] **Step 5: Run typecheck and tests** (`pnpm typecheck && pnpm test`).

- [x] **Step 6: Smoke**

```bash
pnpm dev
```

```bash
curl -s http://localhost:4321/ | grep -oE 'href="/(now|uses|projects)"' | sort -u
curl -s http://localhost:4321/en/ | grep -oE 'href="/en/(now|uses|projects)"' | sort -u
```
Expected: 3 + 3 unique lines. Stop dev.

- [x] **Step 7: Commit**

```bash
git add src/components/Header.astro src/i18n/strings.ru.json src/i18n/strings.en.json src/i18n/.strings.hashes.json
git commit -m "feat(nav): expose /now /uses /projects in header navigation"
```

---

### Task 16: Verify `llms.txt` link list resolves

**Subagent:** `backender`. **Files:** verification only.

Plan 1 pre-emptively listed `/about`, `/now`, `/uses`, `/projects` in `public/llms.txt`. This task confirms all four URLs now resolve.

- [x] **Step 1: Build**

```bash
pnpm build
```
Expected: 0 errors.

- [x] **Step 2: Verify each entity page in `dist/`**

```bash
for path in about now uses projects; do
  test -f "dist/client/${path}/index.html" && echo "OK: /${path}" || echo "MISSING: /${path}"
  test -f "dist/client/en/${path}/index.html" && echo "OK: /en/${path}" || echo "MISSING: /en/${path}"
done
```
Expected: 8 lines, all `OK:`.

- [x] **Step 3: Verify project detail pages**

```bash
test -f dist/client/projects/astro-blog/index.html && echo OK_RU_AB || echo FAIL
test -f dist/client/projects/claude-code-guide/index.html && echo OK_RU_CCG || echo FAIL
test -f dist/client/en/projects/astro-blog/index.html && echo OK_EN_AB || echo FAIL
test -f dist/client/en/projects/claude-code-guide/index.html && echo OK_EN_CCG || echo FAIL
```
Expected: 4 `OK_*` lines.

- [x] **Step 4:** No commit — verification only.

---

# Phase 8 — End-to-end verification

### Task 17: Full build + JSON-LD sanity + CLAUDE.md update + PR

**Subagent:** `critic`.
**Files:** optional `CLAUDE.md` edit.

- [x] **Step 1: Full build** (`pnpm build` → 0 errors).

- [x] **Step 2: Validate `/about` graph**

```bash
node -e "const {readFileSync}=require('fs'); const html=readFileSync('dist/client/about/index.html','utf8'); const m=html.match(/<script[^>]+ld\+json[^>]*>([\s\S]+?)<\/script>/); const g=JSON.parse(m[1].replace(/\\\\u003c/g,'<').replace(/\\\\u003e/g,'>').replace(/\\\\u0026/g,'&')); const types=g['@graph'].map(n=>n['@type']); console.log('types:',types); const wp=g['@graph'].find(n=>n['@type']==='WebPage'); console.log('WebPage.about:',wp.about); const person=g['@graph'].find(n=>n['@type']==='Person'); console.log('Person.subjectOf.length:',person.subjectOf.length);"
```
Expected:
- `types: [ 'Person', 'Organization', 'WebSite', 'WebPage' ]`
- `WebPage.about: { '@id': 'https://artka.dev/#person' }`
- `Person.subjectOf.length: 3`

- [x] **Step 3: Validate `/projects` CollectionPage**

```bash
node -e "const {readFileSync}=require('fs'); const html=readFileSync('dist/client/projects/index.html','utf8'); const m=html.match(/<script[^>]+ld\+json[^>]*>([\s\S]+?)<\/script>/); const g=JSON.parse(m[1].replace(/\\\\u003c/g,'<').replace(/\\\\u003e/g,'>').replace(/\\\\u0026/g,'&')); const cp=g['@graph'].find(n=>n['@type']==='CollectionPage'); console.log('CollectionPage.hasPart:',JSON.stringify(cp.hasPart,null,2));"
```
Expected: array of 2 `{@id: ...#creativework}` objects.

- [x] **Step 4: Validate `/projects/astro-blog` CreativeWork**

```bash
node -e "const {readFileSync}=require('fs'); const html=readFileSync('dist/client/projects/astro-blog/index.html','utf8'); const m=html.match(/<script[^>]+ld\+json[^>]*>([\s\S]+?)<\/script>/); const g=JSON.parse(m[1].replace(/\\\\u003c/g,'<').replace(/\\\\u003e/g,'>').replace(/\\\\u0026/g,'&')); const cw=g['@graph'].find(n=>n['@type']==='CreativeWork'); console.log('author:',cw.author); console.log('creator:',cw.creator); console.log('keywords:',cw.keywords);"
```
Expected:
- `author: { '@id': 'https://artka.dev/#person' }`
- `creator: { '@id': 'https://artka.dev/#person' }`
- `keywords:` non-empty comma-separated string.

- [x] **Step 5: Confirm exactly one JSON-LD per entity page**

```bash
for f in dist/client/about/index.html dist/client/now/index.html dist/client/uses/index.html dist/client/projects/index.html dist/client/projects/astro-blog/index.html; do
  echo -n "$f: "
  grep -o 'application/ld+json' "$f" | wc -l | tr -d ' '
  echo
done
```
Expected: each line ends with `1`.

- [x] **Step 6: Confirm AuthorCard on a representative post**

```bash
grep -c 'class="author-card"' dist/client/blog/01-introduction/index.html
grep -c 'class="author-card"' dist/client/en/blog/01-introduction/index.html
```
Expected: `1` and `1`.

- [x] **Step 7: Run all gates**

```bash
pnpm test && pnpm lint && pnpm typecheck && pnpm translate:check
```
Expected: all green.

- [x] **Step 8: (Optional) Update `CLAUDE.md`** — under `## Структура` add a one-liner:

```markdown
- Entity pages: `/about`, `/now`, `/uses`, `/projects` (collection). RU markdown in `src/content/site/` and `src/content/projects/`; EN twins generated by `pnpm translate`.
```

- [x] **Step 9: detect_changes (full scope)**

```
mcp__gitnexus__detect_changes({ scope: "all", repo: "astro-blog" })
```
Expected scope (vs `main`):
- `src/lib/seo/{person,nodes-global,schema,nodes-projects}.ts`
- `src/content.config.ts`
- `src/content/site/{about,now,uses}.md` + EN twins
- `src/content/projects/{astro-blog,claude-code-guide}.md` + EN twins
- `src/pages/{about,now,uses}.astro` + EN siblings
- `src/pages/projects/{index,[slug]}.astro` + EN siblings
- `src/components/{AuthorCard.astro,Header.astro}`
- `src/layouts/PostLayout.astro`
- `src/i18n/strings.ru.json`, `strings.en.json`, `.strings.hashes.json`
- `scripts/{translate.ts,lib/site-config.ts}`
- `tests/unit/entity/*.test.ts`, `tests/unit/seo/{nodes-global,nodes-projects}.test.ts`
- `CLAUDE.md` (if Step 8 applied)

Flag anything outside this list before pushing.

- [x] **Step 10: Commit Step-8 leftovers** (skip if `CLAUDE.md` untouched)

```bash
git add CLAUDE.md
git commit -m "docs: note entity-page surface in CLAUDE.md"
```

- [x] **Step 11: Push and open PR**

```bash
git push -u origin feat/entity-pages
gh pr create --title "feat(entity): /about + /now + /uses + /projects + AuthorCard" --body "$(cat <<'EOF'
## Summary
- /about extended into expert profile with Person `subjectOf[]` (3 notable works) and merged knowsAbout/expertiseAreas.
- /now and /uses are new evergreen entity pages (RU + EN twins via translate pipeline).
- /projects is a new content collection (zod schema + 2 representative entries) with index (CollectionPage JSON-LD) and detail (CreativeWork JSON-LD) routes.
- AuthorCard renders below every post with avatar + name + links to /about and /projects.
- Header nav exposes Now / Uses / Projects.
- llms.txt link list (shipped in Plan 1) is now fully resolvable.

Spec: docs/superpowers/specs/2026-05-02-llm-citable-blog-design.md (EPIC B)
Plan: docs/superpowers/plans/2026-05-02-plan-2-entity-pages.md
Depends on: PR for Plan 1 (LLM-citable foundation) — merge first.

## Test plan
- [x] pnpm typecheck passes
- [x] pnpm test passes (new tests under tests/unit/entity/ and tests/unit/seo/nodes-projects.test.ts)
- [x] pnpm translate:check passes (no EN drift)
- [x] pnpm build emits dist/client/{about,now,uses,projects,projects/astro-blog,projects/claude-code-guide}/index.html (and /en/ siblings)
- [x] curl /about shows WebPage.about → Person#me
- [x] curl /projects/astro-blog shows CreativeWork.author → Person#me
- [x] AuthorCard rendered on a sample blog post (RU + EN)

## Owner-pending defaults left in place
- Person.sameAs[] still empty (spec open-question #2)
- Person.image still /og-default.svg (spec open-question #5)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

# Self-Review

**Spec coverage map (EPIC B → tasks):**

- **B1 — `/about` extended to expert profile** → Task 1 (PersonProfile extension), Task 2 (Person JSON-LD `subjectOf`), Task 3 (RU markdown rewrite + EN twin), Task 4 (`WebPage` JSON-LD on the page).
- **B2 — `/now`** → Task 5a (RU + EN content), Task 5b (Astro routes).
- **B3 — `/uses`** → Task 6a (RU + EN content), Task 6b (Astro routes).
- **B4 — `/projects`** → Task 7 (collection schema), Task 8 (2 representative project markdowns), Task 9 (translate pipeline pass), Task 10 (`/projects` index + `CollectionPage` JSON-LD), Task 11 (`/projects/[slug]` detail + `CreativeWork` JSON-LD).
- **B5 — `AuthorCard`** → Task 12 (i18n strings), Task 13 (component), Task 14 (PostLayout integration).

**Cross-cutting:** Task 15 (header nav so the entity surface is reachable), Task 16 (llms.txt-link sanity from Plan 1), Task 17 (end-to-end verification + PR).

**Type consistency:**
- `PersonProfile` extension (Task 1) preserves all Plan-1 fields verbatim and only adds new ones — Plan-1 tests (`tests/unit/seo/person.test.ts`) keep passing without modification.
- `Locale` continues to be re-exported from `~/lib/seo/schema`. New consumers (`buildCollectionPageNode`, `buildCreativeWorkNode`) accept the same type.
- `GraphNode` (defined in Plan 1's `schema.ts`) is the prop type for `extraSchemaNodes` — every new page uses the same name and import path.
- `CollectionEntry<"projects">` becomes valid because Task 7 registers `projects` in `collections` and `pnpm astro sync` regenerates the type union.

**Placeholder scan:**
- Owner-pending values (`sameAs[]` empty, `image = /og-default.svg`) are inherited from Plan 1 with explicit `TODO(owner)` comments — no fake URLs, no bogus avatar paths.
- All shell commands and code blocks contain final, working content. No `TBD` or `// implement later` markers.
- Project markdowns in Task 8 use real content (architecture/outcomes/links pulled from this repo's actual state at 2026-05-02), not lorem ipsum.

**Test discipline:** every code-introducing task starts with a failing test → minimal implementation → passing test → commit. Astro `.astro` components are tested via source-string assertions (the existing pattern in `tests/unit/seo.test.ts`) — deliberately no JSDOM/Astro-Container overhead. Tests live under `tests/unit/entity/` (this plan) or extend `tests/unit/seo/` (Plan 1's namespace, when extending existing builders).

**i18n discipline:** all RU content goes through `pnpm translate`; new string keys are added to `strings.ru.json` and translated via the script. `pnpm translate:check` is part of Task 17 Step 7.

**Functional-style discipline:** no `class` declarations introduced. All new modules export named arrow functions or pure objects. All Astro components are server-rendered (Task 13 explicitly tests no `client:*` directive).

**Risk callouts addressed:**
- B4 split into 5 ordered tasks (7→11). Task 9 (translate pipeline extension) lands before any EN page is built, so `pnpm translate:check` never sees a missing twin.
- B5 starts (Task 14 Step 1) with a fresh `gitnexus_impact` on `PostLayout` since Plan 1 already touched it.
- Owner-pending defaults documented at the top of the working-notes block; never leaked into per-task placeholders.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-02-plan-2-entity-pages.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks; fast iteration on the mostly-additive changes.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batched checkpoints at end of Phase 2 (after Task 4), end of Phase 5 (after Task 11), end of Phase 8 (after Task 17).

**Which approach?**
