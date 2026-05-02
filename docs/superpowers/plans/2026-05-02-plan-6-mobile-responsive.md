# Mobile-Responsive Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Fix mobile-responsive issues introduced/exposed by Plans 1-5. Restore correct rendering at viewport widths down to 320px (iPhone SE) without horizontal scroll on any public page.

**Architecture:** CSS-only fixes. No new components. Mobile-first additions to existing `@media (max-width: …)` queries in `BaseLayout.astro`, `Header.astro`, `PostLayout.astro`, MDX components, and a small `prose-tables.css` for the markdown table wrapper. Add one Playwright e2e suite to lock the regressions.

**Tech Stack:** Astro 5 scoped styles, Tailwind 4 typography (`@tailwindcss/typography`), Playwright 1.55 (already in devDeps).

---

## Audit summary (from /Users/izual/astro-blog Explore on 2026-05-02)

### Confirmed broken on ≤414px

1. **Markdown tables in posts have no scroll wrapper** — three new authority articles ship with wide tables that overflow viewport (e.g. the 9-bot taxonomy table in `robots-txt-ai-crawlers-2026.md`). `prose.css` has no `.prose table { overflow-x: auto }` rule and no parent wrapper.
2. **`<Compare>` component** (`src/components/mdx/Compare.astro:66-71`) renders `<figure><table>` with no overflow scroll — same problem on all comparison tables.
3. **Header crowding** (`src/components/Header.astro`) — brand + ⌘K search + lang-toggle + drawer button collide on 320px. Padding `var(--space-5)` (24px) doesn't shrink below 1024px.
4. **Footer flex** (`BaseLayout.astro:174-182`) — `display: flex; justify-content: space-between` with no wrap or column-direction below 768px. Two `<p>` elements squeeze together on narrow screens.
5. **Layout outer padding** (`BaseLayout.astro:138`) — `padding: var(--space-6) var(--space-5)` (32/24px) never shrinks below the 1024px breakpoint. Eats real estate on small screens.
6. **Post `<h1>` overflow** — `.post__title { font-size: var(--fs-4xl) /* 2.75rem ≈ 44px */ }` is unconditional. Long titles like "Mermaid → SVG via Playwright at build time…" overflow on 320px.

### At-risk (verify visually)

- Mermaid `<svg>` tall portraits on 320px — `max-width: 100%` handles width but not height-overflow with fixed aspect ratios.
- Code blocks (Shiki) — `overflow-x: auto` exists but no visual scroll-hint.
- `<Tldr>`/`<Faq>`/`<KeyTakeaways>` aside cards — fixed paddings; verify on narrow viewport.
- LangToggle + ⌘K search — both visible on mobile header; might collide.

---

## Working notes for agents

**Subagent assignments:**
- `frontender` → all CSS edits and Astro component scope-styles. Default agent for this plan.
- `backender` → only for the Playwright e2e setup (Phase 4) if config tweaks are needed.
- `critic` → end-of-Phase-3 review on visual regressions and a11y.

**Discipline (per CLAUDE.md):**
- Functional style only. No `class`. Tailwind tokens or CSS vars (`tokens.css`) — no new design tokens unless necessary.
- Conventional commits: `fix(layout):`, `fix(mdx):`, `fix(ui):`, `test(e2e):`.
- After every commit: `git status` clean. Pre-existing dirty files stay unstaged.
- Manual visual verification: `pnpm dev`, open `http://localhost:4321/blog/robots-txt-ai-crawlers-2026` in Chrome DevTools at 320px / 375px / 414px / 768px viewports. Check no horizontal scrollbar.
- Worktree optional — fixes are CSS-only, low blast radius.

**Branch:** create `feat/mobile-responsive-fixes` from `origin/main` (currently at `11c2e1d`).

---

# Phase 1 — Critical content overflow fixes

### Task 1: Markdown table scroll wrapper via prose CSS

**Subagent:** `frontender`
**Files:** Modify `src/styles/prose.css`

- [x] **Step 1.** Open `src/styles/prose.css`. Find the table-related rules (search `\.prose\s+table`).

- [x] **Step 2.** Wrap every table emitted by Markdown in a horizontally-scrollable container. The cleanest scoped approach: use a CSS-only solution that wraps the table itself in `display: block` with `overflow-x: auto`.

