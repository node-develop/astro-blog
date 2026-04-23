# Plan 1 — Visual Foundation (Editorial × Technical)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the public blog around an "Editorial × Technical" visual direction — warm cream palette, serif headings, sans body, mono metadata — and introduce a three-column layout with a left post-list sidebar and a right in-page TOC. No DB or admin work here.

**Architecture:** Pure Astro + Tailwind 4 + CSS custom properties. A single `src/styles/tokens.css` file owns all design tokens, consumed by Tailwind 4 `@theme` and by direct CSS variable usage. Layouts are composed as CSS Grid with named areas. Sidebar and TOC are static Astro components enhanced with tiny `<script>` modules (no React islands needed for this plan). Posts read from the existing content collection, ordered by numeric filename prefix then pubDate.

**Tech Stack:** Astro 5, Tailwind CSS 4 (`@tailwindcss/vite`), `@tailwindcss/typography`, `@fontsource-variable/*` (Source Serif 4, Inter, JetBrains Mono), Vitest 3, Playwright, `@axe-core/playwright`.

**Dependencies:** Spec `docs/superpowers/specs/2026-04-23-blog-admin-sidebar-search-design.md` sections 4, 8.1, 12, 13.

**Out of scope (deferred to later plans):**
- DB schema / admin CRUD (Plan 2).
- Pagefind / ⌘K palette / search (Plan 3).
- Designer subagent and skills (Plan 4).
- Dark-mode toggle UI (system preference only in this plan).
- Font subsetting beyond what fontsource variable ships with.

---

## File map

**Create:**
- `src/styles/tokens.css` — all design tokens as CSS custom properties (light + dark blocks).
- `src/styles/prose.css` — typography overrides for article body, imported by `global.css`.
- `src/components/Header.astro` — top bar (site title, nav, mobile drawer trigger).
- `src/components/SiteSidebar.astro` — left rail, post list, active highlight.
- `src/components/PostTOC.astro` — right rail, h2/h3 list with scroll-spy.
- `src/components/MobileDrawer.astro` — wraps sidebar content in a drawer element for mobile.
- `src/components/SkipLink.astro` — keyboard accessibility skip-link.
- `src/lib/posts/list.ts` — `getPublishedPosts()` sorted helper.
- `src/lib/posts/toc.ts` — `buildTocTree(headings)` nested h2/h3 helper.
- `src/lib/posts/list.test.ts` — unit tests colocated.
- `src/lib/posts/toc.test.ts` — unit tests colocated.
- `tests/e2e/navigation.spec.ts` — drawer, sidebar links, TOC scroll-spy.
- `tests/e2e/a11y.spec.ts` — axe baselines on `/`, `/blog`, `/blog/<slug>`.

**Modify:**
- `src/styles/global.css` — import tokens + prose, wire fonts, tune `@theme`.
- `src/layouts/BaseLayout.astro` — three-column grid, slots for sidebar/toc, header/footer rework.
- `src/layouts/PostLayout.astro` — use the TOC slot, pass headings.
- `src/pages/blog/[...slug].astro` — pass headings from `render()` into `PostLayout`.
- `package.json` — add fontsource packages and `@axe-core/playwright`.
- `.github/workflows/ci.yml` (if present) — unchanged, but e2e tests will extend the existing job.

---

## Sequencing notes

Tasks 1–6 set the foundation (tokens, fonts, base layout frame) without breaking existing pages. Task 7 onwards introduces the new components incrementally. Every task leaves the site in a working state — you can `pnpm dev` after any commit and see a rendered site.

The conventional commit prefix is `feat(ui):` for feature work, `test(ui):` for test-only, `chore(ui):` for tooling.

---

## Task 1: Install font packages and axe for e2e

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime deps**

```bash
pnpm add @fontsource-variable/source-serif-4@^5 @fontsource-variable/inter@^5 @fontsource-variable/jetbrains-mono@^5
```

- [ ] **Step 2: Install dev deps**

```bash
pnpm add -D @axe-core/playwright@^4
```

- [ ] **Step 3: Verify versions landed**

Run: `grep -E '"(@fontsource-variable|@axe-core)' package.json`
Expected: four matching lines.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(ui): add font and a11y deps for visual foundation"
```

---

## Task 2: Create design tokens file

**Files:**
- Create: `src/styles/tokens.css`

- [ ] **Step 1: Create `src/styles/tokens.css`**

```css
/* Editorial × Technical — single source of truth for visual tokens.
   Consumed by Tailwind 4 @theme in global.css and directly by components. */

:root {
  /* ── Typography ───────────────────────────────────────────── */
  --font-serif: "Source Serif 4 Variable", Georgia, "Times New Roman", serif;
  --font-sans: "Inter Variable", ui-sans-serif, system-ui, -apple-system, sans-serif;
  --font-mono: "JetBrains Mono Variable", ui-monospace, SFMono-Regular, Menlo, monospace;

  --fs-xs: 0.75rem;
  --fs-sm: 0.875rem;
  --fs-base: 1rem;
  --fs-md: 1.0625rem;
  --fs-lg: 1.25rem;
  --fs-xl: 1.5rem;
  --fs-2xl: 1.875rem;
  --fs-3xl: 2.25rem;
  --fs-4xl: 2.75rem;

  --lh-tight: 1.15;
  --lh-snug: 1.3;
  --lh-normal: 1.55;
  --lh-relaxed: 1.7;

  --tracking-tight: -0.015em;
  --tracking-normal: 0;
  --tracking-wide: 0.08em;

  /* ── Colors (light) ───────────────────────────────────────── */
  --color-bg: #fdfcf7;
  --color-bg-elevated: #f7f3e8;
  --color-bg-subtle: #f2edde;
  --color-fg: #1f1b16;
  --color-fg-muted: #6b5d4f;
  --color-fg-subtle: #8a7d6a;
  --color-border: #e8e0cf;
  --color-border-strong: #d7cbb2;
  --color-accent: #b8860b;
  --color-accent-hover: #9c6f08;
  --color-accent-soft: #f5e9c8;
  --color-danger: #c0392b;

  /* Focus ring derived from accent, at AA contrast against bg. */
  --color-focus-ring: color-mix(in srgb, var(--color-accent) 65%, transparent);

  /* ── Space scale (4px base) ───────────────────────────────── */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;
  --space-8: 64px;
  --space-9: 96px;

  /* ── Radii ────────────────────────────────────────────────── */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 10px;
  --radius-pill: 999px;

  /* ── Shadows ──────────────────────────────────────────────── */
  --shadow-soft:
    0 1px 2px rgba(31, 27, 22, 0.04), 0 4px 12px rgba(31, 27, 22, 0.06);
  --shadow-lifted:
    0 2px 4px rgba(31, 27, 22, 0.06), 0 12px 32px rgba(31, 27, 22, 0.08);

  /* ── Layout ───────────────────────────────────────────────── */
  --col-sidebar: 240px;
  --col-content: 720px;
  --col-toc: 220px;
  --gutter: var(--space-6);
  --content-max: 1280px;

  /* ── Motion ───────────────────────────────────────────────── */
  --ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  --dur-fast: 120ms;
  --dur-base: 200ms;
  --dur-slow: 320ms;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #1a1712;
    --color-bg-elevated: #221e17;
    --color-bg-subtle: #2b261e;
    --color-fg: #f2ede0;
    --color-fg-muted: #b4a993;
    --color-fg-subtle: #8a7d6a;
    --color-border: #3a3328;
    --color-border-strong: #554a38;
    --color-accent: #d4a22a;
    --color-accent-hover: #e6b441;
    --color-accent-soft: #3a2f18;
    --color-danger: #e55c4f;
    --shadow-soft:
      0 1px 2px rgba(0, 0, 0, 0.3), 0 4px 12px rgba(0, 0, 0, 0.4);
    --shadow-lifted:
      0 2px 4px rgba(0, 0, 0, 0.35), 0 12px 32px rgba(0, 0, 0, 0.5);
  }
}
```

- [ ] **Step 2: Verify file**

Run: `wc -l src/styles/tokens.css`
Expected: roughly 80–110 lines.

- [ ] **Step 3: Commit**

```bash
git add src/styles/tokens.css
git commit -m "feat(ui): add Editorial x Technical design tokens"
```

---

## Task 3: Create prose overrides

**Files:**
- Create: `src/styles/prose.css`

- [ ] **Step 1: Create `src/styles/prose.css`**

```css
/* Typography for rendered Markdown body.
   Extends @tailwindcss/typography by mapping it to our tokens. */

