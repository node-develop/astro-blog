---
title: "Mermaid → SVG via Playwright at build time: cold start, cache, and SSG cost"
description: >-
  Real measurements from an Astro blog with 32 Mermaid diagrams: cold build 11.6s, warm 6.3s. Where the cache is, what
  Playwright does, why alternatives are worse.
pubDate: 2026-05-02
tags:
  - build-tooling
  - astro
draft: false
cover: /og-default.svg
coverAlt: comparative graph of cold and warm build with Playwright
summary: >-
  Mermaid is bad as client-side opex (large JS, FOUC, hydration cost), but good as build-time SVG if you're willing to
  pay ~5 seconds for Playwright cold start. Real numbers from this blog: 32 diagrams, 11.6s cold build, 6.3s warm.
keywords:
  - Mermaid
  - Playwright
  - SSG
  - Astro
  - build-time
  - rehype-mermaid
  - img-svg
faq:
  - question: Why is Mermaid build-time rendering better than client-side?
    answer: >-
      Client-side Mermaid pulls ~700 KB of JS (mermaid.min.js + dagre + d3), blocks TTI, and causes FOUC because the
      diagram only appears after hydration. Build-time SVG is static: zero JS on the client, correct SEO/OG-snapshot, no
      flickering. You only pay once with a cold-start Playwright during the build (~5 seconds on this blog).
  - question: Where does rehype-mermaid store the SVG cache?
    answer: >-
      rehype-mermaid doesn't create a special .cache/mermaid/ directory: the mermaid-isomorphic package runs Chromium
      via Playwright and renders each block fresh. The "warm build" effect (6.3s vs 11.6s on this site) comes from
      Astro: parsed MDX and data-store live in .astro/ and node_modules/.astro/ (~5 MB), plus Vite's cache of transpiled
      modules. Invalidation is based on source mtime.
  - question: How much does Playwright weigh on CI?
    answer: >-
      The playwright-core package itself is 11 MB, but the critical part is the Chromium bundle: on macOS we have 528 MB
      in ~/Library/Caches/ms-playwright (chromium-1217 + chromium_headless_shell-1217 + ffmpeg). On Linux it's the same,
      plus system-deps (libnss3, libatk-1.0, libgbm) — the Docker layer balloons by 200-400 MB on top. Mitigations: pnpm
      playwright install chromium --with-deps only on the CI step with the build, not in the runtime image.
  - question: Why is mermaid-cli worse than rehype-mermaid?
    answer: >-
      mermaid-cli (@mermaid-js/mermaid-cli) is a thin wrapper around puppeteer that spawns its own Chromium on each run.
      It has no integration with rehype/markdown-pipeline: you have to manually extract blocks from markdown, render
      them, and insert them back. For 32 diagrams that's 32 separate Chromium launches instead of one, adding tens of
      seconds. rehype-mermaid via mermaid-isomorphic keeps one browser-context for the entire build.
  - question: When should you choose client-side mermaid over build-time?
    answer: >-
      Three cases. First — the user edits the diagram at runtime (e.g., documentation-as-code with live preview). Second
      — diagrams are generated dynamically from a database on each request (then neither cache nor build helps). Third —
      you're on Vercel/Netlify free tier with build-minute limits, and +10 seconds per build matters more than +700 KB
      of JS for the user. In all other cases, build-time wins.
lang: en
sourceHash: 57c09d48396659c5f2b65ef36d427cc824445571f79bb38c4dcafdfea1206881
manuallyEdited: false
---

> Mermaid diagrams in a blog are either a large client-side JS bundle with FOUC and hydration cost, or build-time SVG with a one-time cold-start Playwright. On this site, `rehype-mermaid` renders 32 diagrams in **11.6 seconds** on a cold cache and **6.3 seconds** on a warm one. Below are the specific numbers, architecture, CI pitfalls, and a fact-check of alternatives.

---

## 1. Why render Mermaid at build-time instead of client-side

Mermaid (`mermaid` on npm, repository `mermaid-js/mermaid`) is a JS library that takes a text DSL (`flowchart TD`, `sequenceDiagram`, `gantt`, ...) and emits SVG. By default, you use it like this: include `<script src="mermaid.min.js">`, call `mermaid.run()` after `DOMContentLoaded`, and each `<pre class="mermaid">` gets replaced with SVG in the DOM right in the browser.

It works, but the user pays the price:

