import { describe, it, expect, vi, beforeEach } from "vitest";

const createMock = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(function () {
    return {
      messages: { create: createMock },
    };
  }),
}));

import { batchPlaceholders, translateProse, translateStrings } from "./claude";

// Braces: a returned mock would be run by Vitest as the cleanup callback.
beforeEach(() => {
  createMock.mockReset();
});

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

const reply = (value: unknown) => ({ content: [{ type: "text", text: JSON.stringify(value) }] });
const prose = (id: number, length: number) => ({
  id,
  kind: "prose" as const,
  text: "я".repeat(length),
});
const base = { apiKey: "test-key", sourceLocale: "ru", targetLocale: "en" } as const;

describe("batchPlaceholders", () => {
  it("keeps the order, respects the budget and gives an oversized item a batch of its own", () => {
    // 3 characters per estimated token: 1500 characters = 500 tokens.
    const items = [
      prose(0, 1500),
      prose(1, 1500),
      prose(2, 30_000),
      prose(3, 1500),
      prose(4, 1500),
    ];
    const batches = batchPlaceholders(items, 1200);
    expect(batches.map((b) => b.map((p) => p.id))).toEqual([[0, 1], [2], [3, 4]]);
  });

  it("puts everything small into one batch", () => {
    expect(batchPlaceholders([prose(0, 10), prose(1, 10)])).toHaveLength(1);
  });
});

describe("translateProse batching and prompt", () => {
  it("sends one request per batch and joins the results in source order", async () => {
    createMock.mockImplementation(async (body: { messages: { content: string }[] }) => {
      const asked = JSON.parse(body.messages[0]!.content) as { id: number }[];
      return reply(asked.map((p) => ({ id: p.id, text: `T${p.id}` })));
    });
    // 6000 characters is 2000 estimated tokens: two of them exceed the 3000 budget.
    const result = await translateProse({
      ...base,
      placeholders: [prose(0, 6000), prose(1, 6000), prose(2, 6000)],
    });
    expect(createMock).toHaveBeenCalledTimes(3);
    expect(result).toEqual([
      { id: 0, text: "T0" },
      { id: 1, text: "T1" },
      { id: 2, text: "T2" },
    ]);
  });

  it("puts the verbatim rule, a tag pair and a project term into both system prompts", async () => {
    createMock.mockResolvedValueOnce(reply([{ id: 0, text: "x" }]));
    await translateProse({ ...base, placeholders: [prose(0, 5)] });
    createMock.mockResolvedValueOnce(reply({ a: "x" }));
    await translateStrings({ ...base, strings: { a: "я" } });
    for (const call of createMock.mock.calls) {
      const system = call[0]!.system[0]!.text as string;
      expect(system).toContain("already in English");
      expect(system).toContain("Промпт-инжиниринг → Prompt engineering");
      expect(system).toContain("контекстное окно → context window");
    }
  });

  it("re-asks for an id the model left out, then fails loud", async () => {
    createMock
      .mockResolvedValueOnce(reply([{ id: 0, text: "zero" }]))
      .mockResolvedValueOnce(reply([{ id: 1, text: "one" }]));
    const result = await translateProse({
      ...base,
      placeholders: [prose(0, 5), prose(1, 5)],
    });
    expect(result).toEqual([
      { id: 0, text: "zero" },
      { id: 1, text: "one" },
    ]);
    const retry = JSON.parse(createMock.mock.calls[1]![0]!.messages[0].content as string) as {
      id: number;
      issue?: string;
    }[];
    expect(retry.map((p) => p.id)).toEqual([1]);
    expect(retry[0]!.issue).toMatch(/missing/);

    createMock.mockReset();
    createMock.mockResolvedValue(reply([{ id: 0, text: "zero" }]));
    vi.useFakeTimers();
    try {
      const failing = expect(
        translateProse({ ...base, placeholders: [prose(0, 5), prose(1, 5)] }),
      ).rejects.toThrow(/omitted ids 1 after 3 attempts/);
      await vi.runAllTimersAsync();
      await failing;
    } finally {
      vi.useRealTimers();
    }
    expect(createMock).toHaveBeenCalledTimes(3);
  });
});

describe("translateStrings length exhaustion", () => {
  const tooLong = { title: "x".repeat(50) };
  const constraints = { title: { min: 3, max: 20 } };

  it('throws a length_violation with onExhausted: "throw"', async () => {
    createMock.mockResolvedValue(reply(tooLong));
    await expect(
      translateStrings({
        ...base,
        strings: { title: "заголовок" },
        constraints,
        onExhausted: "throw",
      }),
    ).rejects.toMatchObject({
      code: "length_violation",
      violations: [{ key: "title", got: 50, max: 20, kind: "over" }],
    });
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("truncates by default, as the file pipeline always did", async () => {
    createMock.mockResolvedValue(reply(tooLong));
    const result = await translateStrings({
      ...base,
      strings: { title: "заголовок" },
      constraints,
    });
    expect(result.title).toHaveLength(20);
  });
});
