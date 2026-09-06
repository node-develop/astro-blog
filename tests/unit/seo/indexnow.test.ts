import { describe, expect, it, vi } from "vitest";
import {
  buildIndexNowPayload,
  indexNowKeyFromEnv,
  submitIndexNow,
  INDEXNOW_ENDPOINT,
} from "~/lib/seo/indexnow";
import { GET } from "../../../src/pages/[indexnowKey].txt";

const KEY = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";

describe("buildIndexNowPayload", () => {
  it("canonicalises, dedupes and points keyLocation at /<key>.txt on the host", () => {
    const payload = buildIndexNowPayload(
      ["/blog/foo", "https://artka.dev/blog/foo/", "/en/blog/foo/", "https://artka.dev/rss.xml"],
      KEY,
    );
    expect(payload).toEqual({
      host: "artka.dev",
      key: KEY,
      keyLocation: `https://artka.dev/${KEY}.txt`,
      urlList: [
        "https://artka.dev/blog/foo/",
        "https://artka.dev/en/blog/foo/",
        "https://artka.dev/rss.xml",
      ],
    });
  });

  it("fails loud on foreign hosts, invalid keys and empty lists", () => {
    expect(() => buildIndexNowPayload(["https://example.com/x/"], KEY)).toThrow(
      /not on artka\.dev/,
    );
    expect(() => buildIndexNowPayload(["/x/"], "short")).toThrow(/IndexNow key/);
    expect(() => buildIndexNowPayload([], KEY)).toThrow(/at least one URL/);
  });
});

describe("submitIndexNow", () => {
  it("POSTs JSON to api.indexnow.org and treats 200/202 as success", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 202 }));
    const payload = buildIndexNowPayload(["/blog/foo/"], KEY);
    const result = await submitIndexNow(fetchImpl, payload);

    expect(result).toEqual({ ok: true, status: 202, submitted: 1 });
    expect(fetchImpl).toHaveBeenCalledWith(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
    });
  });

  it("reports non-success statuses instead of throwing", async () => {
    const fetchImpl = vi.fn(async () => new Response("bad key", { status: 403 }));
    const result = await submitIndexNow(fetchImpl, buildIndexNowPayload(["/x/"], KEY));
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
  });
});

describe("indexNowKeyFromEnv / key route", () => {
  it("returns null for unset or malformed keys", () => {
    expect(indexNowKeyFromEnv({})).toBeNull();
    expect(indexNowKeyFromEnv({ INDEXNOW_KEY: "" })).toBeNull();
    expect(indexNowKeyFromEnv({ INDEXNOW_KEY: "has space" })).toBeNull();
    expect(indexNowKeyFromEnv({ INDEXNOW_KEY: KEY })).toBe(KEY);
  });

  it("serves the key only at /<key>.txt and 404s everything else", async () => {
    vi.stubEnv("INDEXNOW_KEY", KEY);
    try {
      const hit = await GET({ params: { indexnowKey: KEY } } as never);
      expect(hit.status).toBe(200);
      expect(await hit.text()).toBe(KEY);
      expect(hit.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");

      const miss = await GET({ params: { indexnowKey: "other" } } as never);
      expect(miss.status).toBe(404);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("404s when the key is not configured at all", async () => {
    vi.stubEnv("INDEXNOW_KEY", "");
    try {
      const miss = await GET({ params: { indexnowKey: "anything" } } as never);
      expect(miss.status).toBe(404);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
