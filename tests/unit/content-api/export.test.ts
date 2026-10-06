import { describe, expect, it } from "vitest";
import { exportSchema } from "~/lib/content-api/contract";
import { snapshotIdOf, type ManifestEntry } from "~/lib/content-api/snapshot-id";

const entry = (over: Partial<ManifestEntry> = {}): ManifestEntry => ({
  slug: "a-post",
  lang: "ru",
  revision: "6b1f7a0e-8a58-4c5e-9d5b-0a1d3f7c2b11",
  order: 1,
  pinned: false,
  hiddenFromList: false,
  ...over,
});
const manifest = [
  entry(),
  entry({ slug: "a-post", lang: "en", revision: "0d7bb1d4-4f0a-4b38-86f5-2c4cb9b6a4e2" }),
  entry({ slug: "b-post", revision: "f3b0a3a2-3f4e-49b6-a2f0-8f0a5a5f7f10" }),
];

describe("snapshotIdOf", () => {
  it("is a valid uuid that does not depend on the order of the rows", () => {
    const id = snapshotIdOf(manifest);
    expect(snapshotIdOf([...manifest].reverse())).toBe(id);
    // The exact id is the contract with the build: a new revision must change it.
    expect(
      exportSchema.safeParse({
        snapshotId: id,
        generatedAt: new Date().toISOString(),
        count: 0,
        articles: [],
      }).success,
    ).toBe(true);
  });
  it.each<[string, Partial<ManifestEntry>]>([
    ["revision", { revision: "11111111-1111-4111-8111-111111111111" }],
    ["order", { order: 2 }],
    ["pinned", { pinned: true }],
    ["hiddenFromList", { hiddenFromList: true }],
  ])("changes when %s changes", (_name, over) => {
    expect(snapshotIdOf([entry(over), ...manifest.slice(1)])).not.toBe(snapshotIdOf(manifest));
  });
});

describe("exportSchema", () => {
  it("rejects a count that does not match the articles", () => {
    const result = exportSchema.safeParse({
      snapshotId: snapshotIdOf(manifest),
      generatedAt: new Date().toISOString(),
      count: 2,
      articles: [],
    });
    expect(result.success).toBe(false);
  });
});
