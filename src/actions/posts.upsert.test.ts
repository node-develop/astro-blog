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

describe("postUpsertInput — description.max(200)", () => {
  it("accepts 200-character description", () => {
    const desc = "x".repeat(200);
    expect(
      postUpsertInput.parse({ ...baseInput, frontmatter: { ...baseFm, description: desc } }),
    ).toBeDefined();
  });

  it("rejects 201-character description (synced with content.config.ts)", () => {
    const desc = "x".repeat(201);
    expect(() =>
      postUpsertInput.parse({ ...baseInput, frontmatter: { ...baseFm, description: desc } }),
    ).toThrow();
  });

  it("rejects 250-character description", () => {
    const desc = "x".repeat(250);
    expect(() =>
      postUpsertInput.parse({ ...baseInput, frontmatter: { ...baseFm, description: desc } }),
    ).toThrow();
  });
});

describe("postUpsertInput — summary", () => {
  const ok60 = "x".repeat(60);

  it("accepts a missing summary field (optional)", () => {
    const out = postUpsertInput.parse(baseInput);
    expect(out.frontmatter.summary).toBeUndefined();
  });

  it("normalises empty-string summary to undefined", () => {
    const out = postUpsertInput.parse({
      ...baseInput,
      frontmatter: { ...baseFm, summary: "" },
    });
    expect(out.frontmatter.summary).toBeUndefined();
  });

  it("accepts a 60-char summary", () => {
    const out = postUpsertInput.parse({
      ...baseInput,
      frontmatter: { ...baseFm, summary: ok60 },
    });
    expect(out.frontmatter.summary).toBe(ok60);
  });

  it("rejects a 30-char (too short) non-empty summary", () => {
    expect(() =>
      postUpsertInput.parse({
        ...baseInput,
        frontmatter: { ...baseFm, summary: "x".repeat(30) },
      }),
    ).toThrow();
  });

  it("rejects a 281-char summary", () => {
    expect(() =>
      postUpsertInput.parse({
        ...baseInput,
        frontmatter: { ...baseFm, summary: "x".repeat(281) },
      }),
    ).toThrow();
  });
});

describe("postUpsertInput — keywords", () => {
  it("defaults to []", () => {
    expect(postUpsertInput.parse(baseInput).frontmatter.keywords).toEqual([]);
  });

  it("accepts a non-empty list", () => {
    expect(
      postUpsertInput.parse({
        ...baseInput,
        frontmatter: { ...baseFm, keywords: ["harness", "prompt caching"] },
      }).frontmatter.keywords,
    ).toEqual(["harness", "prompt caching"]);
  });

  it("rejects more than 40 keywords", () => {
    const many = Array.from({ length: 41 }, (_, i) => `k${i}`);
    expect(() =>
      postUpsertInput.parse({ ...baseInput, frontmatter: { ...baseFm, keywords: many } }),
    ).toThrow();
  });
});

describe("postUpsertInput — faq", () => {
  it("accepts a missing faq field (optional)", () => {
    expect(postUpsertInput.parse(baseInput).frontmatter.faq).toBeUndefined();
  });

  it("accepts a valid two-item faq", () => {
    const faq = [
      { question: "Why X?", answer: "Because the answer is at least twenty chars long." },
      { question: "Why Y?", answer: "Because Y too is well over twenty characters long." },
    ];
    const out = postUpsertInput.parse({
      ...baseInput,
      frontmatter: { ...baseFm, faq },
    });
    expect(out.frontmatter.faq).toHaveLength(2);
  });

  it("rejects a question shorter than 5 chars", () => {
    expect(() =>
      postUpsertInput.parse({
        ...baseInput,
        frontmatter: {
          ...baseFm,
          faq: [{ question: "Hi", answer: "x".repeat(20) }],
        },
      }),
    ).toThrow();
  });

  it("rejects an answer shorter than 20 chars", () => {
    expect(() =>
      postUpsertInput.parse({
        ...baseInput,
        frontmatter: {
          ...baseFm,
          faq: [{ question: "Question?", answer: "Short" }],
        },
      }),
    ).toThrow();
  });

  it("rejects more than 20 faq items", () => {
    const many = Array.from({ length: 21 }, (_, i) => ({
      question: `Question ${i}?`,
      answer: "Answer that is at least twenty chars long enough.",
    }));
    expect(() =>
      postUpsertInput.parse({ ...baseInput, frontmatter: { ...baseFm, faq: many } }),
    ).toThrow();
  });
});

describe("postUpsertInput — body default", () => {
  it("defaults body to empty string when missing", () => {
    const out = postUpsertInput.parse({ slug: baseInput.slug, frontmatter: baseFm });
    expect(out.body).toBe("");
  });

  it("preserves body text including a YAML-looking block — sanitisation happens in handler", () => {
    const body = "---\ntitle: pasted\n---\n\nReal text.";
    const out = postUpsertInput.parse({ ...baseInput, body });
    expect(out.body).toBe(body);
  });
});
