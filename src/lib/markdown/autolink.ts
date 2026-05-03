/**
 * Phase 2 — anchored headings.
 *
 * Astro pipeline:
 *   import rehypeSlug from "rehype-slug";
 *   import rehypeAutolinkHeadings from "rehype-autolink-headings";
 *   import { autolinkOptions } from "./src/lib/markdown/autolink";
 *
 *   markdown: {
 *     rehypePlugins: [
 *       rehypeSlug,
 *       [rehypeAutolinkHeadings, autolinkOptions],
 *     ],
 *   }
 *
 * Result: every <h2>/<h3>/<h4> gets an anchor child with `#` glyph that
 * appears on hover. Click copies the deep link to clipboard.
 */
import type { Options } from "rehype-autolink-headings";

export const autolinkOptions: Options = {
  behavior: "append",
  test: ["h2", "h3", "h4"],
  properties: {
    className: ["heading-anchor"],
    ariaLabel: "Permalink to this heading",
    tabIndex: -1,
  },
  content: () => [
    {
      type: "element",
      tagName: "span",
      properties: { className: ["heading-anchor__glyph"], ariaHidden: "true" },
      children: [{ type: "text", value: "#" }],
    },
  ],
};
