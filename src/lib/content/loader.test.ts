import { describe, it, expect } from "vitest";
import type { CollectionEntry } from "astro:content";
import type { PostMeta } from "~/lib/db/schema";
import { defaultMetaFor, sortWithMeta, type PostWithMeta } from "./loader";

function fakeEntry(id: string): CollectionEntry<"posts"> {
  return {
    id,
    slug: id,
    body: "",
    collection: "posts",
    data: { title: id, description: "x", pubDate: new Date("2026-01-01"), tags: [], draft: false },
  } as unknown as CollectionEntry<"posts">;
}

function fakeMeta(slug: string, order: number, pinned = false): PostMeta {
  return { slug, order, pinned, hiddenFromList: false, updatedAt: new Date() };
}

describe("defaultMetaFor", () => {
  it("marks unknown posts hidden so they don't leak unordered", () => {
    const m = defaultMetaFor("some-slug");
    expect(m.hiddenFromList).toBe(true);
    expect(m.order).toBe(Number.MAX_SAFE_INTEGER);
    expect(m.pinned).toBe(false);
    expect(m.slug).toBe("some-slug");
  });
});

describe("sortWithMeta", () => {
  it("places pinned first even if order is larger", () => {
    const items: PostWithMeta[] = [
      { entry: fakeEntry("a"), meta: fakeMeta("a", 1) },
      { entry: fakeEntry("b"), meta: fakeMeta("b", 100, true) },
    ];
    const sorted = sortWithMeta(items);
    expect(sorted[0]?.meta.slug).toBe("b");
    expect(sorted[1]?.meta.slug).toBe("a");
  });

  it("orders by numeric order ascending within pinned groups", () => {
    const items: PostWithMeta[] = [
      { entry: fakeEntry("a"), meta: fakeMeta("a", 3) },
      { entry: fakeEntry("b"), meta: fakeMeta("b", 1) },
      { entry: fakeEntry("c"), meta: fakeMeta("c", 2) },
    ];
    expect(sortWithMeta(items).map((i) => i.meta.slug)).toEqual(["b", "c", "a"]);
  });

  it("is stable when orders collide", () => {
    const items: PostWithMeta[] = [
      { entry: fakeEntry("a"), meta: fakeMeta("a", 1) },
      { entry: fakeEntry("b"), meta: fakeMeta("b", 1) },
    ];
    expect(sortWithMeta(items).map((i) => i.meta.slug)).toEqual(["a", "b"]);
  });
});
