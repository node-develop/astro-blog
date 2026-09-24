import { describe, it, expect } from "vitest";
import { tagLabel, isLocale } from "./index";

describe("tagLabel()", () => {
  it("returns localized label for known slug", () => {
    expect(tagLabel("en", "claude-code")).toBe("Claude Code");
    expect(tagLabel("ru", "guide")).toBe("Гайд");
  });
  it("returns the slug as fallback for unknown tags", () => {
    expect(tagLabel("en", "unknown-tag")).toBe("unknown-tag");
  });
});

describe("isLocale()", () => {
  it("accepts ru and en", () => {
    expect(isLocale("ru")).toBe(true);
    expect(isLocale("en")).toBe(true);
  });
  it("rejects everything else", () => {
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale(42)).toBe(false);
  });
});