.prose {
  --tw-prose-body: var(--color-fg);
  --tw-prose-headings: var(--color-fg);
  --tw-prose-lead: var(--color-fg-muted);
  --tw-prose-links: var(--color-accent);
  --tw-prose-bold: var(--color-fg);
  --tw-prose-counters: var(--color-fg-muted);
  --tw-prose-bullets: var(--color-border-strong);
  --tw-prose-hr: var(--color-border);
  --tw-prose-quotes: var(--color-fg);
  --tw-prose-quote-borders: var(--color-accent-soft);
  --tw-prose-captions: var(--color-fg-muted);
  --tw-prose-code: var(--color-fg);
  --tw-prose-pre-code: var(--color-fg);
  --tw-prose-pre-bg: var(--color-bg-elevated);
  --tw-prose-th-borders: var(--color-border-strong);
  --tw-prose-td-borders: var(--color-border);

  font-family: var(--font-sans);
  font-size: var(--fs-md);
  line-height: var(--lh-relaxed);
  color: var(--color-fg);
}

.prose h1,
.prose h2,
.prose h3 {
  font-family: var(--font-serif);
  font-weight: 500;
  letter-spacing: var(--tracking-tight);
  line-height: var(--lh-snug);
}

.prose h2 {
  margin-top: var(--space-7);
}

.prose h3 {
  margin-top: var(--space-6);
}

.prose code,
.prose pre {
  font-family: var(--font-mono);
  font-size: var(--fs-sm);
}

.prose pre {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
}

.prose :not(pre) > code {
  background: var(--color-bg-elevated);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  font-size: 0.9em;
}

.prose a {
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
  transition: color var(--dur-fast) var(--ease-out);
}

.prose a:hover {
  color: var(--color-accent-hover);
}

.prose blockquote {
  font-style: normal;
  border-left-width: 3px;
  padding-left: var(--space-4);
  color: var(--color-fg-muted);
}

/* Mermaid / KaTeX rendered elements inherit token-backed colors */
.prose svg[role="img"] {
  max-width: 100%;
  height: auto;
}

.prose .katex-display {
  overflow-x: auto;
  overflow-y: hidden;
  padding: var(--space-2) 0;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/prose.css
git commit -m "feat(ui): token-driven prose overrides"
```

---

## Task 4: Rewrite global.css to use tokens

**Files:**
- Modify: `src/styles/global.css`

- [ ] **Step 1: Replace `src/styles/global.css` contents**

```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";

@import "./tokens.css";

/* Self-hosted variable fonts */
@import "@fontsource-variable/source-serif-4";
@import "@fontsource-variable/inter";
@import "@fontsource-variable/jetbrains-mono";

@import "./prose.css";

@theme {
  --font-sans: var(--font-sans);
  --font-serif: var(--font-serif);
  --font-mono: var(--font-mono);

  --color-bg: var(--color-bg);
  --color-bg-elevated: var(--color-bg-elevated);
  --color-bg-subtle: var(--color-bg-subtle);
  --color-fg: var(--color-fg);
  --color-fg-muted: var(--color-fg-muted);
  --color-fg-subtle: var(--color-fg-subtle);
  --color-border: var(--color-border);
  --color-border-strong: var(--color-border-strong);
  --color-accent: var(--color-accent);
  --color-accent-hover: var(--color-accent-hover);
  --color-accent-soft: var(--color-accent-soft);
  --color-danger: var(--color-danger);

  --radius-sm: var(--radius-sm);
  --radius-md: var(--radius-md);
  --radius-lg: var(--radius-lg);
  --radius-pill: var(--radius-pill);

  --shadow-soft: var(--shadow-soft);
  --shadow-lifted: var(--shadow-lifted);
}

html {
  scroll-behavior: smooth;
  color-scheme: light dark;
  background: var(--color-bg);
  color: var(--color-fg);
}

body {
  font-family: var(--font-sans);
  font-size: var(--fs-base);
  line-height: var(--lh-normal);
  background: var(--color-bg);
  color: var(--color-fg);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

/* Focus-visible uses the accent-derived ring across the app */
:where(a, button, input, select, textarea, [tabindex]):focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

/* Use mono for code even outside prose. */
code,
kbd,
samp {
  font-family: var(--font-mono);
  font-size: 0.95em;
}

/* Preserve KaTeX layer */
@import "katex/dist/katex.min.css";
```

> Note: `@import "katex/dist/katex.min.css"` replaces the duplicate import in `BaseLayout.astro` to consolidate styles. We will remove the import from BaseLayout in Task 5.

- [ ] **Step 2: Commit**

```bash
git add src/styles/global.css
git commit -m "feat(ui): wire tokens, fonts, focus ring into global stylesheet"
```

---

## Task 5: Introduce the three-column BaseLayout

**Files:**
- Modify: `src/layouts/BaseLayout.astro`
- Create: `src/components/Header.astro`
- Create: `src/components/SkipLink.astro`

- [ ] **Step 1: Create `src/components/SkipLink.astro`**

```astro
---
/**
 * Accessible skip-link. Visually hidden until focused, then pinned to
 * top-left so keyboard users can jump past the sidebar/header.
 */
---

<a href="#main" class="skip-link">Перейти к содержимому</a>

<style>
  .skip-link {
    position: absolute;
    left: var(--space-4);
    top: var(--space-4);
    z-index: 100;
    background: var(--color-bg-elevated);
    color: var(--color-fg);
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    font-family: var(--font-sans);
    font-size: var(--fs-sm);
    transform: translateY(-200%);
    transition: transform var(--dur-base) var(--ease-out);
  }
  .skip-link:focus {
    transform: translateY(0);
  }
</style>
```

- [ ] **Step 2: Create `src/components/Header.astro`**

```astro
---
/**
 * Site header with title, primary nav, and the mobile drawer trigger.
 * The trigger is a `<button>` controlling the drawer via a custom event;
 * the drawer itself lives in MobileDrawer.astro.
 */
const { pathname } = Astro.url;
const isActive = (prefix: string): boolean =>
  prefix === "/" ? pathname === "/" : pathname.startsWith(prefix);
---

<header class="site-header" role="banner">
  <div class="site-header__inner">
    <a href="/" class="site-header__brand" aria-label="На главную">
      <span class="site-header__label">Блог</span>
      <span class="site-header__dot" aria-hidden="true">·</span>
      <span class="site-header__author">artka.dev</span>
    </a>

    <nav class="site-header__nav" aria-label="Основная навигация">
      <a href="/blog" aria-current={isActive("/blog") ? "page" : undefined}>Статьи</a>
      <a href="/about" aria-current={isActive("/about") ? "page" : undefined}>Обо мне</a>
    </nav>

    <button
      type="button"
      class="site-header__drawer-btn"
      aria-label="Открыть список статей"
      aria-controls="site-drawer"
      aria-expanded="false"
      data-drawer-trigger
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
      </svg>
    </button>
  </div>
</header>

<style>
  .site-header {
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg);
  }
  .site-header__inner {
    max-width: var(--content-max);
    margin: 0 auto;
    padding: var(--space-4) var(--space-5);
    display: flex;
    align-items: center;
    gap: var(--space-5);
  }
  .site-header__brand {
    font-family: var(--font-serif);
    font-size: var(--fs-lg);
    font-weight: 500;
    color: var(--color-fg);
    text-decoration: none;
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
  }
  .site-header__dot {
    color: var(--color-accent);
  }
  .site-header__author {
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    color: var(--color-fg-muted);
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
  }
  .site-header__nav {
    margin-left: auto;
    display: flex;
    gap: var(--space-5);
    font-size: var(--fs-sm);
  }
  .site-header__nav a {
    color: var(--color-fg-muted);
    text-decoration: none;
  }
  .site-header__nav a[aria-current="page"] {
    color: var(--color-fg);
    border-bottom: 1px solid var(--color-accent);
  }
  .site-header__nav a:hover {
    color: var(--color-fg);
  }

  .site-header__drawer-btn {
    display: none;
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-2);
    color: var(--color-fg);
    cursor: pointer;
  }

  @media (max-width: 1023px) {
    .site-header__drawer-btn {
      display: inline-flex;
    }
    .site-header__nav {
      margin-left: 0;
    }
  }
