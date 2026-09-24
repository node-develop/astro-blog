import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import type { CollectionEntry } from "astro:content";
import type { PostMeta } from "~/lib/db/schema";
import { eq } from "drizzle-orm";
import { postsMeta } from "~/lib/db/schema";
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
//        "no-meta-row"     (visible — NO meta row; must not be dropped)
//        "draft-ru-only"   (draft: true → filtered out)
//   EN:  "en/01-intro"     (visible — uses "01-intro" meta key)
//        "en/02-context"   (visible — uses "02-context" meta key)
//        "en/no-meta-row"  (visible — NO meta row; must not be dropped)
//        "en/draft-only"   (draft: true → filtered out)
// ---------------------------------------------------------------------------
const FIXTURE_ENTRIES = [
  fakeEntry("01-intro"),
  fakeEntry("02-context"),
  fakeEntry("no-meta-row"),
  fakeEntry("draft-ru-only", true),
  fakeEntry("en/01-intro"),
  fakeEntry("en/02-context"),
  fakeEntry("en/no-meta-row"),
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

// `whereRows.current` is what the single-row lookup of getPostWithMeta resolves
// to. Each test sets it, so the fake can model a missing row as well as a
// present one; `whereSpy` records the predicate the loader looked the row up by.
const { warnSpy, whereSpy, whereRows } = vi.hoisted(() => ({
  warnSpy: vi.fn(),
  whereSpy: vi.fn(),
  whereRows: { current: [] as PostMeta[] },
}));

// pino would otherwise spin up a real pino-pretty transport worker for every
// warning this suite provokes on purpose.
vi.mock("~/lib/logger", () => ({
  logger: { warn: warnSpy, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("astro:content", () => ({
  getCollection: vi.fn(async (_name: string, filter?: (e: CollectionEntry<"posts">) => boolean) =>
    filter ? FIXTURE_ENTRIES.filter(filter) : [...FIXTURE_ENTRIES],
  ),
}));

// db.select().from(table)           — resolves to FIXTURE_META (list call)
// db.select().from(table).where(…) — resolves to whereRows.current (single-item call)
vi.mock("~/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() =>
        Object.assign(Promise.resolve([...FIXTURE_META]), {
          where: whereSpy.mockImplementation(async () => [...whereRows.current]),
        }),
      ),
    })),
  },
}));

// ---------------------------------------------------------------------------
// Pure-function tests (no mocks needed)
// ---------------------------------------------------------------------------

describe("defaultMetaFor", () => {
  it("keeps a post without a posts_meta row visible, just last in manual order", () => {
    // A missing row is an operational gap (the backfill has not run yet), not
    // an editorial decision to unpublish. Hiding here used to drop the post
    // from the list, the sitemap and llms.txt with no error anywhere.
    const m = defaultMetaFor("some-slug");
    expect(m.hiddenFromList).toBe(false);
    expect(m.order).toBe(Number.MAX_SAFE_INTEGER);
    expect(m.pinned).toBe(false);
    expect(m.slug).toBe("some-slug");
  });
});

describe("sortWithMeta", () => {
  it("puts a new API article above old pinned and manually ordered posts without mutating input", () => {
    const newest = {
      ...fakeEntry("new-api"),
      data: { ...fakeEntry("new-api").data, pubDate: new Date("2026-09-12") },
    };
    const old = {
      ...fakeEntry("old-pinned"),
      data: { ...fakeEntry("old-pinned").data, updatedDate: new Date("2026-10-01") },
    };
    const items: PostWithMeta[] = [
      { entry: old, meta: fakeMeta("old-pinned", 1, true) },
      { entry: newest, meta: fakeMeta("new-api", 2_000_000_000) },
    ];
    expect(sortWithMeta(items).map((item) => item.entry.id)).toEqual(["new-api", "old-pinned"]);
    expect(items[0]?.entry.id).toBe("old-pinned");
  });

  it("uses the slug as a deterministic tie-breaker when publication dates match", () => {
    const items: PostWithMeta[] = [
      { entry: fakeEntry("b"), meta: fakeMeta("b", 1, true) },
      { entry: fakeEntry("a"), meta: fakeMeta("a", 2_000_000_000) },
    ];
    expect(sortWithMeta(items).map((item) => item.entry.id)).toEqual(["a", "b"]);
  });
});

// ---------------------------------------------------------------------------
// Locale-aware tests (use mocked astro:content + ~/lib/db)
// ---------------------------------------------------------------------------

