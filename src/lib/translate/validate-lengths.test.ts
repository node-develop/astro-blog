import { describe, it, expect } from "vitest";
import { checkLengths, truncateAtBoundary } from "./validate-lengths";

describe("truncateAtBoundary", () => {
  it("returns input unchanged when within max", () => {
    expect(truncateAtBoundary("hello world", 200)).toBe("hello world");
  });

  it("hard-slices when no space exists in the cut window", () => {
    const input = "a".repeat(250);
    const result = truncateAtBoundary(input, 200);
    expect(result.length).toBe(200);
    expect(result).toBe("a".repeat(200));
  });

  it("cuts at last space when it is past 60% of max", () => {
    const input = "a".repeat(195) + " " + "b".repeat(60);
    const result = truncateAtBoundary(input, 200);
    expect(result.length).toBe(195);
    expect(result).toBe("a".repeat(195));
  });

  it("hard-slices when last space is below 60% of max", () => {
    const input = "ab " + "c".repeat(250);
    const result = truncateAtBoundary(input, 200);
    expect(result.length).toBe(200);
  });
});

describe("checkLengths", () => {
  it("returns no violations when all values fit", () => {
    const violations = checkLengths(
      { description: "hello world" },
      { description: { min: 5, max: 200 } },
    );
    expect(violations).toEqual([]);
  });

  it("flags over-max violation", () => {
    const violations = checkLengths(
      { description: "x".repeat(247) },
      { description: { min: 10, max: 200 } },
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      key: "description",
      got: 247,
      max: 200,
      kind: "over",
    });
  });

  it("flags under-min violation", () => {
    const violations = checkLengths(
      { summary: "x".repeat(50) },
      { summary: { min: 60, max: 280 } },
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      key: "summary",
      got: 50,
      min: 60,
      kind: "under",
    });
  });

  it("ignores keys without limits", () => {
    const violations = checkLengths(
      { description: "ok", randomField: "x".repeat(5000) },
      { description: { max: 200 } },
    );
    expect(violations).toEqual([]);
  });

  it("flags multiple violations independently", () => {
    const violations = checkLengths(
      { title: "x".repeat(150), summary: "tiny" },
      {
        title: { min: 3, max: 120 },
        summary: { min: 60, max: 280 },
      },
    );
    expect(violations).toHaveLength(2);
    expect(violations.map((v) => v.kind).sort()).toEqual(["over", "under"]);
  });
});
