import { describe, it, expect } from "vitest";
import { postUpsertInput } from "./posts";

const baseFm = {
  title: "Hello world",
  description: "A description that is at least ten characters long.",
  pubDate: "2026-05-09",
  tags: ["a", "b"],
  draft: false,
};

const baseInput = {
  slug: "hello-world",
  frontmatter: baseFm,
  body: "Body text.",
};

describe("postUpsertInput — slug", () => {
  it("accepts a-z, 0-9, dashes and underscores", () => {
    expect(postUpsertInput.parse({ ...baseInput, slug: "hello_world-2" }).slug).toBe(
      "hello_world-2",
    );
  });

  it("rejects a slug that does not start with alphanumeric", () => {
    expect(() => postUpsertInput.parse({ ...baseInput, slug: "-bad" })).toThrow();
  });
});

describe("postUpsertInput — summary", () => {
  it("normalises empty-string summary to undefined", () => {
    const out = postUpsertInput.parse({
      ...baseInput,
      frontmatter: { ...baseFm, summary: "" },
    });
    expect(out.frontmatter.summary).toBeUndefined();
  });

  it("rejects a 30-char (too short) non-empty summary", () => {
    expect(() =>
      postUpsertInput.parse({
        ...baseInput,
        frontmatter: { ...baseFm, summary: "x".repeat(30) },
      }),
    ).toThrow();
  });
});
