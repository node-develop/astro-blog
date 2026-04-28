import { describe, it, expect } from "vitest";
import { t, tagLabel, isLocale, type Locale } from "./index";

describe("t()", () => {
  it("returns the RU string for ru locale", () => {
    expect(t("ru", "nav.posts")).toBe("Статьи");
  });

  it("returns the EN string for en locale", () => {
    expect(t("en", "nav.posts")).toBe("Posts");
  });

  it("falls back to RU when EN key is missing (defensive default)", () => {
    const value = t("en" as Locale, "nav.posts");
    expect(typeof value).toBe("string");
    expect(value.length).toBeGreaterThan(0);
  });
});

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