```css
/* In src/styles/prose.css — append or replace existing .prose table rule */
.prose table {
  display: block;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  max-width: 100%;
  border-collapse: collapse;
  /* Restore table layout inside the scroll viewport */
  white-space: nowrap;
}

.prose table thead,
.prose table tbody {
  display: table;
  width: 100%;
  table-layout: auto;
}

@media (max-width: 768px) {
  .prose table {
    /* Hint: faint right edge fade so users know there's more */
    background-image: linear-gradient(to right, transparent calc(100% - 16px), rgba(0, 0, 0, 0.04));
  }
}
```

- [x] **Step 3.** Visual check via `pnpm dev`:
  - http://localhost:4321/blog/robots-txt-ai-crawlers-2026 — robots.txt bot table should scroll horizontally on a 375px DevTools viewport, not push the page wider.
  - http://localhost:4321/blog/mermaid-svg-playwright-build-time — comparison table same.
  - Stop dev server.

- [x] **Step 4.** Commit.

```bash
git add src/styles/prose.css
git commit -m "fix(layout): wrap markdown tables in horizontal scroll on mobile"
```

---

### Task 2: `<Compare>` component overflow wrapper

**Subagent:** `frontender`
**Files:** Modify `src/components/mdx/Compare.astro`

- [x] **Step 1.** Read `src/components/mdx/Compare.astro` to locate the `<figure><table>` markup and its scoped `<style>` block.

- [x] **Step 2.** Add `overflow-x: auto` to the `.compare` figure and `width: 100%` to the table:

```astro
<style>
  .compare {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    margin: var(--space-6) 0;
    /* Bleed full-width on mobile so the scrollable area uses the gutter */
    margin-inline: 0;
  }
  .compare table {
    width: max-content;
    min-width: 100%;
    border-collapse: collapse;
  }
  .compare__verdict {
    margin-top: var(--space-3);
    font-style: italic;
    color: var(--color-fg-muted);
  }
  @media (max-width: 768px) {
    .compare {
      /* Bleed into the layout gutter so the scroll-area is wider */
      margin-inline: calc(-1 * var(--space-4));
      padding-inline: var(--space-4);
    }
  }
  /* keep existing rules for thead/tbody/th/td */
</style>
```

- [x] **Step 3.** Visual check: any post using `<Compare>` (currently none in committed posts; the next post that uses it must scroll cleanly on 320px).

- [x] **Step 4.** Commit.

```bash
git add src/components/mdx/Compare.astro
git commit -m "fix(mdx): Compare table scrolls horizontally on mobile"
```

---

# Phase 2 — Chrome (header + footer + layout padding)

### Task 3: Header mobile shrink + brand stack

**Subagent:** `frontender`
**Files:** Modify `src/components/Header.astro`

- [x] **Step 1.** Read the existing scoped `<style>` block in `Header.astro`. Locate `.site-header__inner`, `.site-header__brand`, `.site-header__nav`, `.site-header__search`, `.lang-toggle`, `.site-header__drawer-btn`.

- [x] **Step 2.** Add a `@media (max-width: 768px)` block at the end of the scoped style:

```astro
@media (max-width: 768px) {
  .site-header__inner {
    padding: var(--space-3) var(--space-4);
    gap: var(--space-2);
  }
  .site-header__brand {
    font-size: var(--fs-base);
    gap: var(--space-1);
  }
  .site-header__dot,
  .site-header__author {
    /* Hide the "·" + "artka.dev" subline below 480px to give actions room */
  }
}
@media (max-width: 480px) {
  .site-header__dot,
  .site-header__author {
    display: none;
  }
  .site-header__search [aria-hidden="true"] {
    /* The ⌘K hint glyph wastes 24px on tiny viewports */
    display: none;
  }
}
```

- [x] **Step 3.** Visual check at 320 / 375 / 414 / 768. Confirm: brand + search + lang-toggle + drawer-btn all visible, no overflow, no wrapping.

- [x] **Step 4.** Commit.

```bash
git add src/components/Header.astro
git commit -m "fix(ui): shrink header padding and hide secondary brand text on mobile"
```

---

### Task 4: Footer mobile stack

**Subagent:** `frontender`
**Files:** Modify `src/layouts/BaseLayout.astro`

- [x] **Step 1.** In `BaseLayout.astro` scoped `<style>`, locate `.site-footer__inner` (around line 174-182).

- [x] **Step 2.** Add a mobile override after the existing rule:

```astro
@media (max-width: 600px) {
  .site-footer__inner {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-4);
  }
}
```

