import { describe, expect, it } from "vitest";
import { groupPostsByTag, getAllTagSlugs, resolveTagLabel } from "~/lib/content/tags";
import type { PostWithMeta } from "~/lib/content/loader";

const fakePost = (id: string, tags: readonly string[], order = 1): PostWithMeta => ({
  entry: {
    id,
    data: {
      title: id,
      description: id,
      pubDate: new Date("2026-04-23"),
      tags: [...tags],
      author: "Артём",
      draft: false,
    },
    body: "",
  } as unknown as PostWithMeta["entry"],
  meta: {
    slug: id.replace(/^en\//, ""),
    order,
    pinned: false,
    hiddenFromList: false,
    searchVector: null,
    updatedAt: new Date(0),
  },
});

describe("groupPostsByTag", () => {
  it("groups posts by tag and preserves caller order within each bucket", () => {
    const a = fakePost("01-foo", ["claude-code", "guide"]);
    const b = fakePost("02-bar", ["claude-code"]);
    const c = fakePost("03-baz", ["guide"]);
    const grouped = groupPostsByTag([a, b, c]);
    expect(grouped.get("claude-code")?.map((p) => p.entry.id)).toEqual(["01-foo", "02-bar"]);
    expect(grouped.get("guide")?.map((p) => p.entry.id)).toEqual(["01-foo", "03-baz"]);
  });

  it("returns an empty map when no posts have tags", () => {
    expect(groupPostsByTag([fakePost("01-x", [])]).size).toBe(0);
  });

  it("never mutates input post arrays", () => {
    const post = fakePost("01-foo", ["a", "b"]);
    const before = [...post.entry.data.tags];
    groupPostsByTag([post]);
    expect(post.entry.data.tags).toEqual(before);
  });
});

describe("getAllTagSlugs", () => {
  it("returns sorted unique slugs across both locales", () => {
    const ru = [fakePost("01-foo", ["b", "a"]), fakePost("02-bar", ["c"])];
    const en = [fakePost("en/01-foo", ["a", "d"])];
    expect(getAllTagSlugs({ ru, en })).toEqual(["a", "b", "c", "d"]);
    expect(getAllTagSlugs({ ru: [], en: [] })).toEqual([]);
  });
});

describe("resolveTagLabel", () => {
  it("returns the dict label when present, slug otherwise", () => {
    expect(resolveTagLabel("claude-code", "ru", { "claude-code": "Claude Code" })).toBe(
      "Claude Code",
    );
    expect(resolveTagLabel("unmapped", "en", {})).toBe("unmapped");
  });
});
