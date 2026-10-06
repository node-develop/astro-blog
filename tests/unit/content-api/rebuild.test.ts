import { describe, expect, it, vi } from "vitest";
import { fetchWithDeadline, requestRebuild } from "../../../src/lib/content-api/rebuild";

const env = { GITHUB_PAT: "pat", GITHUB_REPO_OWNER: "owner", GITHUB_REPO_NAME: "repo" };
const answer = (status: number) => vi.fn<typeof fetch>(async () => new Response(null, { status }));

describe("requestRebuild", () => {
  it("sends the content-publish event the workflow listens for", async () => {
    const fetchImpl = answer(204);
    await requestRebuild("batch-1", { env, fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.github.com/repos/owner/repo/dispatches");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer pat");
    expect(JSON.parse(init?.body as string)).toEqual({
      event_type: "content-publish",
      client_payload: { batchKey: "batch-1" },
    });
  });

  it("does not call GitHub when it is not configured", async () => {
    const fetchImpl = answer(204);
    await expect(
      requestRebuild("b", { env: { ...env, GITHUB_PAT: undefined }, fetchImpl }),
    ).rejects.toMatchObject({ status: 503, code: "publisher_not_configured" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("never surfaces a GitHub 403 as a 403: the worker would fail the job for good", async () => {
    await expect(requestRebuild("b", { env, fetchImpl: answer(403) })).rejects.toMatchObject({
      status: 502,
      code: "rebuild_rejected",
    });
  });

  it("treats any answer but 204 as a failure and a rate limit as transient", async () => {
    await expect(requestRebuild("b", { env, fetchImpl: answer(200) })).rejects.toMatchObject({
      status: 502,
    });
    await expect(requestRebuild("b", { env, fetchImpl: answer(429) })).rejects.toMatchObject({
      status: 503,
      code: "rebuild_unavailable",
    });
    await expect(requestRebuild("b", { env, fetchImpl: answer(502) })).rejects.toMatchObject({
      status: 503,
      code: "rebuild_unavailable",
    });
  });
});

describe("GitHub request deadline", () => {
  it("abandons a request that GitHub never answers instead of waiting for it", async () => {
    // A server that accepts the request and then stays silent until aborted.
    const silent: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
      });
    await expect(fetchWithDeadline(20, silent)("https://api.github.com/x")).rejects.toMatchObject({
      name: "TimeoutError",
    });
  });

  it("still honours a signal the caller passed", async () => {
    const caller = new AbortController();
    const silent: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted by caller")));
      });
    const pending = fetchWithDeadline(60_000, silent)("https://api.github.com/x", {
      signal: caller.signal,
    });
    caller.abort();
    await expect(pending).rejects.toThrow("aborted by caller");
  });
});
