import { describe, expect, it } from "vitest";
import { person } from "~/lib/seo/person";

describe("PersonProfile — expert fields (Plan 2 additions)", () => {
  it("declares notableWork as a non-empty array of {title, url, description}", () => {
    expect(Array.isArray(person.notableWork)).toBe(true);
    expect(person.notableWork.length).toBeGreaterThanOrEqual(3);
    for (const item of person.notableWork) {
      expect(typeof item.title).toBe("string");
      expect(item.title.length).toBeGreaterThan(2);
      expect(item.url).toMatch(/^https?:\/\//);
      expect(item.description.length).toBeGreaterThan(10);
    }
  });

  it("declares yearsExperience as a positive integer", () => {
    expect(Number.isInteger(person.yearsExperience)).toBe(true);
    expect(person.yearsExperience).toBeGreaterThanOrEqual(1);
  });

  it("declares techStack with ≥ 5 entries", () => {
    expect(Array.isArray(person.techStack)).toBe(true);
    expect(person.techStack.length).toBeGreaterThanOrEqual(5);
  });

  it("declares expertiseAreas as 3–5 cluster labels", () => {
    expect(person.expertiseAreas.length).toBeGreaterThanOrEqual(3);
    expect(person.expertiseAreas.length).toBeLessThanOrEqual(5);
  });

  it("preserves all Plan-1 fields untouched", () => {
    expect(person.name).toBe("Артём Кашута");
    expect(person.email).toMatch(/@/);
    expect(person.url).toBe("https://artka.dev/about");
  });
});
