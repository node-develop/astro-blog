import { describe, it, expect } from "vitest";
import { postSchema } from "../../src/lib/content/schemas";

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

  it("accepts a post description at the 200-character boundary", () => {
    const result = postSchema.safeParse({ ...baseValid, description: "x".repeat(200) });
    expect(result.success).toBe(true);
  });

  it("rejects a post description exceeding the 200-character maximum", () => {
    const result = postSchema.safeParse({ ...baseValid, description: "x".repeat(201) });
    expect(result.success).toBe(false);
    if (!result.success) {
      const desc = result.error.issues.find((i) => i.path[0] === "description");
      expect(desc).toBeDefined();
    }
  });
});
