import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
  process.env.TELEGRAM_BOT_TOKEN = "111:test";
  process.env.TELEGRAM_CHANNEL_ID = "@artka_blog";
});
afterAll(() => server.close());
beforeEach(() => {
  server.resetHandlers(
    http.post("https://api.telegram.org/bot111:test/sendMessage", () =>
      HttpResponse.json({ ok: true, result: { message_id: 42, chat: { id: -100 } } }),
    ),
    http.post("https://api.telegram.org/bot111:test/sendPhoto", () =>
      HttpResponse.json({ ok: true, result: { message_id: 43, chat: { id: -100 } } }),
    ),
  );
});

describe("sendMessage", () => {
  it("returns message id and t.me URL on success", async () => {
    const { sendMessage } = await import("~/lib/social/clients/telegram");
    const r = await sendMessage({ text: "hello" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.id).toBe("42");
      expect(r.value.url).toBe("https://t.me/artka_blog/42");
    }
  });

  it("sends correct body: chat_id, text, parse_mode, link_preview_options", async () => {
    let capturedBody: unknown = null;
    server.use(
      http.post("https://api.telegram.org/bot111:test/sendMessage", async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ ok: true, result: { message_id: 1, chat: { id: -100 } } });
      }),
    );
    const { sendMessage } = await import("~/lib/social/clients/telegram");
    await sendMessage({ text: "x" });
    const b = capturedBody as Record<string, unknown>;
    expect(b.chat_id).toBe("@artka_blog");
    expect(b.text).toBe("x");
    expect(b.parse_mode).toBe("MarkdownV2");
    expect((b.link_preview_options as Record<string, unknown>).is_disabled).toBe(true);
  });

  it("uses sendPhoto endpoint when mediaUrl provided", async () => {
    const { sendMessage } = await import("~/lib/social/clients/telegram");
    const r = await sendMessage({ text: "hello", mediaUrl: "https://artka.dev/c.jpg" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.id).toBe("43"); // mocked sendPhoto returns message_id 43
    }
  });

  it("returns transport error on Telegram failure response", async () => {
    server.use(
      http.post("https://api.telegram.org/bot111:test/sendMessage", () =>
        HttpResponse.json({ ok: false, description: "chat not found", error_code: 400 }),
      ),
    );
    const { sendMessage } = await import("~/lib/social/clients/telegram");
    const r = await sendMessage({ text: "x" });
    expect(r.ok).toBe(false);
  });

  it("returns policy error on 401", async () => {
    server.use(
      http.post("https://api.telegram.org/bot111:test/sendMessage", () =>
        HttpResponse.json({ ok: false, description: "Unauthorized" }, { status: 401 }),
      ),
    );
    const { sendMessage } = await import("~/lib/social/clients/telegram");
    const r = await sendMessage({ text: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("policy");
  });
});
