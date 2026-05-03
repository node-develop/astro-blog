/**
 * Phase 2 — Shiki dual-theme integration.
 *
 * Astro 5 supports Shiki's `themes` map natively. Add this to
 * `astro.config.mjs`:
 *
 *   markdown: {
 *     shikiConfig: shikiThemes,
 *     rehypePlugins: [
 *       rehypeSlug,
 *       [rehypeAutolinkHeadings, autolinkOptions],
 *       rehypeCodeTitles,
 *     ],
 *   }
 *
 * Shiki emits `<pre>` with `style="--shiki-light: ...; --shiki-dark: ..."`
 * and dual `<span class="line">`. The CSS below in `code-themes.css` makes
 * `[data-theme='dark']` swap to the dark palette without re-rendering.
 *
 * Filename captions: rehype-code-titles parses ```ts:filename.ts and
 * emits a sibling `<div class="rehype-code-title">` styled in
 * prose.additions.css.
 */
import type { ShikiConfig } from "astro";

export const shikiThemes: ShikiConfig = {
  themes: {
    light: "github-light",
    dark: "github-dark-dimmed",
  },
  wrap: false,
  // Optional: experimentalThemes is replaced by `themes` in Astro 5.
  // Add custom langs here if needed.
};
