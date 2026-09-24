import { describe, expect, it } from "vitest";
import { safeJsonLd } from "~/lib/seo/json-ld";

describe("safeJsonLd", () => {
  it("escapes < > & to JSON-string unicode", () => {
    expect(safeJsonLd({ x: "<a>&b</a>" })).toBe('{"x":"\\u003ca\\u003e\\u0026b\\u003c/a\\u003e"}');
  });

  it("preserves nested structures", () => {
    expect(safeJsonLd({ a: [1, 2], b: { c: "d" } })).toBe('{"a":[1,2],"b":{"c":"d"}}');
  });
});
