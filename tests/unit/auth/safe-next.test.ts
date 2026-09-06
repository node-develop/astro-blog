import { describe, expect, it } from "vitest";
import { safeNext } from "~/lib/auth/safe-next";

describe("safeNext", () => {
  describe("accepts same-origin paths", () => {
    it.each([
      ["/admin", "/admin"],
      ["/admin/posts", "/admin/posts"],
      ["/admin/posts/new", "/admin/posts/new"],
      ["/blog", "/blog"],
      ["/", "/"],
      ["/admin?tab=drafts", "/admin?tab=drafts"],
      ["/admin#section", "/admin#section"],
      ["/admin/posts?tab=drafts&order=desc", "/admin/posts?tab=drafts&order=desc"],
    ])("%s → %s", (input, expected) => {
      expect(safeNext(input)).toBe(expected);
    });
  });

  describe("rejects open-redirect payloads", () => {
    const FALLBACK = "/admin/";
    it.each([
      ["null", null],
      ["undefined", undefined],
      ["empty string", ""],
      ["whitespace", "   "],
      ["absolute https URL", "https://evil.com"],
      ["absolute http URL", "http://evil.com/admin"],
      ["protocol-relative", "//evil.com"],
      ["protocol-relative with path", "//evil.com/admin"],
      ["backslash bypass", "/\\evil.com"],
      ["URL-encoded backslash bypass (lower)", "/%5cevil.com"],
      ["URL-encoded backslash bypass (upper)", "/%5Cevil.com"],
      ["javascript: scheme", "javascript:alert(1)"],
      ["data: scheme", "data:text/html,<script>alert(1)</script>"],
      ["bare relative", "admin"],
      ["dot-relative", "./admin"],
      ["double-dot-relative", "../admin"],
    ])("%s → fallback", (_label, input) => {
      expect(safeNext(input)).toBe(FALLBACK);
    });
  });

  it("respects a custom fallback", () => {
    expect(safeNext(null, "/")).toBe("/");
    expect(safeNext("https://evil.com", "/login")).toBe("/login");
    expect(safeNext("/admin", "/")).toBe("/admin");
  });
});
