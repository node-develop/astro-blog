import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { buildEmail, createRateLimiter, handleFeedback, validateFeedback } from "./feedback.mjs";

const req = (body, headers = {}) =>
  Object.assign(Readable.from([Buffer.from(typeof body === "string" ? body : JSON.stringify(body))]), {
    headers: { host: "calc.artka.dev", "content-type": "application/json", origin: "https://calc.artka.dev", ...headers },
    socket: { remoteAddress: "1.2.3.4" },
  });
const res = () => {
  const r = { status: 0, body: "", headersSent: false };
  r.writeHead = (s) => ((r.status = s), (r.headersSent = true), r);
  r.end = (b) => ((r.body = b ?? ""), r);
  return r;
};
const deps = (over = {}) => ({
  env: { RESEND_API_KEY: "re_test" },
  fetch: vi.fn(async () => ({ ok: true, status: 200, text: async () => "" })),
  limiter: createRateLimiter({ limit: 5, windowMs: 60_000 }),
  globalLimiter: createRateLimiter({ limit: 100, windowMs: 60_000 }),
  log: () => {},
  ...over,
});

describe("validateFeedback", () => {
  it("accepts a message and trims fields", () => {
    const v = validateFeedback({ message: "  hi there ", name: " Artem ", lang: "en" });
    expect(v).toEqual({ ok: true, value: { message: "hi there", name: "Artem", contact: "", link: "", lang: "en" } });
  });
  it("rejects empty, oversized and bad links; flags the honeypot as spam", () => {
    expect(validateFeedback({ message: "" }).error).toBe("too_short");
    expect(validateFeedback({ message: "x".repeat(3001) }).error).toBe("too_long");
    expect(validateFeedback({ message: "hello", link: "javascript:alert(1)" }).error).toBe("bad_link");
    expect(validateFeedback({ message: "hello", website: "http://spam" })).toEqual({ ok: true, spam: true });
  });
});

describe("createRateLimiter", () => {
  it("allows up to the limit per window", () => {
    const hit = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect([hit("a", 0), hit("a", 10), hit("a", 20), hit("b", 20), hit("a", 1500)]).toEqual([true, true, false, true, true]);
  });
});

describe("buildEmail", () => {
  it("escapes HTML and sets reply-to only for an email contact", () => {
    const e = buildEmail({ message: "<b>x</b>", name: "", contact: "u@x.io", link: "", lang: "ru" }, { to: "a@artka.dev", from: "f", host: "h" });
    expect(e.html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(e.reply_to).toBe("u@x.io");
    expect(buildEmail({ message: "m", name: "", contact: "@tg", link: "", lang: "ru" }, { to: "t", from: "f", host: "h" }).reply_to).toBeUndefined();
  });
});

describe("handleFeedback", () => {
  it("sends through Resend to a@artka.dev", async () => {
    const d = deps();
    const r = res();
    await handleFeedback(req({ message: "Отличный калькулятор" }), r, d);
    expect(r.status).toBe(200);
    const [url, init] = d.fetch.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(JSON.parse(init.body).to).toEqual(["a@artka.dev"]);
  });
  it("answers 503 without an API key, 403 from another site, and never sends spam", async () => {
    const r1 = res();
    await handleFeedback(req({ message: "hello" }), r1, deps({ env: {} }));
    expect(r1.status).toBe(503);
    const r2 = res();
    await handleFeedback(req({ message: "hello" }, { origin: "https://evil.example" }), r2, deps());
    expect(r2.status).toBe(403);
    const d = deps();
    const r3 = res();
    await handleFeedback(req({ message: "hello", website: "x" }), r3, d);
    expect(r3.status).toBe(200);
    expect(d.fetch).not.toHaveBeenCalled();
  });
});
