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
