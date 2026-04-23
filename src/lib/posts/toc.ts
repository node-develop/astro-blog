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
