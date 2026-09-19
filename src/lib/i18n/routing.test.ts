import { describe, it, expect, vi } from "vitest";
import {
  getCounterpart,
  getLocaleFromPath,
  stripLocalePrefix,
  checkCounterpartExists,
  PAIRED_STATIC_ROUTES,
} from "./routing";

vi.mock("astro:content", () => {
  interface MockEntry {
    readonly id: string;
    readonly data: {
      readonly draft?: boolean;
      readonly tags?: readonly string[];
      readonly locale?: "ru" | "en";
    };
  }
  const posts: readonly MockEntry[] = [
    { id: "01-introduction", data: { draft: false, tags: ["claude-code", "solo", "pair"] } },
    { id: "02-context-and-cache", data: { draft: false, tags: ["claude-code", "pair"] } },
    { id: "04-draft", data: { draft: false, tags: [] } },
    { id: "05-ru-draft", data: { draft: true, tags: [] } },
    { id: "en/01-introduction", data: { draft: false, tags: ["claude-code", "solo", "pair"] } },
    { id: "en/04-draft", data: { draft: true, tags: ["claude-code"] } },
    { id: "en/05-ru-draft", data: { draft: false, tags: [] } },
    { id: "en/03-skills", data: { draft: false, tags: ["pair"] } },
  ];
  const projects: readonly MockEntry[] = [
    { id: "paired-project", data: {} },
    { id: "en/paired-project", data: {} },
    { id: "ru-only-project", data: {} },
    { id: "en/en-only-project", data: {} },
  ];
  const site: readonly MockEntry[] = [
    { id: "about", data: {} },
    { id: "en/about", data: {} },
    { id: "now", data: {} },
    { id: "en/uses", data: {} },
  ];
  const course: readonly MockEntry[] = [
    { id: "guide/_index", data: { locale: "ru" } },
    { id: "guide/en/_index", data: { locale: "en" } },
    { id: "ru-only-course/_index", data: { locale: "ru" } },
  ];
  const lesson: readonly MockEntry[] = [
    { id: "guide/01-paired", data: { locale: "ru" } },
    { id: "guide/en/01-paired", data: { locale: "en" } },
    { id: "guide/15-ru-only", data: { locale: "ru" } },
    { id: "guide/en/16-en-only", data: { locale: "en" } },
    // The EN file exists, but its frontmatter lacks `locale: en` (schema default
    // is "ru"), so the EN lesson route does not build it.
    { id: "guide/17-unflagged-twin", data: { locale: "ru" } },
    { id: "guide/en/17-unflagged-twin", data: { locale: "ru" } },
    // Both lesson files are fine, but the course has no EN landing, and lesson
    // routes only iterate over courses of their own language.
    { id: "ru-only-course/01-intro", data: { locale: "ru" } },
    { id: "ru-only-course/en/01-intro", data: { locale: "en" } },
  ];
  const collections: Readonly<Record<string, readonly MockEntry[]>> = {
    posts,
    projects,
    site,
    course,
    lesson,
  };
  return {
    getCollection: vi.fn(async (name: string, filter?: (e: MockEntry) => boolean) => {
      const all = collections[name] ?? [];
      return filter ? all.filter(filter) : all;
    }),
  };
});

describe("getLocaleFromPath", () => {
  it("returns 'en' for /en/* paths", () => {
    expect(getLocaleFromPath("/en/")).toBe("en");
    expect(getLocaleFromPath("/en/blog/foo")).toBe("en");
    expect(getLocaleFromPath("/en")).toBe("en");
  });
  it("returns 'ru' for everything else", () => {
    expect(getLocaleFromPath("/")).toBe("ru");
    expect(getLocaleFromPath("/blog/foo")).toBe("ru");
    expect(getLocaleFromPath("/about")).toBe("ru");
  });
  it("does not treat /endpoint or /enroll as en-prefixed", () => {
    expect(getLocaleFromPath("/endpoint")).toBe("ru");
    expect(getLocaleFromPath("/enroll")).toBe("ru");
  });
});

describe("stripLocalePrefix", () => {
  it("removes /en prefix", () => {
    expect(stripLocalePrefix("/en/blog/foo")).toBe("/blog/foo");
    expect(stripLocalePrefix("/en/")).toBe("/");
    expect(stripLocalePrefix("/en")).toBe("/");
  });
  it("returns RU paths unchanged", () => {
    expect(stripLocalePrefix("/blog/foo")).toBe("/blog/foo");
    expect(stripLocalePrefix("/")).toBe("/");
  });
  it("does not strip /endpoint or /enroll", () => {
    expect(stripLocalePrefix("/endpoint")).toBe("/endpoint");
    expect(stripLocalePrefix("/enroll")).toBe("/enroll");
  });
});

describe("getCounterpart", () => {
  it("RU root → /en/", () => {
    expect(getCounterpart("/", "ru")).toBe("/en/");
  });
  it("EN root → /", () => {
    expect(getCounterpart("/en/", "en")).toBe("/");
    expect(getCounterpart("/en", "en")).toBe("/");
  });
  it("RU article → /en/<same>", () => {
    expect(getCounterpart("/blog/01-introduction", "ru")).toBe("/en/blog/01-introduction/");
  });
  it("EN article → RU equivalent", () => {
    expect(getCounterpart("/en/blog/01-introduction", "en")).toBe("/blog/01-introduction/");
  });
  it("preserves trailing slash", () => {
    expect(getCounterpart("/blog/", "ru")).toBe("/en/blog/");
  });
});

