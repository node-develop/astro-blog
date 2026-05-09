import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { CRITIC_MODEL, ARTICLE_BODY_TRUNCATE } from "./config.js";
import { loadVoiceCard } from "./voice/loader.js";
import type { Article, CriticNote, Draft, SocialChannel } from "./types.js";

const NoteSchema = z.discriminatedUnion("severity", [
  z.object({
    severity: z.literal("block"),
    kind: z.enum(["fact", "policy"]),
    message: z.string(),
    span: z.tuple([z.number(), z.number()]).optional(),
    tag: z.string().optional(),
  }),
  z.object({
    severity: z.literal("warn"),
    kind: z.enum(["tone", "length"]),
    message: z.string(),
    span: z.tuple([z.number(), z.number()]).optional(),
  }),
]);

const CritiqueSchema = z.object({
  x_en: z.array(NoteSchema),
  li_en: z.array(NoteSchema),
  tg_ru: z.array(NoteSchema),
});

const TOOL = {
  name: "emit_critique",
  description: "Emit per-channel annotation arrays.",
  input_schema: {
    type: "object",
    properties: {
      x_en: { type: "array", items: { type: "object" } },
      li_en: { type: "array", items: { type: "object" } },
      tg_ru: { type: "array", items: { type: "object" } },
    },
    required: ["x_en", "li_en", "tg_ru"],
  },
} as const;

const buildSystem = async (): Promise<string> => {
  const v = await loadVoiceCard();
  return `You are an EDITORIAL CRITIC. Read-only. You annotate; you DO NOT rewrite.

For each of the three channels (x_en, li_en, tg_ru), emit zero or more notes:
- severity "block": fact errors (claims not in source article), policy violations (per-channel rules below).
- severity "warn": tone (banned phrases / patterns), length (outside ranges).

<POLICY: X-EN>
${v.policy.x_en}
</POLICY>

<POLICY: LI-EN>
${v.policy.li_en}
</POLICY>

<POLICY: TG-RU>
${v.policy.tg_ru}
</POLICY>

<BANNED-PHRASES>
${JSON.stringify(v.banned)}
</BANNED-PHRASES>

For LI-EN specifically: if AI-disclosure is missing in the first 1-2 lines, emit
{ severity:'block', kind:'policy', tag:'ai-disclosure', message:'Missing AI-disclosure' }.

Use emit_critique tool.`;
};

const EMPTY_NOTES: Record<SocialChannel, CriticNote[]> = { x_en: [], li_en: [], tg_ru: [] };

export const runCritic = async (
  article: Article,
  drafts: { channel: SocialChannel; draft: Draft }[],
): Promise<Record<SocialChannel, CriticNote[]>> => {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const system = await buildSystem();
    const truncated = article.body.slice(0, ARTICLE_BODY_TRUNCATE);

    const draftMap: Record<string, unknown> = { x_en: null, li_en: null, tg_ru: null };
    for (const { channel, draft } of drafts) {
      draftMap[channel] =
        draft.threadTail && draft.threadTail.length > 0
          ? { type: "thread", parts: [draft.body, ...draft.threadTail] }
          : { body: draft.body };
    }

    const response = await client.messages.create({
      model: CRITIC_MODEL,
      max_tokens: 2000,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      tools: [TOOL] as never,
      tool_choice: { type: "tool", name: "emit_critique" } as never,
      messages: [
        {
          role: "user",
          content: `<ARTICLE>
title: ${article.title}
summary: ${article.summary}
url: ${article.sourceUrl}
body:
${truncated}
</ARTICLE>

<DRAFTS>
${JSON.stringify(draftMap, null, 2)}
</DRAFTS>

Annotate using emit_critique.`,
        },
      ],
    });

    const block = response.content.find((b: { type: string }) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") return EMPTY_NOTES;
    const parsed = CritiqueSchema.safeParse((block as { input: unknown }).input);
    if (!parsed.success) return EMPTY_NOTES;
    return parsed.data as Record<SocialChannel, CriticNote[]>;
  } catch {
    return EMPTY_NOTES;
  }
};

export const hasBlockAnnotations = (notes: CriticNote[] | null | undefined): boolean =>
  Array.isArray(notes) && notes.some((n) => n.severity === "block");
