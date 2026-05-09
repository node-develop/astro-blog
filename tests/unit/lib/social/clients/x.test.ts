import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

const server = setupServer(
  http.post("https://api.twitter.com/2/tweets", async ({ request }) => {
    const body = (await request.json()) as {
      text: string;
      reply?: { in_reply_to_tweet_id: string };
    };
    return HttpResponse.json({
      data: { id: `id_${Math.random().toString(36).slice(2, 8)}`, text: body.text },
    });
  }),
);

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
  process.env.X_OAUTH_TOKEN = "test-token";
  process.env.X_HANDLE = "artka";
});
afterAll(() => server.close());
beforeEach(() =>
  server.resetHandlers(
    http.post("https://api.twitter.com/2/tweets", async ({ request }) => {
      const body = (await request.json()) as { text: string };
      return HttpResponse.json({
        data: { id: `id_${Math.random().toString(36).slice(2, 8)}`, text: body.text },
      });
    }),
  ),
);

describe("postTweet", () => {
  it("returns tweet id and url on success", async () => {
    const { postTweet } = await import("~/lib/social/clients/x");
    const r = await postTweet({ text: "hello" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.id).toMatch(/^id_/);
      expect(r.value.url).toBe(`https://x.com/artka/status/${r.value.id}`);
    }
  });

  it("returns transport error on 5xx", async () => {
    server.use(
      http.post("https://api.twitter.com/2/tweets", () =>
        HttpResponse.json({ error: "down" }, { status: 503 }),
      ),
    );
    const { postTweet } = await import("~/lib/social/clients/x");
    const r = await postTweet({ text: "hello" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("transport");
      if (r.error.kind === "transport") {
        expect(r.error.status).toBe(503);
        expect(r.error.retryable).toBe(true);
      }
    }
  });

  it("returns policy error on 401", async () => {
    server.use(
      http.post("https://api.twitter.com/2/tweets", () =>
        HttpResponse.json({ error: "auth" }, { status: 401 }),
      ),
    );
    const { postTweet } = await import("~/lib/social/clients/x");
    const r = await postTweet({ text: "hello" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("policy");
  });
});

describe("postThread", () => {
  it("posts sequentially and returns first tweet id+url", async () => {
    const { postThread } = await import("~/lib/social/clients/x");
    const r = await postThread(["t1", "t2", "t3"]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.id).toMatch(/^id_/);
      expect(r.value.url).toContain("/artka/status/");
    }
  }, 10000);

  it("returns error on empty thread", async () => {
    const { postThread } = await import("~/lib/social/clients/x");
    const r = await postThread([]);
    expect(r.ok).toBe(false);
  });
});
