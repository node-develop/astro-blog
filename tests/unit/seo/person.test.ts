import { describe, expect, it } from "vitest";
import { person } from "~/lib/seo/person";
import { safeJsonLd } from "~/lib/seo/json-ld";

describe("person source of truth", () => {
  it("exposes required fields", () => {
    expect(person.name).toBe("Артём Кашута");
    expect(person.url).toBe("https://artka.dev/about");
    expect(person.image).toMatch(/^https?:\/\//);
    expect(person.jobTitle).toBeTruthy();
    expect(person.description.length).toBeGreaterThan(40);
    expect(Array.isArray(person.knowsAbout)).toBe(true);
    expect(person.knowsAbout.length).toBeGreaterThanOrEqual(3);
    expect(Array.isArray(person.sameAs)).toBe(true);
    expect(person.email).toMatch(/@/);
  });
});

describe("safeJsonLd", () => {
  it("escapes < > & to JSON-string unicode", () => {
    expect(safeJsonLd({ x: "<a>&b</a>" })).toBe('{"x":"\\u003ca\\u003e\\u0026b\\u003c/a\\u003e"}');
  });

  it("preserves nested structures", () => {
    expect(safeJsonLd({ a: [1, 2], b: { c: "d" } })).toBe('{"a":[1,2],"b":{"c":"d"}}');
  });
});
