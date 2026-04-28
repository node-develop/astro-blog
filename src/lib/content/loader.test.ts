import { describe, it, expect, vi } from "vitest";
import type { CollectionEntry } from "astro:content";
import type { PostMeta } from "~/lib/db/schema";
import { defaultMetaFor, sortWithMeta, type PostWithMeta } from "./loader";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fakeEntry = (id: string, draft = false): CollectionEntry<"posts"> =>
  ({
    id,
    slug: id,
    body: "",
    collection: "posts",
    data: { title: id, description: "x", pubDate: new Date("2026-01-01"), tags: [], draft },
  }) as unknown as CollectionEntry<"posts">;

const fakeMeta = (slug: string, order: number, pinned = false): PostMeta => ({
  slug,
  order,
  pinned,
  hiddenFromList: false,
  searchVector: null,
  updatedAt: new Date(),
});

// ---------------------------------------------------------------------------
// Fixtures for getOrderedPosts / getPostWithMeta tests.
//
// Collection entries:
//   RU:  "01-intro"        (visible — has meta row)
//        "02-context"      (visible — has meta row)
//        "draft-ru-only"   (draft: true → filtered out)
//   EN:  "en/01-intro"     (visible — uses "01-intro" meta key)
//        "en/02-context"   (visible — uses "02-context" meta key)
//        "en/draft-only"   (draft: true → filtered out)
// ---------------------------------------------------------------------------
const FIXTURE_ENTRIES = [
  fakeEntry("01-intro"),
  fakeEntry("02-context"),
  fakeEntry("draft-ru-only", true),
  fakeEntry("en/01-intro"),
  fakeEntry("en/02-context"),
  fakeEntry("en/draft-only", true),
];

const FIXTURE_META: PostMeta[] = [fakeMeta("01-intro", 1), fakeMeta("02-context", 2)];

// ---------------------------------------------------------------------------
// Module mocks  (vi.mock calls are hoisted by Vitest before imports, so we
// cannot reference module-scope constants inside the factory.  Instead we
// use inline literals for the shape and reference the fixtures via closure
// from a factory function — Vitest hoists the vi.mock call but evaluates the
// factory lazily, so top-level `const` declarations ARE accessible.)
// ---------------------------------------------------------------------------

vi.mock("astro:content", () => ({
  getCollection: vi.fn(async (_name: string, filter?: (e: CollectionEntry<"posts">) => boolean) =>
    filter ? FIXTURE_ENTRIES.filter(filter) : [...FIXTURE_ENTRIES],
  ),
}));

// db.select().from(table)           — resolves to FIXTURE_META (list call)
// db.select().from(table).where(…) — resolves to first row (single-item call)
vi.mock("~/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() =>
        Object.assign(Promise.resolve([...FIXTURE_META]), {
          where: vi.fn(async () => [FIXTURE_META[0]]),
        }),
      ),
    })),
  },
}));

// ---------------------------------------------------------------------------
// Pure-function tests (no mocks needed)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Locale-aware tests (use mocked astro:content + ~/lib/db)
// ---------------------------------------------------------------------------

describe("getOrderedPosts(locale)", () => {
  it("returns only RU posts (no en/ prefix) when locale=ru", async () => {
    const { getOrderedPosts } = await import("./loader");
    const posts = await getOrderedPosts({ locale: "ru" });
    const ids = posts.map((p) => p.entry.id);
    expect(ids.every((id) => !id.startsWith("en/"))).toBe(true);
  });

  it("returns only EN posts (en/ prefix) when locale=en", async () => {
    const { getOrderedPosts } = await import("./loader");
    const posts = await getOrderedPosts({ locale: "en" });
    const ids = posts.map((p) => p.entry.id);
    expect(ids.every((id) => id.startsWith("en/"))).toBe(true);
  });

  it("excludes drafts in both locales", async () => {
    const { getOrderedPosts } = await import("./loader");
    const ru = await getOrderedPosts({ locale: "ru" });
    expect(ru.map((p) => p.entry.id)).not.toContain("draft-ru-only");
    const en = await getOrderedPosts({ locale: "en" });
    expect(en.map((p) => p.entry.id)).not.toContain("en/draft-only");
  });

  it("defaults to RU when called with no argument (back-compat)", async () => {
    const { getOrderedPosts } = await import("./loader");
    const posts = await getOrderedPosts();
    expect(posts.every((p) => !p.entry.id.startsWith("en/"))).toBe(true);
  });
});