</style>
```

- [ ] **Step 3: Replace `src/layouts/BaseLayout.astro`**

```astro
---
import "~/styles/global.css";
import { ClientRouter } from "astro:transitions";
import Header from "~/components/Header.astro";
import SkipLink from "~/components/SkipLink.astro";

interface Props {
  title: string;
  description?: string;
  ogImage?: string;
  /** When true, omits the right TOC column for list/about/home pages. */
  fullWidth?: boolean;
}

const { title, description = "Personal blog", ogImage, fullWidth = false } = Astro.props;
const canonical = new URL(Astro.url.pathname, Astro.site ?? Astro.url).toString();
---

<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <meta name="description" content={description} />
    <link rel="canonical" href={canonical} />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <meta property="og:type" content="website" />
    {ogImage && <meta property="og:image" content={ogImage} />}
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="sitemap" href="/sitemap-index.xml" />
    <link rel="alternate" type="application/rss+xml" title={title} href="/rss.xml" />
    <ClientRouter />
  </head>
  <body>
    <SkipLink />
    <Header />
    <div class="layout" data-full-width={fullWidth}>
      <aside class="layout__sidebar" aria-label="Статьи блога">
        <slot name="sidebar" />
      </aside>
      <main id="main" class="layout__main">
        <slot />
      </main>
      <aside class="layout__toc" aria-label="Оглавление статьи">
        <slot name="toc" />
      </aside>
    </div>
    <footer class="site-footer">
      <div class="site-footer__inner">
        <p>© {new Date().getFullYear()} — artka.dev</p>
        <p class="site-footer__meta">Astro · on-demand · WCAG AA</p>
      </div>
    </footer>

    <style>
      .layout {
        max-width: var(--content-max);
        margin: 0 auto;
        padding: var(--space-6) var(--space-5);
        display: grid;
        grid-template-columns: var(--col-sidebar) minmax(0, 1fr) var(--col-toc);
        gap: var(--gutter);
      }
      .layout[data-full-width="true"] {
        grid-template-columns: var(--col-sidebar) minmax(0, 1fr);
      }
      .layout[data-full-width="true"] .layout__toc {
        display: none;
      }
      .layout__sidebar,
      .layout__toc {
        position: sticky;
        top: var(--space-5);
        align-self: start;
        max-height: calc(100vh - var(--space-6));
        overflow-y: auto;
      }
      .layout__main {
        min-width: 0;
      }
      @media (max-width: 1023px) {
        .layout {
          grid-template-columns: minmax(0, 1fr);
        }
        .layout__sidebar,
        .layout__toc {
          display: none;
        }
      }

      .site-footer {
        border-top: 1px solid var(--color-border);
        margin-top: var(--space-9);
      }
      .site-footer__inner {
        max-width: var(--content-max);
        margin: 0 auto;
        padding: var(--space-5);
        font-size: var(--fs-sm);
        color: var(--color-fg-muted);
        display: flex;
        justify-content: space-between;
        gap: var(--space-4);
      }
      .site-footer__meta {
        font-family: var(--font-mono);
        font-size: var(--fs-xs);
        letter-spacing: var(--tracking-wide);
        text-transform: uppercase;
      }
    </style>
  </body>
</html>
```

- [ ] **Step 4: Verify dev server boots**

Run: `pnpm dev` then open `http://localhost:4321` in your browser. You should see: new header, centered main column, warm cream background, left and right asides rendered empty (since slots are unset on pages). Stop dev with `Ctrl+C`.

- [ ] **Step 5: Commit**

```bash
git add src/components/Header.astro src/components/SkipLink.astro src/layouts/BaseLayout.astro
git commit -m "feat(ui): three-column layout with header and skip-link"
```

---

## Task 6: `getPublishedPosts` helper — failing test

**Files:**
- Create: `src/lib/posts/list.ts`
- Create: `src/lib/posts/list.test.ts`

- [ ] **Step 1: Create empty module so imports resolve**

`src/lib/posts/list.ts`:

```ts
import type { CollectionEntry } from "astro:content";

export type PostEntry = CollectionEntry<"posts">;

export async function getPublishedPosts(): Promise<readonly PostEntry[]> {
  throw new Error("not implemented");
}

/**
 * Parses a leading numeric prefix from a slug (e.g. "02-context-and-cache" → 2).
 * Returns `null` when absent — caller decides the fallback sort key.
 */
export function parseSlugOrder(slug: string): number | null {
  const match = /^(\d+)[-_]/.exec(slug);
  if (!match || match[1] === undefined) return null;
  const n = Number.parseInt(match[1], 10);
  return Number.isFinite(n) ? n : null;
}
```

- [ ] **Step 2: Create `src/lib/posts/list.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { parseSlugOrder } from "./list";

describe("parseSlugOrder", () => {
  it("extracts leading numeric prefix with dash", () => {
    expect(parseSlugOrder("02-context-and-cache")).toBe(2);
  });

  it("extracts leading numeric prefix with underscore", () => {
    expect(parseSlugOrder("10_agent-teams")).toBe(10);
  });

  it("returns null when slug has no numeric prefix", () => {
    expect(parseSlugOrder("hello-world")).toBeNull();
  });

  it("returns null for malformed prefix", () => {
    expect(parseSlugOrder("-2-foo")).toBeNull();
  });

  it("returns null for empty slug", () => {
    expect(parseSlugOrder("")).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `pnpm test -- src/lib/posts/list.test.ts`
Expected: all 5 `parseSlugOrder` tests pass. (No `getPublishedPosts` test yet.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/posts/list.ts src/lib/posts/list.test.ts
git commit -m "test(ui): parseSlugOrder covers numeric prefix extraction"
```

---

## Task 7: Implement `getPublishedPosts`

**Files:**
- Modify: `src/lib/posts/list.ts`

- [ ] **Step 1: Replace `src/lib/posts/list.ts`**

```ts
import { getCollection, type CollectionEntry } from "astro:content";

export type PostEntry = CollectionEntry<"posts">;

/**
 * Parses a leading numeric prefix from a slug (e.g. "02-context-and-cache" → 2).
 * Returns `null` when absent — caller decides the fallback sort key.
 */
export function parseSlugOrder(slug: string): number | null {
  const match = /^(\d+)[-_]/.exec(slug);
  if (!match || match[1] === undefined) return null;
  const n = Number.parseInt(match[1], 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Returns published (non-draft) posts, sorted so that:
 *  - posts whose slug starts with a numeric prefix come first, ordered ascending
 *    by that number (matches guide-series ordering like "01-", "02-", …);
 *  - remaining posts follow, ordered by pubDate descending.
 *
 * This is a pure transform over `getCollection("posts")` and can be reused by
 * the sidebar, the blog index, and the RSS feed without each reimplementing
 * sort semantics.
 */
export async function getPublishedPosts(): Promise<readonly PostEntry[]> {
  const posts = await getCollection("posts", (entry) => !entry.data.draft);
  return [...posts].sort(comparePosts);
}

export function comparePosts(a: PostEntry, b: PostEntry): number {
  const aOrder = parseSlugOrder(a.id);
  const bOrder = parseSlugOrder(b.id);
  if (aOrder !== null && bOrder !== null) return aOrder - bOrder;
  if (aOrder !== null) return -1;
  if (bOrder !== null) return 1;
  return b.data.pubDate.getTime() - a.data.pubDate.getTime();
}
```

