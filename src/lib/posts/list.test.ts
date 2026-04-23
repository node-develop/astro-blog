import { describe, it, expect } from "vitest";
import { comparePosts, parseSlugOrder, type PostEntry } from "./list";

describe("parseSlugOrder", () => {
  it("extracts leading numeric prefix with dash", () => {
    expect(parseSlugOrder("02-context-and-cache")).toBe(2);
  });

  it("extracts leading numeric prefix with underscore", () => {
    expect(parseSlugOrder("10_agent-teams")).toBe(10);
  });

  it("returns null when slug has no numeric prefix", () => {
    expect(parseSlugOrder("hello-world")).toBeNull();
  });

  it("returns null for malformed prefix", () => {
    expect(parseSlugOrder("-2-foo")).toBeNull();
  });

  it("returns null for empty slug", () => {
    expect(parseSlugOrder("")).toBeNull();
  });
});

function fakePost(id: string, pubDate: Date, draft = false): PostEntry {
  return {
    id,
    slug: id,
    body: "",
    collection: "posts",
    data: {
      title: id,
      description: "desc",
      pubDate,
      tags: [],
      draft,
    },
  } as unknown as PostEntry;
}

describe("comparePosts", () => {
  it("numerically ordered slugs come before non-numeric", () => {
    const a = fakePost("02-foo", new Date("2026-01-01"));
    const b = fakePost("hello-world", new Date("2026-06-01"));
    expect(comparePosts(a, b)).toBeLessThan(0);
  });

  it("ascending numeric order for two prefixed slugs", () => {
    const a = fakePost("02-foo", new Date("2026-01-01"));
    const b = fakePost("10-bar", new Date("2026-01-01"));
    expect(comparePosts(a, b)).toBeLessThan(0);
  });

  it("pubDate descending when neither has numeric prefix", () => {
    const a = fakePost("alpha", new Date("2026-01-01"));
    const b = fakePost("beta", new Date("2026-06-01"));
    expect(comparePosts(a, b)).toBeGreaterThan(0);
  });
});
