import { describe, it, expect, vi, beforeEach } from "vitest";

const createMock = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(function () {
    return {
      messages: { create: createMock },
    };
  }),
}));

import { translateProse, translateStrings } from "./claude";

beforeEach(() => createMock.mockReset());

describe("translateProse", () => {
  it("sends placeholders and returns translated array", async () => {
    createMock.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify([
            { id: 0, text: "Heading One" },
            { id: 1, text: "Translated paragraph." },
          ]),
        },
      ],
    });
    const result = await translateProse({
      apiKey: "test-key",
      sourceLocale: "ru",
      targetLocale: "en",
      placeholders: [
        { id: 0, text: "Заголовок один", kind: "prose" },
        { id: 1, text: "Переведённый параграф.", kind: "prose" },
      ],
    });
    expect(result).toEqual([
      { id: 0, text: "Heading One" },
      { id: 1, text: "Translated paragraph." },
    ]);
    expect(createMock).toHaveBeenCalledOnce();

    const call = createMock.mock.calls[0]![0]!;
    expect(call.model).toBe("claude-sonnet-5");
    expect(call.temperature).toBe(0);
    // System prompt should be an array with cache_control
    expect(Array.isArray(call.system)).toBe(true);

    expect(call.system[0]!).toMatchObject({ type: "text", cache_control: { type: "ephemeral" } });
  });

  it("retries on transient failure (3 attempts) then throws", async () => {
    createMock
      .mockRejectedValueOnce(new Error("rate limit"))
      .mockRejectedValueOnce(new Error("rate limit"))
      .mockRejectedValueOnce(new Error("rate limit"));
    await expect(
      translateProse({
        apiKey: "test-key",
        sourceLocale: "ru",
        targetLocale: "en",
        placeholders: [{ id: 0, text: "x", kind: "prose" }],
      }),
    ).rejects.toThrow("rate limit");
    expect(createMock).toHaveBeenCalledTimes(3);
  });

  it("returns empty array when input is empty (no API call)", async () => {
    const result = await translateProse({
      apiKey: "test-key",
      sourceLocale: "ru",
      targetLocale: "en",
      placeholders: [],
    });
    expect(result).toEqual([]);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("retries with feedback when bold markers are unbalanced and resolves on second attempt", async () => {
    createMock
      .mockResolvedValueOnce({
        content: [
          {
            type: "text",
            text: JSON.stringify([
              { id: 0, text: "Heading One" },
              { id: 1, text: '**Each rule answers "what error." If not.' }, // missing closing **
            ]),
          },
        ],
      })
      .mockResolvedValueOnce({
        content: [
          {
            type: "text",
            text: JSON.stringify([{ id: 1, text: '**Each rule answers "what error."** If not.' }]),
          },
        ],
      });

    const result = await translateProse({
      apiKey: "test-key",
      sourceLocale: "ru",
      targetLocale: "en",
      placeholders: [
        { id: 0, text: "Заголовок один", kind: "prose" },
        {
          id: 1,
          text: "**Каждое правило отвечает на «X».** Если не отвечает.",
          kind: "prose",
        },
      ],
    });

    expect(result).toEqual([
      { id: 0, text: "Heading One" },
      { id: 1, text: '**Each rule answers "what error."** If not.' },
    ]);
    expect(createMock).toHaveBeenCalledTimes(2);

    // Retry payload should contain only the failing id, with an issue field.
    const retryContent = createMock.mock.calls[1]![0]!.messages[0].content as string;
    const retryPayload = JSON.parse(retryContent) as Array<{ id: number; issue?: string }>;
    expect(retryPayload).toHaveLength(1);
    expect(retryPayload[0]!.id).toBe(1);
    expect(retryPayload[0]!.issue).toMatch(/'\*\*' markers/);
  });

  it("throws fail-loud after MAX_RETRIES if structural mismatch persists", async () => {
    createMock.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify([{ id: 0, text: "**bold sentence." }]),
        },
      ],
    });

    await expect(
      translateProse({
        apiKey: "test-key",
        sourceLocale: "ru",
        targetLocale: "en",
        placeholders: [{ id: 0, text: "**жирная фраза.**", kind: "prose" }],
      }),
    ).rejects.toThrow(/unbalanced markdown markers after 3 attempts/);

    expect(createMock).toHaveBeenCalledTimes(3);
  });
});

describe("translateStrings", () => {
  it("translates a key-value JSON object", async () => {
    createMock.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            "nav.posts": "Posts",
            "nav.about": "About",
          }),
        },
      ],
    });
    const result = await translateStrings({
      apiKey: "test-key",
      sourceLocale: "ru",
      targetLocale: "en",
      strings: { "nav.posts": "Статьи", "nav.about": "Обо мне" },
    });
    expect(result).toEqual({ "nav.posts": "Posts", "nav.about": "About" });
  });

  it("returns empty object when input is empty (no API call)", async () => {
    const result = await translateStrings({
      apiKey: "test-key",
      sourceLocale: "ru",
      targetLocale: "en",
      strings: {},
    });
    expect(result).toEqual({});
    expect(createMock).not.toHaveBeenCalled();
  });
});
