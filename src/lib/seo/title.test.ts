import { describe, expect, it } from "vitest";
import { brandedTitle, lessonTitle, SITE_BRAND, TITLE_BUDGET } from "./title";

const SUFFIX = ` | ${SITE_BRAND}`;
const ofLength = (length: number): string => "a".repeat(length);

describe("brandedTitle", () => {
  it("appends the brand while the result still fits the budget", () => {
    const title = ofLength(TITLE_BUDGET - SUFFIX.length);
    expect(brandedTitle(title)).toBe(`${title}${SUFFIX}`);
    expect(brandedTitle(title)).toHaveLength(TITLE_BUDGET);
  });

  it("drops the brand, not the words, one character past the budget", () => {
    const title = ofLength(TITLE_BUDGET - SUFFIX.length + 1);
    expect(brandedTitle(title)).toBe(title);
  });

  it("never repeats a brand the title already names", () => {
    expect(brandedTitle(`${SITE_BRAND} — блог`)).toBe(`${SITE_BRAND} — блог`);
  });
});

describe("lessonTitle", () => {
  it("adds the course name only while both fit the budget", () => {
    const course = "Claude Code Guide";
    const fits = ofLength(TITLE_BUDGET - ` — ${course}`.length);
    expect(lessonTitle(fits, course)).toBe(`${fits} — ${course}`);
    expect(lessonTitle(`${fits}a`, course)).toBe(`${fits}a`);
  });
});
