import { describe, expect, it } from "vitest";
import { isTagArchiveIndexable } from "~/lib/seo/indexability";

describe("tag archive indexability", () => {
  it.each([
    [0, false],
    [1, false],
    [2, true],
    [3, true],
  ])("marks %i locale posts indexable=%s", (count, expected) => {
    expect(isTagArchiveIndexable(Array.from({ length: count }))).toBe(expected);
  });
});