- [ ] **Step 2: Add `comparePosts` test to `src/lib/posts/list.test.ts` (append)**

```ts
import { comparePosts, type PostEntry } from "./list";

function fakePost(id: string, pubDate: Date, draft = false): PostEntry {
  return {
    id,
    slug: id,
    body: "",
    collection: "posts",
    data: {
      title: id,
      description: "desc",
      pubDate,
      tags: [],
      draft,
    },
  } as unknown as PostEntry;
}

describe("comparePosts", () => {
  it("numerically ordered slugs come before non-numeric", () => {
    const a = fakePost("02-foo", new Date("2026-01-01"));
    const b = fakePost("hello-world", new Date("2026-06-01"));
    expect(comparePosts(a, b)).toBeLessThan(0);
  });

  it("ascending numeric order for two prefixed slugs", () => {
    const a = fakePost("02-foo", new Date("2026-01-01"));
    const b = fakePost("10-bar", new Date("2026-01-01"));
    expect(comparePosts(a, b)).toBeLessThan(0);
  });

  it("pubDate descending when neither has numeric prefix", () => {
    const a = fakePost("alpha", new Date("2026-01-01"));
    const b = fakePost("beta", new Date("2026-06-01"));
    expect(comparePosts(a, b)).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run the tests**

Run: `pnpm test -- src/lib/posts/list.test.ts`
Expected: 8 passing tests.

- [ ] **Step 4: Commit**

```bash
git add src/lib/posts/list.ts src/lib/posts/list.test.ts
git commit -m "feat(ui): getPublishedPosts with stable guide-series ordering"
```

---

## Task 8: `SiteSidebar` component — render post list

**Files:**
- Create: `src/components/SiteSidebar.astro`
- Modify: `src/pages/index.astro` (wire sidebar slot)
- Modify: `src/pages/blog/index.astro` (wire sidebar slot)
- Modify: `src/pages/blog/[...slug].astro` (wire sidebar slot)
- Modify: `src/pages/about.astro` (wire sidebar slot)

- [ ] **Step 1: Create `src/components/SiteSidebar.astro`**

```astro
---
import { getPublishedPosts, parseSlugOrder } from "~/lib/posts/list";

interface Props {
  /** Slug of the currently-displayed post, if any — used for active highlight. */
  activeSlug?: string;
}

const { activeSlug } = Astro.props;
const posts = await getPublishedPosts();

// Split into "guide series" (numeric slugs) and "other" so the sidebar can
// group them visually — matches the structure of the existing content.
const series = posts.filter((p) => parseSlugOrder(p.id) !== null);
const extras = posts.filter((p) => parseSlugOrder(p.id) === null);
---