- [x] **Step 3.** Visual check at 320 / 414. Footer copyright and meta-line should stack vertically with no overlap.

- [x] **Step 4.** Commit.

```bash
git add src/layouts/BaseLayout.astro
git commit -m "fix(layout): footer stacks to column on viewports under 600px"
```

---

### Task 5: Layout outer padding shrink

**Subagent:** `frontender`
**Files:** Modify `src/layouts/BaseLayout.astro`

- [x] **Step 1.** In `BaseLayout.astro` scoped `<style>`, locate `.layout` rule (line 142-156). The existing 1024px media-query reduces `grid-template-columns` to one column but leaves padding at `var(--space-6) var(--space-5)`.

- [x] **Step 2.** Add a tighter mobile breakpoint:

```astro
@media (max-width: 768px) {
  .layout {
    padding: var(--space-4) var(--space-4);
  }
}
@media (max-width: 414px) {
  .layout {
    padding: var(--space-3) var(--space-3);
  }
}
```

- [x] **Step 3.** Visual check on `/blog/01-introduction` at 375px — body should have 12-16px gutter, not 24-32px.

- [x] **Step 4.** Commit.

```bash
git add src/layouts/BaseLayout.astro
git commit -m "fix(layout): tighten outer padding on viewports under 768px"
```

---

# Phase 3 — Typography & post-content polish

### Task 6: Scale post `<h1>` and lede on mobile

**Subagent:** `frontender`
**Files:** Modify `src/layouts/PostLayout.astro`

- [ ] **Step 1.** In `PostLayout.astro` scoped `<style>`, find `.post__title` and `.post__lede`.

- [ ] **Step 2.** Append mobile overrides:

```astro
@media (max-width: 600px) {
  .post__title {
    font-size: var(--fs-3xl);  /* down from --fs-4xl */
    line-height: var(--lh-snug);
  }
  .post__lede {
    font-size: var(--fs-base); /* down from --fs-lg */
  }
  .post__header {
    margin-bottom: var(--space-5);
    padding-bottom: var(--space-4);
  }
}
@media (max-width: 414px) {
  .post__title {
    font-size: var(--fs-2xl);
  }
}
```

- [ ] **Step 3.** Visual check: load the longest title (`/blog/mermaid-svg-playwright-build-time` — title is ~80 chars) at 320px. Should fit on 3 lines, not overflow.

- [ ] **Step 4.** Commit.

```bash
git add src/layouts/PostLayout.astro
git commit -m "fix(layout): scale post title and lede typography on mobile"
```

---

### Task 7: AuthorCard, Tldr, Faq, KeyTakeaways spacing

**Subagent:** `frontender`
**Files:** Modify `src/components/AuthorCard.astro`, `src/components/mdx/Tldr.astro`, `src/components/mdx/Faq.astro`, `src/components/mdx/KeyTakeaways.astro`

- [ ] **Step 1.** Open each file and inspect its scoped style. Look for fixed `padding`, `margin-inline`, or grid-template that doesn't shrink.

- [ ] **Step 2.** For each component, append a `@media (max-width: 600px)` override that:
  - Reduces `padding` from `var(--space-5)` to `var(--space-3)` or `var(--space-4)`.
  - Reduces `margin-inline` to 0 if it has any.
  - Stacks any flex `row` to `column` if children would crowd.

Example for `AuthorCard.astro` (concrete pattern; adapt other files similarly):

```astro
@media (max-width: 600px) {
  .author-card {
    flex-direction: column;
    align-items: flex-start;
    padding: var(--space-4);
    gap: var(--space-3);
  }
  .author-card__avatar-link {
    width: 48px;
    height: 48px;
  }
}
```

- [ ] **Step 3.** Visual check on `/blog/01-introduction` (any post) at 320px. AuthorCard should not overflow; FAQ details should not have edge-clipping.

- [ ] **Step 4.** Commit (one commit covering all four components).

```bash
git add src/components/AuthorCard.astro src/components/mdx/Tldr.astro src/components/mdx/Faq.astro src/components/mdx/KeyTakeaways.astro
git commit -m "fix(ui): tighten AuthorCard and MDX cards on mobile viewports"
```

---

# Phase 4 — Regression prevention via Playwright

### Task 8: viewport-overflow e2e test

**Subagent:** `backender`
**Files:** Create `tests/e2e/mobile-overflow.spec.ts`

- [ ] **Step 1.** Confirm Playwright config supports a mobile viewport. `playwright.config.ts` at the repo root — check `projects` for an iPhone-style entry; add one if missing:

