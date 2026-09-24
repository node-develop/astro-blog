import { describe, it, expect, vi, afterEach } from "vitest";
import { writeXEn } from "~/lib/social/writers/x-en";
import { writeLiEn } from "~/lib/social/writers/linkedin-en";
import { writeTgRu } from "~/lib/social/writers/telegram-ru";
import { editXEn } from "~/lib/social/editors/x-en";
import { editLiEn } from "~/lib/social/editors/linkedin-en";
import { editTgRu } from "~/lib/social/editors/telegram-ru";
import { runCritic, hasBlockAnnotations } from "~/lib/social/critic";
import type { Article, Draft } from "~/lib/social/types";

const create = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(function () {
    return { messages: { create } };
  }),
}));

afterEach(() => {
  create.mockReset();
});

/** Builds a fake Anthropic `messages.create` response containing a single tool_use block. */
const toolUseResponse = (name: string, input: unknown) => ({
  id: "msg_test",
  type: "message",
  role: "assistant",
  model: "test",
  content: [{ type: "tool_use", id: "toolu_test", name, input }],
  stop_reason: "tool_use",
  usage: { input_tokens: 100, output_tokens: 50 },
});

/** A response with no tool_use block — the "model refused the tool" case. */
const textOnlyResponse = () => ({
  id: "msg_test",
  type: "message",
  role: "assistant",
  model: "test",
  content: [{ type: "text", text: "sorry, I cannot do that" }],
  stop_reason: "end_turn",
  usage: { input_tokens: 100, output_tokens: 10 },
});

const article: Article = {
  collection: "posts",
  slug: "multi-agent-postgres",
  title: "Postgres outbox в роли очереди",
  summary: "TL;DR: SKIP LOCKED + 5 таблиц = простая очередь без Redis.",
  body: "Three weeks ago I started building...",
  tags: ["postgres", "outbox"],
  pubDate: new Date("2026-05-09"),
  cover: { src: "https://artka.dev/cover.jpg", alt: "diagram" },
  lang: "ru",
  sourceUrl: "https://artka.dev/blog/multi-agent-postgres",
  hasEnTwin: true,
};

const singleDraft: Draft = { body: "Original draft.", mediaUrl: null };

type Row = {
  label: string;
  toolName: "emit_draft" | "emit_edited";
  validInput: unknown;
  invalidInput: unknown;
  run: () => Promise<{ ok: boolean }>;
};

const rows: Row[] = [
  {
    label: "writeXEn",
    toolName: "emit_draft",
    validInput: { type: "single", body: "a".repeat(50) },
    invalidInput: { type: "single", body: "a".repeat(300) }, // >270 chars
    run: () => writeXEn({ article }),
  },
  {
    label: "writeLiEn",
    toolName: "emit_draft",
    validInput: { body: "a".repeat(1500) },
    invalidInput: { body: "a".repeat(500) }, // below 1300 min
    run: () => writeLiEn({ article }),
  },
  {
    label: "writeTgRu",
    toolName: "emit_draft",
    validInput: { body: "a".repeat(250) },
    invalidInput: { body: "a".repeat(50) }, // below 200 min
    run: () => writeTgRu({ article }),
  },
  {
    label: "editXEn",
    toolName: "emit_edited",
    validInput: { type: "single", body: "a".repeat(50) },
    invalidInput: { type: "single", body: "a".repeat(300) }, // >270 chars
    run: () => editXEn(article, singleDraft),
  },
  {
    label: "editLiEn",
    toolName: "emit_edited",
    validInput: { body: "a".repeat(1500) },
    invalidInput: { body: "a".repeat(500) }, // below 1300 min
    run: () => editLiEn(article, singleDraft),
  },
  {
    label: "editTgRu",
    toolName: "emit_edited",
    validInput: { body: "a".repeat(250) },
    invalidInput: { body: "a".repeat(50) }, // below 200 min
    run: () => editTgRu(article, singleDraft),
  },
];

describe("writer/editor adapters — shared contract", () => {
  it.each(rows)("$label: valid tool_use input → ok", async ({ toolName, validInput, run }) => {
    create.mockResolvedValueOnce(toolUseResponse(toolName, validInput));
    const r = await run();
    expect(r.ok).toBe(true);
  });

  it.each(rows)("$label: no tool_use block → generation error", async ({ run }) => {
    create.mockResolvedValueOnce(textOnlyResponse());
    const r = await run();
    expect(r.ok).toBe(false);
  });

  it.each(rows)(
    "$label: schema-violating input → error",
    async ({ toolName, invalidInput, run }) => {
      create.mockResolvedValueOnce(toolUseResponse(toolName, invalidInput));
      const r = await run();
      expect(r.ok).toBe(false);
    },
  );

  it.each(rows)("$label: SDK throws → error", async ({ run }) => {
    create.mockRejectedValueOnce(new Error("network boom"));
    const r = await run();
    expect(r.ok).toBe(false);
  });
});

