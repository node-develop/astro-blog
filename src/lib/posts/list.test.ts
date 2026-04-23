import { describe, it, expect } from "vitest";
import { parseSlugOrder } from "./list";

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
