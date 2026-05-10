import { describe, it, expect } from "vitest";
import { postSchema, siteSchema, projectSchema } from "../../src/lib/content/schemas";

// Translate-check.ts second pass uses postSchema/siteSchema/projectSchema.safeParse
// against parsed YAML frontmatter. These tests verify the schema rejects the failure
// modes that motivated this fix (over-max length on translated EN fields).

describe("posts schema length enforcement", () => {
  const baseValid = {
    title: "ok title",
    description: "x".repeat(150),
    pubDate: new Date("2026-05-10"),
    tags: [],
  };

  it("accepts a valid post frontmatter", () => {
    const result = postSchema.safeParse(baseValid);
    expect(result.success).toBe(true);
  });

  it("rejects description exceeding max (201 — the regression case)", () => {
    const result = postSchema.safeParse({ ...baseValid, description: "x".repeat(201) });
    expect(result.success).toBe(false);
    if (!result.success) {
      const desc = result.error.issues.find((i) => i.path[0] === "description");
      expect(desc).toBeDefined();
    }
  });

  it("rejects summary exceeding max (>280)", () => {
    const result = postSchema.safeParse({ ...baseValid, summary: "x".repeat(281) });
    expect(result.success).toBe(false);
  });

  it("rejects FAQ question exceeding max (>200)", () => {
    const result = postSchema.safeParse({
      ...baseValid,
      faq: [{ question: "x".repeat(201), answer: "y".repeat(50) }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects FAQ answer exceeding max (>2000)", () => {
    const result = postSchema.safeParse({
      ...baseValid,
      faq: [{ question: "valid q?", answer: "y".repeat(2001) }],
    });
    expect(result.success).toBe(false);
  });
});

describe("site schema length enforcement", () => {
  it("rejects description exceeding 200", () => {
    const result = siteSchema.safeParse({
      title: "Home",
      description: "x".repeat(201),
    });
    expect(result.success).toBe(false);
  });
});

describe("projects schema length enforcement", () => {
  const baseValid = {
    title: "Project",
    description: "x".repeat(50),
    role: "Author",
    status: "active" as const,
    pubDate: new Date("2026-05-10"),
  };

  it("accepts valid frontmatter", () => {
    const result = projectSchema.safeParse(baseValid);
    expect(result.success).toBe(true);
  });

  it("rejects role exceeding max (>80)", () => {
    const result = projectSchema.safeParse({ ...baseValid, role: "x".repeat(81) });
    expect(result.success).toBe(false);
  });

  it("rejects description exceeding max (>200)", () => {
    const result = projectSchema.safeParse({ ...baseValid, description: "x".repeat(201) });
    expect(result.success).toBe(false);
  });
});
