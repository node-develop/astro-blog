import type { CollectionEntry } from "astro:content";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchNode } from "~/lib/search/pagefind-node";

const { getCollectionMock, searchPostsMetaMock } = vi.hoisted(() => ({
  getCollectionMock: vi.fn(),
  searchPostsMetaMock: vi.fn(),
}));

vi.mock("astro:content", () => ({ getCollection: getCollectionMock }));
vi.mock("~/lib/db/repo/posts-meta", () => ({ searchPostsMeta: searchPostsMetaMock }));

const fakeEntry = (id: string, title: string): CollectionEntry<"posts"> =>
  ({
    id,
    slug: id,
    body: "",
    collection: "posts",
    data: {
      title,
      description: `${title} description`,
      pubDate: new Date("2026-01-01"),
      tags: [],
      draft: false,
    },
  }) as unknown as CollectionEntry<"posts">;

describe("searchNode result URLs", () => {
  beforeEach(() => {
    getCollectionMock.mockResolvedValue([
      fakeEntry("russian-result", "Russian result"),
      fakeEntry("en/english-result", "English result"),
    ]);
    searchPostsMetaMock.mockReset();
  });

  it("returns a slash-canonical Russian article URL", async () => {
    searchPostsMetaMock.mockResolvedValue([{ slug: "russian-result", rank: 1 }]);

    await expect(searchNode("result", "ru")).resolves.toEqual([
      {
        url: "/blog/russian-result/",
        title: "Russian result",
        excerpt: "Russian result description",
      },
    ]);
  });

  it("finds the English entry of a bare slug, searches the English vector and has no double locale", async () => {
    // posts_meta is keyed by the bare slug for both languages.
    searchPostsMetaMock.mockResolvedValue([{ slug: "english-result", rank: 1 }]);

    await expect(searchNode("result", "en")).resolves.toEqual([
      {
        url: "/en/blog/english-result/",
        title: "English result",
        excerpt: "English result description",
      },
    ]);
    expect(searchPostsMetaMock).toHaveBeenCalledWith("result", 20, "en");
  });

  it("does not answer an English search with the Russian entry of the same slug", async () => {
    getCollectionMock.mockResolvedValue([fakeEntry("only-russian", "Only Russian")]);
    searchPostsMetaMock.mockResolvedValue([{ slug: "only-russian", rank: 1 }]);

    await expect(searchNode("result", "en")).resolves.toEqual([]);
  });
});
