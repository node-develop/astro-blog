import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("vitest runs", () => {
    expect(1 + 1).toBe(2);
  });

  it("TextEncoder/URL globals available (Node runtime)", () => {
    expect(typeof TextEncoder).toBe("function");
    expect(new URL("https://example.com/a").pathname).toBe("/a");
  });
});