| Metric                    | Client-side Mermaid                | Build-time SVG                         |
| ------------------------- | ---------------------------------- | -------------------------------------- |
| JS bundle (gzipped)       | ~250–300 KB (mermaid + d3 + dagre) | 0 KB                                   |
| Time to Interactive (TTI) | delayed by parse + execute         | unchanged                              |
| FOUC                      | yes: text first, then SVG          | no: SVG in HTML from first byte        |
| SEO / Open Graph          | search engine sees only text DSL   | search engine sees SVG as part of page |
| Page printing             | empty blocks if JS is disabled     | correct render                         |
| Dark theme without flash  | hard: theme loads after hydration  | works: SVG generated in correct theme  |
| Build cost                | 0 (just bundle js)                 | +5–10 seconds cold-start Playwright    |
| Runtime cost for user     | high (CPU + network)               | zero                                   |

`rehype-mermaid` (`remcohaszing/rehype-mermaid`, v3.0.0) is a rehype plugin that during the build traverses the HAST tree, finds `<code class="language-mermaid">` nodes, renders them via `mermaid-isomorphic` (`mermaid-isomorphic@3.1.0`), and replaces them with ready SVG. Under the hood: Playwright + headless Chromium.

The `img-svg` strategy we use emits the result as `<img src="data:image/svg+xml,...">`. Alternatives are `inline-svg` (embed SVG directly in HTML) or `pre-mermaid` (leave as-is for client-side render).

---

## 2. Architecture: rehype-mermaid + Playwright

````mermaid
flowchart LR
  md["Markdown<br/>with ```mermaid blocks"]
  mdx["@astrojs/mdx<br/>(remark + rehype)"]
  rh["rehype-mermaid<br/>(plugin)"]
  iso["mermaid-isomorphic"]
  pw["Playwright<br/>(Chromium)"]
  svg["SVG as data URI<br/>in HTML"]

  md --> mdx
  mdx --> rh
  rh -->|for each block| iso
  iso -->|launch headless| pw
  pw -->|mermaid.render() in DOM| iso
  iso -->|serialised SVG| rh
  rh --> svg
````

The specific config is `astro.config.ts`:

```ts
import rehypeMermaid from "rehype-mermaid";
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";

export default defineConfig({
  integrations: [
    mdx({
      rehypePlugins: [[rehypeMermaid, { strategy: "img-svg", dark: true }]],
    }),
  ],
  markdown: {
    syntaxHighlight: {
      type: "shiki",
      excludeLangs: ["mermaid", "math"],
    },
    rehypePlugins: [[rehypeMermaid, { strategy: "img-svg", dark: true }]],
  },
});
```

Important details:

- `excludeLangs: ["mermaid"]` in the shiki config — otherwise Shiki will first turn the block into `<pre class="shiki">` and rehype-mermaid won't see it.
- The plugin is connected twice: both in `markdown.rehypePlugins` and in `mdx.rehypePlugins`. Astro 5 doesn't automatically inherit one from the other — this is a typical source of "it renders in `.md` but not in `.mdx`".
- `dark: true` generates two versions of SVG (for light and dark themes) and uses `<picture><source>` to serve the right one based on `prefers-color-scheme`. This doubles the size of data-uri blocks, but gives correct contrast without JS.

---

## 3. Cold start vs warm build

Metric: `time pnpm build` (Apple M-series, locally, warm Chromium binary in `~/Library/Caches/ms-playwright`). Command to clear all caches:

```bash
rm -rf .astro node_modules/.astro dist
time pnpm build
```

Three runs on cold, three on warm (median):

| Type                                            | Run 1   | Run 2   | Run 3   | **Median**  |
| ----------------------------------------------- | ------- | ------- | ------- | ----------- |
| Cold (`rm -rf .astro node_modules/.astro dist`) | 11.580s | 11.860s | 11.486s | **11.580s** |
| Warm (no cleanup)                               | 6.250s  | 6.305s  | —       | **~6.28s**  |

Of the 11.6 seconds of cold build:

- ~5–6 seconds — actual SSG stage (Astro traverses routes, renders 45 HTML pages from 14 RU posts + 13 EN twins + index, tags, RSS, sitemap).
- ~5 seconds — Playwright overhead: launching Chromium, initializing mermaid bundle in DOM, JIT warmup.
- ~0.2 seconds — `pagefind --site dist/client` (search index).