describe("writeXEn — X-specific behavior", () => {
  it("splits a thread response into body=parts[0] and threadTail=parts[1..]", async () => {
    const parts = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8"];
    create.mockResolvedValueOnce(toolUseResponse("emit_draft", { type: "thread", parts }));
    const r = await writeXEn({ article });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.body).toBe(parts[0]);
      expect(r.value.threadTail).toEqual(parts.slice(1));
    }
  });

  it("takes mediaUrl from article.cover", async () => {
    create.mockResolvedValueOnce(
      toolUseResponse("emit_draft", { type: "single", body: "a".repeat(50) }),
    );
    const r = await writeXEn({ article });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.mediaUrl).toBe(article.cover!.src);
  });
});

describe("editXEn — X-specific behavior", () => {
  it("keeps draft.mediaUrl in the edited draft", async () => {
    const draft: Draft = { body: "Original.", mediaUrl: "https://artka.dev/c.jpg" };
    create.mockResolvedValueOnce(
      toolUseResponse("emit_edited", { type: "single", body: "a".repeat(50) }),
    );
    const r = await editXEn(article, draft);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.mediaUrl).toBe(draft.mediaUrl);
  });

  it("rejects a single↔thread type flip from the model", async () => {
    create.mockResolvedValueOnce(
      toolUseResponse("emit_edited", { type: "thread", parts: ["T1", "T2"] }),
    );
    const r = await editXEn(article, singleDraft);
    expect(r.ok).toBe(false);
    if (!r.ok && r.error.kind === "generation") {
      expect(String(r.error.cause)).toMatch(/type changed/);
    }
  });
});

describe("Telegram adapters — MarkdownV2 rejection", () => {
  // 200 chars is within the [200, 600] zod range, but the trailing "!" is an
  // unescaped reserved MarkdownV2 char, so validateMarkdownV2 must fail it.
  const invalidMarkdown = { body: "a".repeat(200) + "!" };

  it("writeTgRu rejects a body with invalid MarkdownV2", async () => {
    create.mockResolvedValueOnce(toolUseResponse("emit_draft", invalidMarkdown));
    const r = await writeTgRu({ article });
    expect(r.ok).toBe(false);
  });

  it("editTgRu rejects a body with invalid MarkdownV2", async () => {
    create.mockResolvedValueOnce(toolUseResponse("emit_edited", invalidMarkdown));
    const r = await editTgRu(article, singleDraft);
    expect(r.ok).toBe(false);
  });
});

describe("runCritic", () => {
  const drafts: { channel: "x_en" | "li_en" | "tg_ru"; draft: Draft }[] = [
    { channel: "x_en", draft: { body: "X body", mediaUrl: null } },
    { channel: "li_en", draft: { body: "LI body", mediaUrl: null } },
    { channel: "tg_ru", draft: { body: "TG body", mediaUrl: null } },
  ];

  it("happy path returns notes per channel", async () => {
    create.mockResolvedValueOnce(
      toolUseResponse("emit_critique", {
        x_en: [{ severity: "warn", kind: "tone", message: "tilts marketing-speak" }],
        li_en: [],
        tg_ru: [{ severity: "warn", kind: "length", message: "fine" }],
      }),
    );
    const r = await runCritic(article, drafts);
    expect(r.x_en).toHaveLength(1);
    expect(r.li_en).toHaveLength(0);
    expect(r.tg_ru).toHaveLength(1);
  });

  it("falls back to empty notes on bad tool input", async () => {
    create.mockResolvedValueOnce(toolUseResponse("emit_critique", { x_en: "not-an-array" }));
    const r = await runCritic(article, drafts);
    expect(r).toEqual({ x_en: [], li_en: [], tg_ru: [] });
  });

  it("falls back to empty notes when the SDK throws", async () => {
    create.mockRejectedValueOnce(new Error("network boom"));
    const r = await runCritic(article, drafts);
    expect(r).toEqual({ x_en: [], li_en: [], tg_ru: [] });
  });
});

describe("hasBlockAnnotations", () => {
  it("returns true if any block-severity note present", () => {
    expect(hasBlockAnnotations([{ severity: "block", kind: "fact", message: "x" }])).toBe(true);
    expect(hasBlockAnnotations([{ severity: "warn", kind: "tone", message: "x" }])).toBe(false);
    expect(hasBlockAnnotations(null)).toBe(false);
    expect(hasBlockAnnotations(undefined)).toBe(false);
    expect(hasBlockAnnotations([])).toBe(false);
  });
});
