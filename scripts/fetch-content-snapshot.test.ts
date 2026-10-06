import { describe, expect, it, vi } from "vitest";
import { fetchExport } from "./fetch-content-snapshot";

const url = new URL("https://example.test/api/v1/export/");
const json = (body: string, status = 200): Response => new Response(body, { status });

describe("fetchExport", () => {
  it("retries a truncated body and returns the next complete one", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json('{"articles":[{"slu'))
      .mockResolvedValueOnce(json('{"count":1}'));
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(fetchExport({ fetch, sleep, log: () => {} }, url, "t")).resolves.toEqual({
      count: 1,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(5_000);
  });

  it("does not retry a 401", async () => {
    const fetch = vi.fn().mockResolvedValue(json("nope", 401));
    const sleep = vi.fn();
    await expect(fetchExport({ fetch, sleep, log: () => {} }, url, "t")).rejects.toThrow(
      /401.*token is wrong/,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("gives up after four attempts on a persistent 502", async () => {
    const fetch = vi.fn().mockImplementation(async () => json("bad gateway", 502));
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(fetchExport({ fetch, sleep, log: () => {} }, url, "t")).rejects.toThrow(
      /gave up after 4/,
    );
    expect(fetch).toHaveBeenCalledTimes(4);
  });
});
