import type { CollectionEntry } from "astro:content";
import type { PostMeta } from "~/lib/db/schema";

export interface PostWithMeta {
  readonly entry: CollectionEntry<"posts">;
  readonly meta: PostMeta;
}

export async function getOrderedPosts(): Promise<readonly PostWithMeta[]> {
  throw new Error("not implemented");
}

export function defaultMetaFor(slug: string): PostMeta {
  return {
    slug,
    order: Number.MAX_SAFE_INTEGER,
    pinned: false,
    hiddenFromList: true,
    updatedAt: new Date(0),
  };
}

export function sortWithMeta(posts: readonly PostWithMeta[]): readonly PostWithMeta[] {
  return [...posts].sort((a, b) => {
    if (a.meta.pinned !== b.meta.pinned) return a.meta.pinned ? -1 : 1;
    return a.meta.order - b.meta.order;
  });
}
