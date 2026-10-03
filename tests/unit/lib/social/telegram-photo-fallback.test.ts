import { afterEach, expect, it, vi } from "vitest";
import { sendMessage } from "~/lib/social/clients/telegram";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const stubTelegram = (photoError: string) => {
  const calls: { method: string; body: Record<string, unknown> }[] = [];
  vi.stubEnv("TELEGRAM_CHANNEL_ID", "@artka");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const method = url.split("/").pop() ?? "";
      calls.push({ method, body: JSON.parse(String(init.body)) });
      return method === "sendPhoto"
        ? Response.json({ ok: false, error_code: 400, description: photoError }, { status: 400 })
        : Response.json({ ok: true, result: { message_id: 7 } });
    }),
  );
  return calls;
};

it("a post whose picture Telegram cannot fetch is still published, as text", async () => {
  const calls = stubTelegram("Bad Request: failed to get HTTP URL content");
  const result = await sendMessage({
    text: "Новая статья",
    mediaUrl: "https://artka.dev/og/not-deployed-yet-ru.png",
  });
  expect(result).toEqual({ ok: true, value: { id: "7", url: "https://t.me/artka/7" } });
  expect(calls.map((call) => call.method)).toEqual(["sendPhoto", "sendMessage"]);
  expect(calls[1]!.body).toMatchObject({ text: "Новая статья" });
});

it("an error that is not about the picture is reported, not retried as text", async () => {
  const calls = stubTelegram("Bad Request: can't parse entities");
  const result = await sendMessage({
    text: "broken *markdown",
    mediaUrl: "https://artka.dev/a.png",
  });
  expect(result.ok).toBe(false);
  expect(calls.map((call) => call.method)).toEqual(["sendPhoto"]);
});
