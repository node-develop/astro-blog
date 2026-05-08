import { describe, expect, it } from "vitest";
import { person } from "~/lib/seo/person";

describe("PersonProfile — expert fields (Plan 2 additions)", () => {
  it("declares notableWork as a non-empty array of {title, url, description} with unique URLs", () => {
    expect(Array.isArray(person.notableWork)).toBe(true);
    expect(person.notableWork.length).toBeGreaterThanOrEqual(2);
    for (const item of person.notableWork) {
      expect(typeof item.title).toBe("string");
      expect(item.title.length).toBeGreaterThan(2);
      expect(item.url).toMatch(/^https?:\/\//);
      expect(item.description.length).toBeGreaterThan(10);
    }
    const urls = person.notableWork.map((w) => w.url);
    expect(new Set(urls).size).toBe(urls.length);
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

  it("identifies the author with primary name + cyrillic alternateName", () => {
    expect(person.name).toBe("Artyom Kashuta");
    expect(person.alternateName).toBe("Артём Кашута");
    expect(person.email).toMatch(/@/);
    expect(person.url).toBe("https://artka.dev/about");
  });

  it("declares a non-empty sameAs array of public profile URLs", () => {
    expect(Array.isArray(person.sameAs)).toBe(true);
    expect(person.sameAs.length).toBeGreaterThanOrEqual(3);
    for (const url of person.sameAs) {
      expect(url).toMatch(/^https?:\/\//);
    }
  });
});