On a warm build, Playwright still starts fresh (there's no long-lived process pool in `mermaid-isomorphic`), but:

- `.astro/data-store.json` (5.2 MB) already contains parsed MDX content layer — Astro doesn't re-parse markdown for files whose mtime hasn't changed.
- `node_modules/.astro/` (5.1 MB) — Vite cache of transpiled modules.
- The Playwright Chromium binary itself is already in `/Library/Caches/ms-playwright/chromium-1217/` (528 MB total with headless-shell and ffmpeg) — on a cold disk cache you'd have to read it again, adding ~1–2 seconds on slow disks.

Key fact: **`mermaid-isomorphic` itself does NOT cache SVG between builds**. I searched its source code (`node_modules/.pnpm/mermaid-isomorphic@3.1.0_playwright@1.59.1/.../mermaid-isomorphic.js`) — there's no `persistDir` or file-based cache. Every build, diagrams are rendered from scratch. "Warmth" is Astro/Vite cache, not the plugin's.

> CI measurement for GitHub Actions `ubuntu-latest` `(owner to fill: run workflow_dispatch on a clean runner, measure median from 3 runs with `actions/cache@v4` for node_modules + .astro)`.

---

## 4. Cost on CI

Playwright pulls Chromium (~528 MB in my cache on macOS, similar order on Linux), plus on Debian/Ubuntu you need system deps: `libnss3`, `libatk-1.0-0`, `libcups2`, `libgbm1`, `libxkbcommon0`, `libpango-1.0-0`, `libasound2`, fontconfig + at least one font.

**Mitigations:**

1. **Don't install Chromium in production image.** If you're building an Astro SSG-only site and deploying static files — Playwright is needed ONLY on the CI build step, not in runtime Docker. Use multi-stage:

```bash
# build-stage:
FROM node:24-bookworm AS build
RUN pnpm install
RUN pnpm exec playwright install --with-deps chromium
RUN pnpm build

# run-stage:
FROM node:24-bookworm-slim AS run
COPY --from=build /app/dist ./dist
# никакого playwright тут
```

2. **GitHub Actions caching.** `actions/cache@v4` key: `${{ hashFiles('pnpm-lock.yaml') }}-playwright`, path: `~/.cache/ms-playwright`. Saves re-downloading Chromium (~150 MB over network) on every push.

3. **Use system Chrome instead of Playwright Chromium.** Set `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` and pass `executablePath: '/usr/bin/google-chrome-stable'` when creating the browser. But: `mermaid-isomorphic` doesn't expose `launchOptions` through the rehype-mermaid API — you'd have to fork or live with default Chromium.

4. **If 5 seconds cold-start is critical** — run Playwright outside the build: pre-render all diagrams in a separate CI step, commit SVG to the repo, use pre-mermaid strategy in the main build with substitution for ready assets. More complex, but removes Playwright from the hot path.

---

## 5. SVG caching: where they live and what invalidates them

Public measurement on dev machine (45 compiled HTML, 27 pages with diagrams, 61 data-uris total — 32 RU + 29 EN, because one EN page renders without diagrams due to post specifics):

| Metric                                               | Value            |
| ---------------------------------------------------- | ---------------- |
| Mermaid blocks in `*.md`                             | 32 (in 14 posts) |
| Compiled HTML                                        | 45               |
| Pages with embedded diagram                          | 27               |
| Data-URI blocks `<img src="data:image/svg+xml,...">` | 61               |
| Minimum, bytes                                       | 15 551           |
| Median, bytes                                        | 25 301           |
| Average, bytes                                       | 26 579           |
| Maximum, bytes                                       | 45 711           |
| Size of `.astro/`                                    | 5.0 MB           |
| Size of `node_modules/.astro/`                       | 5.1 MB           |
| Size of `dist/`                                      | 17 MB            |
| Size of Playwright Chromium cache                    | 528 MB           |

Where everything lives:

- **SVG don't live on disk as separate files.** The `img-svg` strategy inlines them directly in HTML as `data:image/svg+xml,...` (URL-encoded). You can see this in `dist/client/blog/02-context-and-cache/index.html`: 4 diagrams → 4 data-uris in one HTML.
- **Astro content-layer cache** — `.astro/data-store.json` (5.2 MB after build). This is parsed markdown with remark/rehype plugins already applied — but **before** rehype-mermaid: testing shows that mtime-based invalidation of the source runs rehype-mermaid again even for files where nothing changed.
- **Vite cache** — `node_modules/.astro/` (5.1 MB). Transpiled TS/JSX modules, unrelated to mermaid rendering.
- **mermaid-isomorphic has no cache of its own.** This is the key pitfall: if you change a comma in one `*.md` — rehype-mermaid will rebuild ALL diagrams in that file. There's no content-addressable cache "hash diagram source → SVG".

If rehype-mermaid caching is critical for you — a workaround: write a thin rehype plugin wrapper that hashes the diagram source (sha256 of text between ` ```mermaid` and ` ``` `), checks `.cache/mermaid/<hash>.svg` — and returns it without calling `mermaid-isomorphic` on hit. I haven't done this on this blog — 11.6 seconds cold-start isn't painful enough.

---

## 6. Alternatives: what I looked at and why I didn't choose them

### 6.1. `@mermaid-js/mermaid-cli`

Official CLI from mermaid-js: `mmdc -i diagram.mmd -o diagram.svg`. Under the hood — puppeteer (Chromium API fork) + full Chromium binary.

Downsides for a blog pipeline:

- No integration with rehype/remark — you'd have to extract markdown blocks manually.
- Each run — new browser context (no batch mode).
- On 32 diagrams — 32 separate puppeteer launches ≈ tens of seconds vs ~5–6 seconds with `mermaid-isomorphic` with a single browser instance.

When it fits: one-off conversion `*.mmd → *.svg` in a monorepo for designers, not for dynamic HTML insertion.

### 6.2. Client-side `mermaid` (npm package)

Downsides already covered above: bundle, FOUC, hydration. One upside — dynamic diagrams from user input at runtime (live preview in documentation editor). For a static blog — overkill.

### 6.3. `mermaid-isomorphic` directly (without rehype)

The same package that rehype-mermaid calls under the hood. You can use it outside Astro: `import { createMermaidRenderer } from 'mermaid-isomorphic'; const renderer = createMermaidRenderer(); const [{ svg }] = await renderer([{ value: 'flowchart TD\nA-->B' }]);`.

When it fits: your own pipeline build (Eleventy, MkDocs plugin on Node.js) that doesn't use a rehype chain. For me — Astro, so rehype-mermaid gives zero-boilerplate.

### 6.4. Pre-render via GitHub Actions matrix + commit back

Hypothetically: workflow on push that renders SVG, commits to `public/diagrams/`, and in the build step use `pre-mermaid` strategy with replacement to `<img src="/diagrams/<hash>.svg">`. Removes Playwright from the hot build path, but: complicates PR review (binary files in diff), requires separate workflow, breaks local `pnpm dev` if SVG isn't committed yet.

Didn't do it — 5 seconds of cold-start savings don't justify the complexity.

### Summary table

| Option                                  | Cold-start                  | SVG cache     | Bundle JS | Setup complexity |
| --------------------------------------- | --------------------------- | ------------- | --------- | ---------------- |
| `rehype-mermaid` + Playwright (current) | ~5–6s                       | no            | 0         | low (1 plugin)   |
| `mermaid-cli` (`mmdc`)                  | ~10s+                       | no            | 0         | medium           |
| Client-side `mermaid`                   | 0                           | browser cache | ~250 KB   | low              |
| Pre-render + commit                     | 0 in build, ~5s in pre-step | yes, in git   | 0         | high             |

---

## 7. Checklist: what to measure before choosing

Before committing to build-time rendering or anything else:

1. **How many diagrams on average.** On 1–3 — client-side OK (lazy-load mermaid via dynamic import). On 30+ — build-time is cheaper for the user.
2. **Content edit frequency.** If you edit content 5 times a day — cold-start 11 seconds × 50 pushes = ~10 minutes of CI time per day. If once a week — doesn't matter.
3. **CI platform.** Vercel hobby, Netlify free, Cloudflare Pages — all have build minute limits. Playwright + Chromium on every PR preview = you'll hit limits fast. On self-hosted runner or Dokploy (like me) — doesn't matter.
4. **Target JS bundle size.** If your project has KPI "<100 KB initial JS" — 250 KB mermaid client-side breaks the budget. Build-time SVG doesn't touch the JS budget.
5. **Do you need interactivity.** Pan/zoom/click handlers in the diagram? Then client-side is mandatory. Static picture for reading? Build-time.
6. **Where your cold-start cost lives.** If runtime Docker — cut Playwright from the run stage. If CI — cache Chromium via `actions/cache`.
7. **Can you live with no SVG cache.** rehype-mermaid renders ALL blocks in a file on any edit. If that hurts — write your own caching wrapper with sha256 key on diagram source.

---

## Conclusion

On this blog, `rehype-mermaid` + Playwright costs ~5 seconds cold-start, outputs 32 diagrams into 27 HTML pages with median inline-SVG size of 25 KB, requires zero bytes of JS on the client, and lets you write diagrams directly in markdown. This is a very good tradeoff for a static blog.

When it won't fit: a blog with a hundred diagrams, deploy platform with build-minute limits, or requirement for interactive diagrams. In the first case — write a caching wrapper, in the second — pre-render in a separate workflow, in the third — client-side.

The main non-obvious thing to remember: **Astro "warms up" (5.2 MB content store, Vite cache), but `mermaid-isomorphic` doesn't**. Cold-start Playwright is paid on every build from scratch. This isn't a bug, it's by-design — and it's why my full build takes 11.6 seconds instead of 1.6.
