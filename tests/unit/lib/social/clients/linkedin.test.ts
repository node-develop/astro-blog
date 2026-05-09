import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
  process.env.LINKEDIN_ACCESS_TOKEN = "test-token";
  process.env.LINKEDIN_PERSON_URN = "urn:li:person:abc123";
});
afterAll(() => server.close());
beforeEach(() => {
  server.resetHandlers(
    http.post("https://api.linkedin.com/rest/posts", () => {
      return new HttpResponse(null, {
        status: 201,
        headers: { "x-restli-id": "urn:li:share:123456789" },
      });
    }),
  );
});

describe("postShare", () => {
  it("returns post id and feed URL on success", async () => {
    const { postShare } = await import("~/lib/social/clients/linkedin");
    const r = await postShare({ text: "hello world" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.id).toBe("urn:li:share:123456789");
      expect(r.value.url).toBe("https://www.linkedin.com/feed/update/urn:li:share:123456789/");
    }
  });

  it("sends correct headers + body shape", async () => {
    let captured: { headers: Headers; body: unknown } | null = null;
    server.use(
      http.post("https://api.linkedin.com/rest/posts", async ({ request }) => {
        captured = { headers: request.headers, body: await request.json() };
        return new HttpResponse(null, {
          status: 201,
          headers: { "x-restli-id": "urn:li:share:1" },
        });
      }),
    );
    const { postShare } = await import("~/lib/social/clients/linkedin");
    await postShare({ text: "x" });
    expect(captured).not.toBeNull();
    expect(captured!.headers.get("LinkedIn-Version")).toBe("202601");
    expect(captured!.headers.get("Authorization")).toBe("Bearer test-token");
    const body = captured!.body as Record<string, unknown>;
    expect(body.author).toBe("urn:li:person:abc123");
    expect(body.commentary).toBe("x");
    expect(body.lifecycleState).toBe("PUBLISHED");
    expect(body.visibility).toBe("PUBLIC");
  });

  it("returns transport error on 5xx", async () => {
    server.use(
      http.post("https://api.linkedin.com/rest/posts", () =>
        HttpResponse.json({ error: "down" }, { status: 503 }),
      ),
    );
    const { postShare } = await import("~/lib/social/clients/linkedin");
    const r = await postShare({ text: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok && r.error.kind === "transport") {
      expect(r.error.status).toBe(503);
      expect(r.error.retryable).toBe(true);
    }
  });

  it("returns policy error on 401", async () => {
    server.use(
      http.post("https://api.linkedin.com/rest/posts", () =>
        HttpResponse.json({ error: "auth" }, { status: 401 }),
      ),
    );
    const { postShare } = await import("~/lib/social/clients/linkedin");
    const r = await postShare({ text: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("policy");
  });

  it("returns policy error if x-restli-id header missing", async () => {
    server.use(
      http.post(
        "https://api.linkedin.com/rest/posts",
        () => new HttpResponse(null, { status: 201 }),
      ),
    );
    const { postShare } = await import("~/lib/social/clients/linkedin");
    const r = await postShare({ text: "x" });
    expect(r.ok).toBe(false);
  });
});
