import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
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

const { warnSpy } = vi.hoisted(() => ({ warnSpy: vi.fn() }));

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

  it("lists a post that has no posts_meta row instead of silently dropping it", async () => {
    const { getOrderedPosts } = await import("./loader");
    const ru = await getOrderedPosts({ locale: "ru" });
    expect(ru.map((p) => p.entry.id)).toContain("no-meta-row");
    const en = await getOrderedPosts({ locale: "en" });
    expect(en.map((p) => p.entry.id)).toContain("en/no-meta-row");
  });

  it("warns loudly about the missing row instead of swallowing it", async () => {
    const { getOrderedPosts } = await import("./loader");
    await getOrderedPosts({ locale: "ru" });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatchObject({ slugs: ["no-meta-row"] });
  });

  it("still hides a post whose row says hiddenFromList (explicit editorial act)", async () => {
    const { getOrderedPosts } = await import("./loader");
    FIXTURE_META.push({ ...fakeMeta("no-meta-row", 3), hiddenFromList: true });
    try {
      const ru = await getOrderedPosts({ locale: "ru" });
      expect(ru.map((p) => p.entry.id)).not.toContain("no-meta-row");
    } finally {
      FIXTURE_META.pop();
    }
  });

  it("defaults to RU when called with no argument (back-compat)", async () => {
    const { getOrderedPosts } = await import("./loader");
    const posts = await getOrderedPosts();
    expect(posts.every((p) => !p.entry.id.startsWith("en/"))).toBe(true);
  });
});
