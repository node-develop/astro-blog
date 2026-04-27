import { describe, it, expect, vi, beforeEach } from "vitest";

const createMock = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: createMock },
  })),
}));

import { translateProse, translateStrings } from "./claude-translate";

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
    expect(call.model).toBe("claude-haiku-4-5-20251001");
    expect(call.temperature).toBe(0);
    // System prompt should be an array with cache_control
    expect(Array.isArray(call.system)).toBe(true);

    expect(call.system[0]!).toMatchObject({ type: "text", cache_control: { type: "ephemeral" } });
  });

  it("translates mermaid placeholders (kind passed through to prompt)", async () => {
    createMock.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify([{ id: 0, text: "flowchart LR\n  A[Start] --> B[End]" }]),
        },
      ],
    });
    const result = await translateProse({
      apiKey: "test-key",
      sourceLocale: "ru",
      targetLocale: "en",
      placeholders: [{ id: 0, text: "flowchart LR\n  A[Начало] --> B[Конец]", kind: "mermaid" }],
    });

    expect(result[0]!.text).toContain("flowchart LR");

    expect(result[0]!.text).toContain("[Start]");
    // Verify the user message included the kind field

    const userPayload = createMock.mock.calls[0]![0]!.messages[0].content;
    expect(userPayload).toContain("mermaid");
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