describe("checkCounterpartExists", () => {
  it("returns true when EN twin exists for RU article", async () => {
    expect(await checkCounterpartExists("/blog/01-introduction", "ru")).toBe(true);
  });
  it("returns false when EN twin missing for RU article", async () => {
    expect(await checkCounterpartExists("/blog/02-context-and-cache", "ru")).toBe(false);
  });
  it("returns true for the paired static routes, in both languages", async () => {
    for (const route of PAIRED_STATIC_ROUTES) {
      expect(await checkCounterpartExists(route, "ru"), route).toBe(true);
      expect(await checkCounterpartExists(`/en${route}`, "en"), `/en${route}`).toBe(true);
    }
    expect(await checkCounterpartExists("/search", "ru")).toBe(true);
    expect(await checkCounterpartExists("/en", "en")).toBe(true);
  });
  it("returns true for EN article when RU source exists", async () => {
    expect(await checkCounterpartExists("/en/blog/01-introduction", "en")).toBe(true);
  });

  // Tag archives: hreflang pair only when BOTH locale archives are indexable
  // (>= MIN_INDEXABLE_TAG_POSTS non-draft posts). "claude-code" has 2 RU but
  // only 1 non-draft EN post, so the EN archive is noindexed and must not be
  // advertised as an alternate from either side.
  it("suppresses the tag-archive counterpart when the EN archive is noindexed", async () => {
    expect(await checkCounterpartExists("/tags/claude-code/", "ru")).toBe(false);
    expect(await checkCounterpartExists("/en/tags/claude-code/", "en")).toBe(false);
    expect(await checkCounterpartExists("/tags/solo/", "ru")).toBe(false);
    expect(await checkCounterpartExists("/tags/pair/", "ru")).toBe(true);
    expect(await checkCounterpartExists("/en/tags/pair/", "en")).toBe(true);
  });

  it.each(["/login/", "/admin/", "/admin/posts/", "/api/auth/get-session/"])(
    "returns false for utility route %s",
    async (pathname) => {
      expect(await checkCounterpartExists(pathname, "ru")).toBe(false);
    },
  );

  // A draft is not built by the blog route, so it is not a twin — whichever
  // side asks.
  it("treats a draft post twin as absent", async () => {
    expect(await checkCounterpartExists("/blog/04-draft/", "ru")).toBe(false);
    expect(await checkCounterpartExists("/en/blog/05-ru-draft/", "en")).toBe(false);
  });

  it("answers for project pages from the projects collection", async () => {
    expect(await checkCounterpartExists("/projects/paired-project/", "ru")).toBe(true);
    expect(await checkCounterpartExists("/en/projects/paired-project/", "en")).toBe(true);
    expect(await checkCounterpartExists("/projects/ru-only-project/", "ru")).toBe(false);
    expect(await checkCounterpartExists("/en/projects/en-only-project/", "en")).toBe(false);
  });

  it("answers for course landings from the course collection", async () => {
    expect(await checkCounterpartExists("/courses/guide/", "ru")).toBe(true);
    expect(await checkCounterpartExists("/en/courses/guide/", "en")).toBe(true);
    expect(await checkCounterpartExists("/courses/ru-only-course/", "ru")).toBe(false);
  });

  it("answers for lessons from the lesson collection", async () => {
    expect(await checkCounterpartExists("/courses/guide/01-paired/", "ru")).toBe(true);
    expect(await checkCounterpartExists("/en/courses/guide/01-paired/", "en")).toBe(true);
    // The fifteenth lesson published in Russian only.
    expect(await checkCounterpartExists("/courses/guide/15-ru-only/", "ru")).toBe(false);
    expect(await checkCounterpartExists("/en/courses/guide/16-en-only/", "en")).toBe(false);
  });

  it("does not count an EN lesson file the EN route would not build", async () => {
    expect(await checkCounterpartExists("/courses/guide/17-unflagged-twin/", "ru")).toBe(false);
    expect(await checkCounterpartExists("/courses/ru-only-course/01-intro/", "ru")).toBe(false);
  });

  it("answers for site entity pages from the site collection", async () => {
    expect(await checkCounterpartExists("/about/", "ru")).toBe(true);
    expect(await checkCounterpartExists("/en/about/", "en")).toBe(true);
    expect(await checkCounterpartExists("/now/", "ru")).toBe(false);
    expect(await checkCounterpartExists("/en/uses/", "en")).toBe(false);
  });

  it("accepts the path with or without the trailing slash", async () => {
    expect(await checkCounterpartExists("/courses/guide/01-paired", "ru")).toBe(true);
    expect(await checkCounterpartExists("/courses/guide/15-ru-only", "ru")).toBe(false);
    expect(await checkCounterpartExists("/projects/ru-only-project", "ru")).toBe(false);
  });

  // No unconditional "yes" is left for paths nobody vouches for: an unknown
  // address (what the runtime 404 renders) must not offer a second dead URL.
  it.each(["/no-such-page/", "/courses/", "/courses/guide/01-paired/extra/", "/05-hooks"])(
    "returns false for unknown path %s",
    async (pathname) => {
      expect(await checkCounterpartExists(pathname, "ru")).toBe(false);
    },
  );
});

it.each([
  ["/blog", "ru"],
  ["/blog/", "ru"],
  ["/en/blog", "en"],
  ["/en/blog/", "en"],
] as const)("blog index %s has a counterpart", async (path, locale) => {
  expect(await checkCounterpartExists(path, locale)).toBe(true);
});
