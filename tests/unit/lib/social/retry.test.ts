import { describe, it, expect, vi } from "vitest";
import { withRetry } from "~/lib/social/retry";
import { ok, err, transportError } from "~/lib/social/errors";

describe("transportError retryable", () => {
  it.each([
    [503, true],
    [500, true],
    [429, true],
    [422, false],
    [401, false],
  ])("status %i → retryable %s", (status, retryable) => {
    expect(transportError("x_en", status, "body").retryable).toBe(retryable);
  });
});

describe("withRetry", () => {
  it("returns ok on first success", async () => {
    const fn = vi.fn().mockResolvedValue(ok(42));
    const r = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 });
    expect(r).toEqual(ok(42));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on retryable error and eventually succeeds", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce(err(transportError("x_en", 503, "down")))
      .mockResolvedValueOnce(err(transportError("x_en", 503, "down")))
      .mockResolvedValueOnce(ok("ok"));
    const r = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 });
    expect(r).toEqual(ok("ok"));
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-retryable error", async () => {
    const fn = vi.fn().mockResolvedValue(err(transportError("x_en", 422, "bad input")));
    const r = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 });
    expect(r.ok).toBe(false);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after maxAttempts", async () => {
    const fn = vi.fn().mockResolvedValue(err(transportError("x_en", 503, "down")));
    const r = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 });
    expect(r.ok).toBe(false);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