<nav class="sidebar">
  {
    series.length > 0 && (
      <section class="sidebar__section">
        <h2 class="sidebar__label">Claude Code Guide</h2>
        <ol class="sidebar__list" reversed={false}>
          {series.map((post) => {
            const n = parseSlugOrder(post.id);
            const isActive = post.id === activeSlug;
            return (
              <li>
                <a
                  href={`/blog/${post.id}`}
                  class="sidebar__link"
                  aria-current={isActive ? "page" : undefined}
                >
                  <span class="sidebar__num">{n !== null ? String(n).padStart(2, "0") : ""}</span>
                  <span class="sidebar__title">{post.data.title}</span>
                </a>
              </li>
            );
          })}
        </ol>
      </section>
    )
  }
  {
    extras.length > 0 && (
      <section class="sidebar__section">
        <h2 class="sidebar__label">Другие статьи</h2>
        <ul class="sidebar__list">
          {extras.map((post) => (
            <li>
              <a
                href={`/blog/${post.id}`}
                class="sidebar__link"
                aria-current={post.id === activeSlug ? "page" : undefined}
              >
                <span class="sidebar__title">{post.data.title}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    )
  }
</nav>

<style>
  .sidebar {
    font-size: var(--fs-sm);
    line-height: var(--lh-snug);
  }
  .sidebar__section + .sidebar__section {
    margin-top: var(--space-6);
  }
  .sidebar__label {
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    color: var(--color-fg-subtle);
    margin: 0 0 var(--space-3) 0;
    font-weight: 500;
  }
  .sidebar__list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .sidebar__link {
    display: grid;
    grid-template-columns: 22px 1fr;
    gap: var(--space-2);
    align-items: baseline;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    color: var(--color-fg-muted);
    text-decoration: none;
    transition:
      color var(--dur-fast) var(--ease-out),
      background var(--dur-fast) var(--ease-out);
  }
  .sidebar__link:hover {
    color: var(--color-fg);
    background: var(--color-bg-elevated);
  }
  .sidebar__link[aria-current="page"] {
    color: var(--color-fg);
    background: var(--color-accent-soft);
    box-shadow: inset 2px 0 0 var(--color-accent);
  }
  .sidebar__num {
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    color: var(--color-fg-subtle);
    font-variant-numeric: tabular-nums;
  }
  .sidebar__link[aria-current="page"] .sidebar__num {
    color: var(--color-accent);
  }
  .sidebar__title {
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
```

- [ ] **Step 2: Update `src/pages/index.astro` to include the sidebar slot**

Read the current file and wire `<SiteSidebar slot="sidebar" />` into it. If the file currently has a different layout use, adapt the BaseLayout usage — the slot name is `sidebar`. Example skeleton (edit to match actual content):

```astro
---
import BaseLayout from "~/layouts/BaseLayout.astro";
import SiteSidebar from "~/components/SiteSidebar.astro";
---

<BaseLayout title="Blog" fullWidth={true}>
  <SiteSidebar slot="sidebar" />
  <!-- existing homepage content here -->
</BaseLayout>
```

Apply the same pattern to `src/pages/blog/index.astro`, `src/pages/about.astro`. For `src/pages/blog/[...slug].astro`, pass `activeSlug`:

```astro
<SiteSidebar slot="sidebar" activeSlug={post.id} />
```

- [ ] **Step 3: Verify dev render**

Run: `pnpm dev` then open `/`, `/blog`, and any post page. Left sidebar should show two sections ("Claude Code Guide" + "Другие статьи"), with active post highlighted on the post page. Stop dev.

- [ ] **Step 4: Commit**

```bash
git add src/components/SiteSidebar.astro src/pages/index.astro src/pages/blog/index.astro src/pages/blog/\[...slug\].astro src/pages/about.astro
git commit -m "feat(ui): SiteSidebar with guide-series grouping and active highlight"
```

---

## Task 9: TOC tree builder — failing test

**Files:**
- Create: `src/lib/posts/toc.ts`
- Create: `src/lib/posts/toc.test.ts`

- [ ] **Step 1: Create `src/lib/posts/toc.ts` stub**

```ts
import type { MarkdownHeading } from "astro";

export interface TocNode {
  readonly depth: 2 | 3;
  readonly text: string;
  readonly slug: string;
  readonly children: readonly TocNode[];
}

/**
 * Builds a two-level (h2 → h3) nested tree from Astro's flat heading list.
 * Ignores h1 (the post title is rendered separately) and h4+ (noise in a TOC).
 * Orphan h3s (appearing before any h2) attach to a synthetic "Introduction"
 * h2 so scroll-spy still has a target.
 */
export function buildTocTree(_headings: readonly MarkdownHeading[]): readonly TocNode[] {
  throw new Error("not implemented");
}
```

- [ ] **Step 2: Create `src/lib/posts/toc.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import type { MarkdownHeading } from "astro";
import { buildTocTree } from "./toc";

function h(depth: number, text: string, slug: string): MarkdownHeading {
  return { depth, text, slug };
}

describe("buildTocTree", () => {
  it("returns empty array for no headings", () => {
    expect(buildTocTree([])).toEqual([]);
  });

  it("drops h1 entries", () => {
    const result = buildTocTree([h(1, "Title", "title"), h(2, "Section", "section")]);
    expect(result).toHaveLength(1);
    expect(result[0]?.depth).toBe(2);
    expect(result[0]?.slug).toBe("section");
  });

  it("drops h4 and deeper entries", () => {
    const result = buildTocTree([h(2, "A", "a"), h(4, "Deep", "deep")]);
    expect(result).toHaveLength(1);
    expect(result[0]?.children).toEqual([]);
  });

  it("nests h3s under the nearest preceding h2", () => {
    const result = buildTocTree([
      h(2, "Section A", "a"),
      h(3, "A.1", "a-1"),
      h(3, "A.2", "a-2"),
      h(2, "Section B", "b"),
      h(3, "B.1", "b-1"),
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]?.slug).toBe("a");
    expect(result[0]?.children.map((c) => c.slug)).toEqual(["a-1", "a-2"]);
    expect(result[1]?.slug).toBe("b");
    expect(result[1]?.children.map((c) => c.slug)).toEqual(["b-1"]);
  });

  it("creates a synthetic parent for orphan h3 before any h2", () => {
    const result = buildTocTree([h(3, "Orphan", "orphan"), h(2, "Real", "real")]);
    expect(result).toHaveLength(2);
    expect(result[0]?.slug).toBe("__intro");
    expect(result[0]?.text).toBe("Introduction");
    expect(result[0]?.children.map((c) => c.slug)).toEqual(["orphan"]);
    expect(result[1]?.slug).toBe("real");
  });
});
```

- [ ] **Step 3: Run tests — they should fail**

Run: `pnpm test -- src/lib/posts/toc.test.ts`
Expected: all tests FAIL with `not implemented`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/posts/toc.ts src/lib/posts/toc.test.ts
git commit -m "test(ui): failing tests for buildTocTree"
```

---

## Task 10: Implement `buildTocTree`

**Files:**
- Modify: `src/lib/posts/toc.ts`

- [ ] **Step 1: Replace `src/lib/posts/toc.ts`**

```ts
import type { MarkdownHeading } from "astro";

export interface TocNode {
  readonly depth: 2 | 3;
  readonly text: string;
  readonly slug: string;
  readonly children: readonly TocNode[];
}

interface MutableTocNode {
  depth: 2 | 3;
  text: string;
  slug: string;
  children: MutableTocNode[];
}

const SYNTHETIC_INTRO: Readonly<Pick<MutableTocNode, "depth" | "text" | "slug">> = {
  depth: 2,
  text: "Introduction",
  slug: "__intro",
};

export function buildTocTree(headings: readonly MarkdownHeading[]): readonly TocNode[] {
  const result: MutableTocNode[] = [];
  let currentParent: MutableTocNode | null = null;

  for (const heading of headings) {
    if (heading.depth === 2) {
      const node: MutableTocNode = {
        depth: 2,
        text: heading.text,
        slug: heading.slug,
        children: [],
      };
      result.push(node);
      currentParent = node;
    } else if (heading.depth === 3) {
      if (currentParent === null) {
        currentParent = { ...SYNTHETIC_INTRO, children: [] };
        result.push(currentParent);
      }
      currentParent.children.push({
        depth: 3,
        text: heading.text,
        slug: heading.slug,
        children: [],
      });
    }
    // depth 1 and 4+ are intentionally dropped
  }

  return result;
}
```

- [ ] **Step 2: Run tests — all should pass**

Run: `pnpm test -- src/lib/posts/toc.test.ts`
Expected: 5 passing tests.

- [ ] **Step 3: Commit**

```bash
git add src/lib/posts/toc.ts
git commit -m "feat(ui): buildTocTree nests h3 under preceding h2"
```

---

## Task 11: `PostTOC` component

**Files:**
- Create: `src/components/PostTOC.astro`

- [ ] **Step 1: Create `src/components/PostTOC.astro`**

```astro
---
import type { MarkdownHeading } from "astro";
import { buildTocTree, type TocNode } from "~/lib/posts/toc";

interface Props {
  headings: readonly MarkdownHeading[];
}

const { headings } = Astro.props;
const tree = buildTocTree(headings);
---

{
  tree.length > 0 && (
    <nav class="toc" aria-label="Оглавление статьи">
      <p class="toc__label">На этой странице</p>
      <ol class="toc__list">
        {tree.map((node: TocNode) => (
          <li>
            <a href={`#${node.slug}`} class="toc__link" data-toc-slug={node.slug}>
              {node.text}
            </a>
            {node.children.length > 0 && (
              <ol class="toc__sublist">
                {node.children.map((child) => (
                  <li>
                    <a href={`#${child.slug}`} class="toc__link toc__link--sub" data-toc-slug={child.slug}>
                      {child.text}
                    </a>
                  </li>
                ))}
              </ol>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

<style>
  .toc {
    font-size: var(--fs-sm);
    line-height: var(--lh-snug);
  }
  .toc__label {
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    color: var(--color-fg-subtle);
    margin: 0 0 var(--space-3) 0;
  }
  .toc__list,
  .toc__sublist {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .toc__sublist {
    margin: var(--space-1) 0 var(--space-2) var(--space-4);
    border-left: 1px solid var(--color-border);
    padding-left: var(--space-3);
  }
  .toc__link {
    display: block;
    padding: 4px 0;
    color: var(--color-fg-muted);
    text-decoration: none;
    transition: color var(--dur-fast) var(--ease-out);
    border-left: 2px solid transparent;
    padding-left: var(--space-3);
    margin-left: calc(-1 * var(--space-3));
  }
  .toc__link:hover {
    color: var(--color-fg);
  }
  .toc__link--sub {
    font-size: 0.95em;
  }
  .toc__link[data-active="true"] {
    color: var(--color-accent);
    border-left-color: var(--color-accent);
  }
</style>

<script>
  /**
   * Scroll-spy: observes each heading referenced by a TOC link, marks the
   * closest-to-top visible one as active. Robust to Astro view transitions
   * by re-wiring on `astro:page-load`.
   */
  function initTocScrollSpy(): void {
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>(".toc__link[data-toc-slug]"));
    if (links.length === 0) return;

    const linksBySlug = new Map(
      links.map((link) => [link.dataset["tocSlug"] ?? "", link]),
    );

    const targets = links
      .map((link) => document.getElementById(link.dataset["tocSlug"] ?? ""))
      .filter((el): el is HTMLElement => el !== null);

    if (targets.length === 0) return;

    let current: string | null = null;
    const setActive = (slug: string | null): void => {
      if (slug === current) return;
      if (current !== null) linksBySlug.get(current)?.removeAttribute("data-active");
      if (slug !== null) linksBySlug.get(slug)?.setAttribute("data-active", "true");
      current = slug;
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.target.getBoundingClientRect().top - b.target.getBoundingClientRect().top);
        if (visible.length > 0 && visible[0] !== undefined) {
          setActive(visible[0].target.id);
        }
      },
      {
        rootMargin: "0px 0px -70% 0px",
        threshold: [0, 1],
      },
    );
    targets.forEach((t) => observer.observe(t));
  }

  document.addEventListener("astro:page-load", initTocScrollSpy);
</script>
```

- [ ] **Step 2: Commit (integration into PostLayout is next)**

```bash
git add src/components/PostTOC.astro
git commit -m "feat(ui): PostTOC component with scroll-spy"
```

---

## Task 12: Wire TOC and refreshed PostLayout

**Files:**
- Modify: `src/layouts/PostLayout.astro`
- Modify: `src/pages/blog/[...slug].astro`

- [ ] **Step 1: Replace `src/layouts/PostLayout.astro`**

```astro
---
import BaseLayout from "./BaseLayout.astro";
import PostTOC from "~/components/PostTOC.astro";
import SiteSidebar from "~/components/SiteSidebar.astro";
import type { CollectionEntry } from "astro:content";
import type { MarkdownHeading } from "astro";

interface Props {
  post: CollectionEntry<"posts">;
  headings: readonly MarkdownHeading[];
}

const { post, headings } = Astro.props;
const { title, description, pubDate, updatedDate, tags } = post.data;
const readingTime = estimateReadingTimeMinutes(post.body ?? "");

function estimateReadingTimeMinutes(body: string): number {
  const words = body.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 220));
}
---

<BaseLayout title={title} description={description}>
  <SiteSidebar slot="sidebar" activeSlug={post.id} />
  <PostTOC slot="toc" headings={headings} />

  <article class="post">
    <header class="post__header">
      <p class="post__eyebrow">
        <time datetime={pubDate.toISOString()}>
          {pubDate.toLocaleDateString("ru-RU", { year: "numeric", month: "long", day: "numeric" })}
        </time>
        <span aria-hidden="true">·</span>
        <span>{readingTime} мин</span>
        {updatedDate && (
          <>
            <span aria-hidden="true">·</span>
            <span>обновлено {updatedDate.toLocaleDateString("ru-RU")}</span>
          </>
        )}
      </p>
      <h1 class="post__title">{title}</h1>
      {description && <p class="post__lede">{description}</p>}
      {
        tags.length > 0 && (
          <ul class="post__tags" aria-label="Теги">
            {tags.map((tag: string) => (
              <li>
                <a href={`/blog/tags/${tag}`}>#{tag}</a>
              </li>
            ))}
          </ul>
        )
      }
    </header>
    <div class="post__body prose">
      <slot />
    </div>
  </article>

  <style>
    .post {
      max-width: 720px;
    }
    .post__header {
      margin-bottom: var(--space-7);
      padding-bottom: var(--space-5);
      border-bottom: 1px solid var(--color-border);
    }
    .post__eyebrow {
      display: flex;
      gap: var(--space-2);
      align-items: center;
      font-family: var(--font-mono);
      font-size: var(--fs-xs);
      text-transform: uppercase;
      letter-spacing: var(--tracking-wide);
      color: var(--color-fg-muted);
      margin: 0 0 var(--space-3) 0;
    }
    .post__title {
      font-family: var(--font-serif);
      font-size: var(--fs-4xl);
      line-height: var(--lh-tight);
      letter-spacing: var(--tracking-tight);
      font-weight: 500;
      margin: 0 0 var(--space-3) 0;
      color: var(--color-fg);
    }
    .post__lede {
      font-family: var(--font-sans);
      font-size: var(--fs-lg);
      line-height: var(--lh-normal);
      color: var(--color-fg-muted);
      margin: 0 0 var(--space-4) 0;
    }
    .post__tags {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
    .post__tags a {
      font-family: var(--font-mono);
      font-size: var(--fs-xs);
      color: var(--color-fg-muted);
      text-decoration: none;
      padding: 2px 8px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      transition: all var(--dur-fast) var(--ease-out);
    }
    .post__tags a:hover {
      color: var(--color-fg);
      border-color: var(--color-accent);
    }
  </style>
</BaseLayout>
```

- [ ] **Step 2: Update `src/pages/blog/[...slug].astro` to pass headings**

```astro
---
import { getCollection, render, type CollectionEntry } from "astro:content";
import PostLayout from "~/layouts/PostLayout.astro";

type Post = CollectionEntry<"posts">;

export async function getStaticPaths() {
  const posts: Post[] = await getCollection("posts", (entry: Post) => !entry.data.draft);
  return posts.map((post: Post) => ({
    params: { slug: post.id },
    props: { post },
  }));
}

interface Props {
  post: Post;
}

const { post } = Astro.props;
const { Content, headings } = await render(post);
---

<PostLayout post={post} headings={headings}>
  <Content />
</PostLayout>
```

- [ ] **Step 3: Verify dev render on a post page**

Run: `pnpm dev` then open `http://localhost:4321/blog/02-context-and-cache`. Confirm:
- Left sidebar with post list, post 02 is highlighted.
- Right rail shows TOC with h2/h3 nested; scrolling highlights the current section.
- Title uses serif, meta line uses mono.

Stop dev.

- [ ] **Step 4: Commit**

```bash
git add src/layouts/PostLayout.astro src/pages/blog/\[...slug\].astro
git commit -m "feat(ui): editorial post layout with TOC and reading time"
```

---

## Task 13: Mobile drawer

**Files:**
- Create: `src/components/MobileDrawer.astro`
- Modify: `src/layouts/BaseLayout.astro`

- [ ] **Step 1: Create `src/components/MobileDrawer.astro`**

```astro
---
/**
 * Mobile drawer — wraps the sidebar in a slide-in panel.
 * Toggled by `[data-drawer-trigger]` buttons (e.g. in Header.astro).
 * Uses the native <dialog> element for free focus-trap and Esc-to-close.
 */
---

<dialog id="site-drawer" class="drawer" aria-label="Статьи блога">
  <div class="drawer__panel">
    <div class="drawer__head">
      <p class="drawer__title">Статьи</p>
      <button
        type="button"
        class="drawer__close"
        aria-label="Закрыть"
        data-drawer-close
      >
        ✕
      </button>
    </div>
    <div class="drawer__body">
      <slot />
    </div>
  </div>
</dialog>

<style>
  .drawer {
    border: none;
    padding: 0;
    margin: 0;
    max-width: 320px;
    width: 85vw;
    height: 100%;
    max-height: 100%;
    background: var(--color-bg);
    color: var(--color-fg);
    margin-right: auto;
    margin-left: 0;
    box-shadow: var(--shadow-lifted);
  }
  .drawer::backdrop {
    background: rgba(31, 27, 22, 0.45);
    backdrop-filter: blur(2px);
  }
  .drawer__panel {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .drawer__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--color-border);
  }
  .drawer__title {
    font-family: var(--font-serif);
    font-size: var(--fs-lg);
    margin: 0;
  }
  .drawer__close {
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-2) var(--space-3);
    color: var(--color-fg);
    cursor: pointer;
    font-family: var(--font-mono);
  }
  .drawer__body {
    padding: var(--space-4) var(--space-5);
    overflow-y: auto;
    flex: 1;
  }
</style>

<script>
  function initDrawer(): void {
    const drawer = document.getElementById("site-drawer");
    if (!(drawer instanceof HTMLDialogElement)) return;

    const triggers = document.querySelectorAll<HTMLButtonElement>("[data-drawer-trigger]");
    const closers = drawer.querySelectorAll<HTMLButtonElement>("[data-drawer-close]");

    const sync = (isOpen: boolean): void => {
      triggers.forEach((btn) => btn.setAttribute("aria-expanded", String(isOpen)));
    };

    triggers.forEach((btn) => {
      btn.addEventListener("click", () => {
        drawer.showModal();
        sync(true);
      });
    });
    closers.forEach((btn) => {
      btn.addEventListener("click", () => drawer.close());
    });
    drawer.addEventListener("close", () => sync(false));

    // Click-on-backdrop closes (dialog fires click where target === dialog)
    drawer.addEventListener("click", (event) => {
      if (event.target === drawer) drawer.close();
    });
  }

  document.addEventListener("astro:page-load", initDrawer);
</script>
```

- [ ] **Step 2: Wire `MobileDrawer` into `BaseLayout.astro`**

Edit `src/layouts/BaseLayout.astro` body so the drawer hosts the sidebar content on mobile (reusing the same slot via a duplicate render). Insert just before `<Header />`:

```astro
import MobileDrawer from "~/components/MobileDrawer.astro";
```

Then in the body, after `<SkipLink />`:

```astro
<MobileDrawer>
  <slot name="sidebar" />
</MobileDrawer>
```

Because Astro renders slot content once per occurrence, the same `<SiteSidebar slot="sidebar" />` will appear in both the desktop `<aside class="layout__sidebar">` and inside the drawer. That is the intended behavior (desktop aside is display-none below 1024px; the drawer is the only visible version).

- [ ] **Step 3: Verify mobile behavior**

Run: `pnpm dev`, open DevTools, switch to a mobile viewport (< 1024px). Confirm:
- Sidebar and TOC hidden, main content full-width.
- Hamburger button visible in header.
- Clicking hamburger slides drawer in from left; Esc closes; backdrop click closes.
- Focus is trapped while open (Tab cycles inside drawer).

Stop dev.

- [ ] **Step 4: Commit**

```bash
git add src/components/MobileDrawer.astro src/layouts/BaseLayout.astro
git commit -m "feat(ui): mobile drawer for sidebar using native dialog"
```

---

## Task 14: Refresh home page and blog list

**Files:**
- Modify: `src/pages/index.astro`
- Modify: `src/pages/blog/index.astro`

Use the final header/layout aesthetic for these two pages. Exact current content of `index.astro` may differ — read it first and adapt minimally.

- [ ] **Step 1: Replace `src/pages/blog/index.astro`**

```astro
---
import BaseLayout from "~/layouts/BaseLayout.astro";
import SiteSidebar from "~/components/SiteSidebar.astro";
import { getPublishedPosts, parseSlugOrder } from "~/lib/posts/list";

const posts = await getPublishedPosts();
const allTags = Array.from(new Set(posts.flatMap((p) => p.data.tags))).sort();
---

<BaseLayout title="Статьи" description="Все публикации блога" fullWidth={true}>
  <SiteSidebar slot="sidebar" />

  <section class="list">
    <header class="list__header">
      <p class="list__eyebrow">Архив</p>
      <h1 class="list__title">Статьи</h1>
    </header>

    {
      allTags.length > 0 && (
        <nav class="list__tags" aria-label="Теги">
          {allTags.map((tag: string) => (
            <a href={`/blog/tags/${tag}`}>#{tag}</a>
          ))}
        </nav>
      )
    }

    <ul class="list__posts">
      {
        posts.map((post) => {
          const n = parseSlugOrder(post.id);
          return (
            <li class="list__item">
              <a href={`/blog/${post.id}`} class="list__link">
                <span class="list__num">{n !== null ? String(n).padStart(2, "0") : "·"}</span>
                <span class="list__body">
                  <h2 class="list__post-title">{post.data.title}</h2>
                  <p class="list__post-desc">{post.data.description}</p>
                  <time datetime={post.data.pubDate.toISOString()} class="list__post-date">
                    {post.data.pubDate.toLocaleDateString("ru-RU", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </time>
                </span>
              </a>
            </li>
          );
        })
      }
    </ul>
  </section>

  <style>
    .list {
      max-width: 720px;
    }
    .list__header {
      margin-bottom: var(--space-6);
      padding-bottom: var(--space-4);
      border-bottom: 1px solid var(--color-border);
    }
    .list__eyebrow {
      font-family: var(--font-mono);
      font-size: var(--fs-xs);
      text-transform: uppercase;
      letter-spacing: var(--tracking-wide);
      color: var(--color-fg-subtle);
      margin: 0 0 var(--space-2) 0;
    }
    .list__title {
      font-family: var(--font-serif);
      font-size: var(--fs-3xl);
      font-weight: 500;
      margin: 0;
      color: var(--color-fg);
      letter-spacing: var(--tracking-tight);
    }
    .list__tags {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin-bottom: var(--space-6);
    }
    .list__tags a {
      font-family: var(--font-mono);
      font-size: var(--fs-xs);
      color: var(--color-fg-muted);
      text-decoration: none;
      padding: 2px 8px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-pill);
      transition: all var(--dur-fast) var(--ease-out);
    }
    .list__tags a:hover {
      color: var(--color-accent);
      border-color: var(--color-accent);
    }
    .list__posts {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .list__item + .list__item {
      border-top: 1px solid var(--color-border);
    }
    .list__link {
      display: grid;
      grid-template-columns: 42px 1fr;
      gap: var(--space-4);
      padding: var(--space-5) 0;
      color: inherit;
      text-decoration: none;
      transition: transform var(--dur-fast) var(--ease-out);
    }
    .list__link:hover {
      transform: translateX(2px);
    }
    .list__num {
      font-family: var(--font-mono);
      font-size: var(--fs-lg);
      color: var(--color-fg-subtle);
      font-variant-numeric: tabular-nums;
      padding-top: 2px;
    }
    .list__post-title {
      font-family: var(--font-serif);
      font-size: var(--fs-xl);
      line-height: var(--lh-snug);
      letter-spacing: var(--tracking-tight);
      font-weight: 500;
      margin: 0 0 var(--space-2) 0;
      color: var(--color-fg);
    }
    .list__link:hover .list__post-title {
      color: var(--color-accent-hover);
    }
    .list__post-desc {
      margin: 0 0 var(--space-2) 0;
      color: var(--color-fg-muted);
      line-height: var(--lh-normal);
    }
    .list__post-date {
      font-family: var(--font-mono);
      font-size: var(--fs-xs);
      color: var(--color-fg-subtle);
      text-transform: uppercase;
      letter-spacing: var(--tracking-wide);
    }
  </style>
</BaseLayout>
```

- [ ] **Step 2: Refresh `src/pages/index.astro`**

Read the current file, preserve its content, and swap to the new aesthetic. Minimal refresh:

```astro
---
import BaseLayout from "~/layouts/BaseLayout.astro";
import SiteSidebar from "~/components/SiteSidebar.astro";
import { getPublishedPosts } from "~/lib/posts/list";

const posts = await getPublishedPosts();
const latest = posts.slice(0, 3);
---

<BaseLayout title="artka.dev" description="Персональный блог" fullWidth={true}>
  <SiteSidebar slot="sidebar" />

  <section class="hero">
    <p class="hero__eyebrow">Personal blog · on writing code with AI</p>
    <h1 class="hero__title">
      Конкретные записи про Claude Code, AI-агентов и разработку на Astro.
    </h1>
    <p class="hero__lede">
      Серия из четырнадцати частей про то, как устроен Claude Code изнутри —
      context, skills, hooks, MCP, subagents, модели и антипаттерны.
    </p>
    <a href="/blog" class="hero__cta">Все статьи →</a>
  </section>

  <section class="latest">
    <h2 class="latest__label">Последние публикации</h2>
    <ul class="latest__list">
      {
        latest.map((post) => (
          <li>
            <a href={`/blog/${post.id}`} class="latest__link">
              <span class="latest__title">{post.data.title}</span>
              <time datetime={post.data.pubDate.toISOString()} class="latest__date">
                {post.data.pubDate.toLocaleDateString("ru-RU", { month: "short", day: "numeric" })}
              </time>
            </a>
          </li>
        ))
      }
    </ul>
  </section>

  <style>
    .hero {
      max-width: 720px;
      padding: var(--space-6) 0;
    }
    .hero__eyebrow {
      font-family: var(--font-mono);
      font-size: var(--fs-xs);
      text-transform: uppercase;
      letter-spacing: var(--tracking-wide);
      color: var(--color-fg-subtle);
      margin: 0 0 var(--space-4) 0;
    }
    .hero__title {
      font-family: var(--font-serif);
      font-size: var(--fs-3xl);
      line-height: var(--lh-tight);
      letter-spacing: var(--tracking-tight);
      font-weight: 500;
      margin: 0 0 var(--space-4) 0;
      color: var(--color-fg);
    }
    .hero__lede {
      font-size: var(--fs-lg);
      line-height: var(--lh-normal);
      color: var(--color-fg-muted);
      margin: 0 0 var(--space-5) 0;
    }
    .hero__cta {
      display: inline-block;
      font-family: var(--font-mono);
      font-size: var(--fs-sm);
      color: var(--color-accent);
      text-decoration: none;
      border-bottom: 1px dashed var(--color-accent);
      padding-bottom: 1px;
    }
    .hero__cta:hover {
      color: var(--color-accent-hover);
    }

    .latest {
      margin-top: var(--space-8);
      padding-top: var(--space-5);
      border-top: 1px solid var(--color-border);
      max-width: 720px;
    }
    .latest__label {
      font-family: var(--font-mono);
      font-size: var(--fs-xs);
      text-transform: uppercase;
      letter-spacing: var(--tracking-wide);
      color: var(--color-fg-subtle);
      font-weight: 500;
      margin: 0 0 var(--space-4) 0;
    }
    .latest__list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .latest__link {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: var(--space-4);
      padding: var(--space-3) 0;
      border-bottom: 1px dotted var(--color-border);
      color: var(--color-fg);
      text-decoration: none;
    }
    .latest__title {
      font-family: var(--font-serif);
      font-size: var(--fs-lg);
      line-height: var(--lh-snug);
    }
    .latest__date {
      font-family: var(--font-mono);
      font-size: var(--fs-xs);
      color: var(--color-fg-subtle);
    }
    .latest__link:hover .latest__title {
      color: var(--color-accent-hover);
    }
  </style>
</BaseLayout>
```

- [ ] **Step 3: Verify dev render**

Run `pnpm dev`, browse `/`, `/blog`, a post. All three should now share the Editorial × Technical look.

- [ ] **Step 4: Commit**

```bash
git add src/pages/index.astro src/pages/blog/index.astro
git commit -m "feat(ui): home and blog-list pages use editorial aesthetic"
```

---

## Task 15: E2E test — navigation works

**Files:**
- Create: `tests/e2e/navigation.spec.ts`

- [ ] **Step 1: Create `tests/e2e/navigation.spec.ts`**

```ts
import { expect, test } from "@playwright/test";

test.describe("site navigation", () => {
  test("sidebar links to a post and marks it active", async ({ page }) => {
    await page.goto("/");

    const firstLink = page.locator(".sidebar__link").first();
    const href = await firstLink.getAttribute("href");
    expect(href).toBeTruthy();

    await firstLink.click();
    await expect(page).toHaveURL(href!);

    const activeLink = page.locator('.sidebar__link[aria-current="page"]');
    await expect(activeLink).toHaveAttribute("href", href!);
  });

  test("TOC entry jumps to matching heading and highlights it", async ({ page }) => {
    await page.goto("/blog/02-context-and-cache");
    const tocEntry = page.locator(".toc__link").first();
    const slug = await tocEntry.getAttribute("data-toc-slug");
    expect(slug).toBeTruthy();

    await tocEntry.click();
    await expect(page).toHaveURL(new RegExp(`#${slug}$`));

    await page.waitForTimeout(400); // let scroll-spy settle
    await expect(tocEntry).toHaveAttribute("data-active", "true");
  });

  test("mobile drawer opens and closes", async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 900 });
    await page.goto("/");

    const trigger = page.locator("[data-drawer-trigger]");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");

    await page.locator("[data-drawer-close]").click();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});