describe("getOrderedPosts(locale)", () => {
  // `isDbReachable()` keys off DATABASE_URL. Without it the loader takes the
  // build-time fallback path and never touches the mocked db, so the meta
  // merge below would not be exercised at all.
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost:5432/test");
    warnSpy.mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns only RU posts (no en/ prefix) when locale=ru", async () => {
    const { getOrderedPosts } = await import("./loader");
    const posts = await getOrderedPosts({ locale: "ru" });
    const ids = posts.map((p) => p.entry.id);
    // The non-draft RU entries of FIXTURE_ENTRIES. A universal check such as
    // every() is also true of an empty list, so it cannot guard this rule.
    expect(ids).toEqual(["01-intro", "02-context", "no-meta-row"]);
  });

  it("returns only EN posts (en/ prefix) when locale=en", async () => {
    const { getOrderedPosts } = await import("./loader");
    const posts = await getOrderedPosts({ locale: "en" });
    const ids = posts.map((p) => p.entry.id);
    expect(ids).toEqual(["en/01-intro", "en/02-context", "en/no-meta-row"]);
  });

  it.each(["ru", "en"] as const)(
    "warns loudly about the missing row instead of swallowing it (%s)",
    async (locale) => {
      const { getOrderedPosts } = await import("./loader");
      await getOrderedPosts({ locale });
      expect(warnSpy).toHaveBeenCalledTimes(1);
      // Slugs are posts_meta keys, so the EN list reports the un-prefixed slug
      // and only the one entry that really has no row: if EN ids stopped
      // resolving to the RU-keyed rows, all three EN ids would be listed here.
      const missing = ["no-meta-row"];
      expect(warnSpy.mock.calls[0]?.[0]).toMatchObject({
        locale,
        slugs: missing,
        count: missing.length,
      });
    },
  );

  it.each(["ru", "en"] as const)(
    "names and counts every slug without a row, not just the first (%s)",
    async (locale) => {
      const { getOrderedPosts } = await import("./loader");
      // Drop the "02-context" row: two posts of the locale are now without meta.
      const removed = FIXTURE_META.pop();
      try {
        const posts = await getOrderedPosts({ locale });
        const missing = ["02-context", "no-meta-row"];
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy.mock.calls[0]?.[0]).toMatchObject({
          locale,
          slugs: missing,
          count: missing.length,
        });
        // Both stay listed: a missing row never removes a post.
        const prefix = locale === "en" ? "en/" : "";
        expect(posts.map((p) => p.entry.id)).toEqual(
          expect.arrayContaining(missing.map((slug) => `${prefix}${slug}`)),
        );
      } finally {
        if (removed) FIXTURE_META.push(removed);
      }
    },
  );

  it.each([
    { locale: "ru", hiddenId: "no-meta-row", visibleId: "01-intro" },
    { locale: "en", hiddenId: "en/no-meta-row", visibleId: "en/01-intro" },
  ] as const)(
    "still hides a post whose row says hiddenFromList (explicit editorial act, $locale)",
    async ({ locale, hiddenId, visibleId }) => {
      const { getOrderedPosts } = await import("./loader");
      // One RU-keyed row hides the post in both locales.
      FIXTURE_META.push({ ...fakeMeta("no-meta-row", 3), hiddenFromList: true });
      try {
        const ids = (await getOrderedPosts({ locale })).map((p) => p.entry.id);
        expect(ids).not.toContain(hiddenId);
        // Positive control: the list is not simply empty.
        expect(ids).toContain(visibleId);
        // Every entry found its row, so nothing fell back to the visible default.
        expect(warnSpy).not.toHaveBeenCalled();
      } finally {
        FIXTURE_META.pop();
      }
    },
  );

  it("defaults to RU when called with no argument (back-compat)", async () => {
    const { getOrderedPosts } = await import("./loader");
    const ids = (await getOrderedPosts()).map((p) => p.entry.id);
    const ru = await getOrderedPosts({ locale: "ru" });
    expect(ids).toEqual(ru.map((p) => p.entry.id));
    expect(ids.length).toBeGreaterThan(0);
  });
});

describe("getPostWithMeta(slug, locale)", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgres://test:test@localhost:5432/test");
    warnSpy.mockClear();
    whereSpy.mockClear();
    whereRows.current = [];
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("serves a post without a posts_meta row as visible and warns with slug + locale", async () => {
    const { getPostWithMeta } = await import("./loader");
    const result = await getPostWithMeta("no-meta-row", { locale: "en" });
    expect(result?.entry.id).toBe("en/no-meta-row");
    expect(result?.meta.hiddenFromList).toBe(false);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatchObject({ slug: "no-meta-row", locale: "en" });
  });

  it("looks the row up by the RU slug even for the EN variant", async () => {
    const { getPostWithMeta } = await import("./loader");
    await getPostWithMeta("01-intro", { locale: "en" });
    // posts_meta is keyed by the RU slug; "en/01-intro" would never match a row.
    expect(whereSpy).toHaveBeenCalledTimes(1);
    expect(whereSpy.mock.calls[0]?.[0]).toEqual(eq(postsMeta.slug, "01-intro"));
  });

  it("returns the row's own meta, not the default, and stays quiet when the row exists", async () => {
    const { getPostWithMeta } = await import("./loader");
    whereRows.current = [{ ...fakeMeta("01-intro", 7, true), hiddenFromList: true }];
    const result = await getPostWithMeta("01-intro", { locale: "ru" });
    expect(result?.entry.id).toBe("01-intro");
    expect(result?.meta).toMatchObject({ order: 7, pinned: true, hiddenFromList: true });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("returns null for a slug that is not in the collection", async () => {
    const { getPostWithMeta } = await import("./loader");
    expect(await getPostWithMeta("does-not-exist", { locale: "ru" })).toBeNull();
    // An RU-only slug has no EN variant either.
    expect(await getPostWithMeta("draft-ru-only", { locale: "en" })).toBeNull();
  });
});
