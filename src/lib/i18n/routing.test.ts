import { describe, it, expect } from "vitest";
import { getCounterpart, getLocaleFromPath, stripLocalePrefix } from "./routing";

describe("getLocaleFromPath", () => {
  it("returns 'en' for /en/* paths", () => {
    expect(getLocaleFromPath("/en/")).toBe("en");
    expect(getLocaleFromPath("/en/blog/foo")).toBe("en");
    expect(getLocaleFromPath("/en")).toBe("en");
  });
  it("returns 'ru' for everything else", () => {
    expect(getLocaleFromPath("/")).toBe("ru");
    expect(getLocaleFromPath("/blog/foo")).toBe("ru");
    expect(getLocaleFromPath("/about")).toBe("ru");
  });
  it("does not treat /endpoint or /enroll as en-prefixed", () => {
    expect(getLocaleFromPath("/endpoint")).toBe("ru");
    expect(getLocaleFromPath("/enroll")).toBe("ru");
  });
});

describe("stripLocalePrefix", () => {
  it("removes /en prefix", () => {
    expect(stripLocalePrefix("/en/blog/foo")).toBe("/blog/foo");
    expect(stripLocalePrefix("/en/")).toBe("/");
    expect(stripLocalePrefix("/en")).toBe("/");
  });
  it("returns RU paths unchanged", () => {
    expect(stripLocalePrefix("/blog/foo")).toBe("/blog/foo");
    expect(stripLocalePrefix("/")).toBe("/");
  });
  it("does not strip /endpoint or /enroll", () => {
    expect(stripLocalePrefix("/endpoint")).toBe("/endpoint");
    expect(stripLocalePrefix("/enroll")).toBe("/enroll");
  });
});

describe("getCounterpart", () => {
  it("RU root → /en/", () => {
    expect(getCounterpart("/", "ru")).toBe("/en/");
  });
  it("EN root → /", () => {
    expect(getCounterpart("/en/", "en")).toBe("/");
    expect(getCounterpart("/en", "en")).toBe("/");
  });
  it("RU article → /en/<same>", () => {
    expect(getCounterpart("/blog/01-introduction", "ru")).toBe("/en/blog/01-introduction");
  });
  it("EN article → RU equivalent", () => {
    expect(getCounterpart("/en/blog/01-introduction", "en")).toBe("/blog/01-introduction");
  });
  it("preserves trailing slash", () => {
    expect(getCounterpart("/blog/", "ru")).toBe("/en/blog/");
  });
});
