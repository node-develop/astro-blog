import { describe, it, expect } from "vitest";
import { ok, err, generationError, transportError, isOk } from "~/lib/social/errors";

describe("Result type", () => {
  it("ok wraps value", () => {
    const r = ok(42);
    expect(r).toEqual({ ok: true, value: 42 });
  });

  it("err wraps error", () => {
    const e = generationError("writer", "x_en", new Error("boom"));
    const r = err(e);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("generation");
  });

  it("transportError marks retryable correctly", () => {
    const e = transportError("li_en", 503, "service unavailable");
    expect(e.retryable).toBe(true);
    const e2 = transportError("li_en", 422, "invalid");
    expect(e2.retryable).toBe(false);
  });

  it("transportError 429 is retryable", () => {
    const e = transportError("x_en", 429, "rate limited");
    expect(e.retryable).toBe(true);
  });

  it("isOk narrows the discriminant", () => {
    const r = ok("hello");
    if (isOk(r)) {
      const v: string = r.value;
      expect(v).toBe("hello");
    }
  });
});