```ts
// playwright.config.ts (only add the iPhone project; keep existing entries)
projects: [
  { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  { name: "iphone-se", use: { ...devices["iPhone SE"] } },
],
```

- [ ] **Step 2.** Create `tests/e2e/mobile-overflow.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

const PAGES = [
  "/",
  "/blog",
  "/blog/01-introduction",
  "/blog/robots-txt-ai-crawlers-2026",
  "/blog/mermaid-svg-playwright-build-time",
  "/blog/json-ld-graph-astro",
  "/about",
  "/now",
  "/uses",
  "/projects",
  "/projects/astro-blog",
  "/tags",
  "/tags/claude-code",
];

test.describe("mobile viewport — no horizontal overflow", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  for (const path of PAGES) {
    test(`page ${path} fits within 375px width`, async ({ page }) => {
      await page.goto(path);
      const docWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const viewportWidth = page.viewportSize()!.width;
      expect(docWidth).toBeLessThanOrEqual(viewportWidth + 1);
    });
  }
});

test.describe("iphone-se (320px)", () => {
  test.use({ viewport: { width: 320, height: 568 } });

  test("homepage fits", async ({ page }) => {
    await page.goto("/");
    const docWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(docWidth).toBeLessThanOrEqual(321);
  });

  test("authority article fits", async ({ page }) => {
    await page.goto("/blog/robots-txt-ai-crawlers-2026");
    const docWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(docWidth).toBeLessThanOrEqual(321);
  });
});
```

- [ ] **Step 3.** Run the test:

```bash
pnpm build
pnpm test:e2e -- tests/e2e/mobile-overflow.spec.ts
```

Expected: all 15 assertions PASS. If any fail, identify which page overflows and patch the responsible component before continuing.

- [ ] **Step 4.** Commit.

```bash
git add tests/e2e/mobile-overflow.spec.ts playwright.config.ts
git commit -m "test(e2e): assert no horizontal overflow on mobile viewports"
```

---

# Phase 5 — Final verification + PR

### Task 9: Full check + PR

- [ ] **Step 1.** Run all gates:

```bash
pnpm typecheck && pnpm test && pnpm build
pnpm test:e2e -- tests/e2e/mobile-overflow.spec.ts
pnpm translate:check
```

All green required.

- [ ] **Step 2.** Manual final pass in Chrome DevTools mobile mode:
  - 320px iPhone SE: home, blog index, robots-txt-ai-crawlers-2026, /uses, /tags
  - 375px iPhone: same set
  - 414px iPhone Pro Max: same set
  - 768px iPad portrait: same set

- [ ] **Step 3.** Push and open PR.

```bash
git push -u origin feat/mobile-responsive-fixes
gh pr create --base main --head feat/mobile-responsive-fixes --title "fix(layout): mobile-responsive across all pages" --body "$(cat <<'EOF'
## Summary
- Markdown tables scroll horizontally on mobile instead of pushing layout wider
- Compare component scrolls horizontally with full-width gutter bleed
- Header padding and brand text shrink on ≤768px and ≤480px
- Footer stacks to column under 600px
- Layout outer padding tightens on ≤768px and ≤414px
- Post h1 and lede scale down on ≤600px and ≤414px
- AuthorCard / Tldr / Faq / KeyTakeaways tightened on mobile
- Playwright e2e suite asserts no horizontal overflow on 13 representative URLs at 375px and 320px

## Test plan
- [x] pnpm typecheck / test / build / translate:check
- [x] Playwright mobile-overflow suite (15 assertions)
- [x] Manual: Chrome DevTools 320 / 375 / 414 / 768 on home, blog, all 3 authority articles, /uses, /tags
EOF
)"
```

---

# Self-Review

**Audit coverage:** every confirmed-broken item from the audit (1-6) has a dedicated task. The at-risk items are partly handled by Task 7 and the final manual pass.

**Type/name consistency:** All breakpoint values are the same across tasks (`max-width: 768px` for chrome shrink, `600px` for stacking, `414px` for the very narrow tier).

**Placeholders:** None. Every step has concrete CSS.

**Out of scope (explicitly):**
- Mermaid SVG height-overflow on tall portraits — punt to v2 once a real case appears.
- Code block scroll-hint visual indicator — `overflow-x: auto` already prevents layout breakage; visual hint is polish.
- Drawer animation on iOS Safari — already uses `<dialog>`, native behaviour.
