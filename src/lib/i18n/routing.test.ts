import { describe, it, expect, vi } from "vitest";
import {
  getCounterpart,
  getLocaleFromPath,
  stripLocalePrefix,
  checkCounterpartExists,
} from "./routing";

vi.mock("astro:content", () => {
  interface MockEntry {
    readonly id: string;
    readonly data: { readonly draft: boolean; readonly tags: readonly string[] };
  }
  const all: readonly MockEntry[] = [
    { id: "01-introduction", data: { draft: false, tags: ["claude-code", "solo", "pair"] } },
    { id: "02-context-and-cache", data: { draft: false, tags: ["claude-code", "pair"] } },
    { id: "en/01-introduction", data: { draft: false, tags: ["claude-code", "solo", "pair"] } },
    { id: "en/04-draft", data: { draft: true, tags: ["claude-code"] } },
    { id: "en/03-skills", data: { draft: false, tags: ["pair"] } },
  ];
  return {
    getCollection: vi.fn(async (_name: string, filter?: (e: MockEntry) => boolean) =>
      filter ? all.filter(filter) : all,
    ),
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
  it("returns true for chrome routes (/, /about, /search)", async () => {
    expect(await checkCounterpartExists("/", "ru")).toBe(true);
    expect(await checkCounterpartExists("/about", "ru")).toBe(true);
    expect(await checkCounterpartExists("/search", "ru")).toBe(true);
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
});

it.each([
  ["/blog", "ru"],
  ["/blog/", "ru"],
  ["/en/blog", "en"],
  ["/en/blog/", "en"],
] as const)("blog index %s has a counterpart", async (path, locale) => {
  expect(await checkCounterpartExists(path, locale)).toBe(true);
});
