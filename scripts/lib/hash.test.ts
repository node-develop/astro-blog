import { describe, it, expect } from "vitest";
import { sha256 } from "./hash";

describe("sha256", () => {
  it("returns a 64-char hex string", () => {
    const h = sha256("hello");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same input", () => {
    expect(sha256("foo")).toBe(sha256("foo"));
  });

  it("returns different hashes for different inputs", () => {
    expect(sha256("a")).not.toBe(sha256("b"));
  });

  it("matches the well-known sha256 of 'hello' (UTF-8)", () => {
    expect(sha256("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });
});