```

- [ ] **Step 2: Run e2e**

Ensure nothing occupies port 4321, then run:

```bash
pnpm test:e2e -- tests/e2e/navigation.spec.ts
```

Expected: 3 passing tests. If the TOC test fails because the demo post has no h2/h3, pick a different post slug from `src/content/posts/` that has headings; update the URL accordingly.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/navigation.spec.ts
git commit -m "test(ui): e2e for sidebar, TOC, and drawer"
```

---

## Task 16: A11y baseline with axe

**Files:**
- Create: `tests/e2e/a11y.spec.ts`

- [ ] **Step 1: Create `tests/e2e/a11y.spec.ts`**

```ts
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PAGES = ["/", "/blog", "/blog/02-context-and-cache"] as const;

test.describe("accessibility baseline", () => {
  for (const path of PAGES) {
    test(`no serious/critical a11y violations on ${path}`, async ({ page }) => {
      await page.goto(path);
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      const blocking = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      if (blocking.length > 0) {
        console.log(JSON.stringify(blocking, null, 2));
      }
      expect(blocking).toEqual([]);
    });
  }
});
```

- [ ] **Step 2: Run**

```bash
pnpm test:e2e -- tests/e2e/a11y.spec.ts
```

Expected: all pages pass. If any `serious`/`critical` violation appears, fix in the relevant component (most commonly: add `aria-label`, raise contrast on `--color-fg-muted` against `--color-bg` for body text, or add `alt` attributes).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/a11y.spec.ts
git commit -m "test(ui): axe baseline on key pages"
```

---

## Task 17: Final build verification

**Files:**
- None modified. This task ensures the whole plan ships cleanly.

- [ ] **Step 1: Run typecheck**

```bash
pnpm typecheck
```

Expected: 0 errors. Existing deprecation warnings from Drizzle/Vitest are tolerated.

- [ ] **Step 2: Run lint**

```bash
pnpm lint
```

Expected: no errors.

- [ ] **Step 3: Run unit tests**

```bash
pnpm test
```

Expected: all green (at minimum `src/lib/posts/list.test.ts`, `src/lib/posts/toc.test.ts`, and the pre-existing `tests/unit/smoke.test.ts`).

- [ ] **Step 4: Run full build**

```bash
pnpm build
```

Expected: `dist/` produced, no errors. Mermaid/KaTeX should render into the generated HTML (check `dist/blog/02-context-and-cache/index.html` for `<svg` and `.katex` occurrences).

- [ ] **Step 5: Run preview and spot-check**

```bash
pnpm preview
```

Open the preview URL, sanity-check:
- Home, blog list, a post page.
- Toggle system dark mode; the site follows (light ↔ dark).
- Keyboard-tab from top: first visible focusable element is the "Перейти к содержимому" skip-link.

Stop preview with `Ctrl+C`.

- [ ] **Step 6: Final tidy commit (if anything drifted)**

```bash
git status
# if clean: nothing to commit. Otherwise add specific files and commit with
# `chore(ui): final tidy`. Do NOT use `git add -A`.
```

- [ ] **Step 7: Push the branch**

```bash
git push -u origin HEAD
```

---

## Acceptance criteria (self-check)

Before marking this plan complete, ensure:

- [ ] Every page of the public site uses the new tokens (no `bg-white`/`text-slate-*` left over).
- [ ] Left sidebar visible ≥ 1024px, drawer-only < 1024px.
- [ ] Right TOC visible only on post pages (not on home/list/about).
- [ ] Active post in sidebar is highlighted; active section in TOC updates on scroll.
- [ ] Skip-link is keyboard-reachable on first Tab.
- [ ] All unit and e2e tests pass locally; `pnpm build` succeeds.
- [ ] No DB calls were introduced in this plan (verified by grepping for `src/lib/db` inside `src/components/` and `src/layouts/` — should be zero matches).
