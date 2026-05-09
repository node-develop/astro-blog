import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { WRITER_MODEL, ARTICLE_BODY_TRUNCATE } from "../config.js";
import { generationError, ok, err } from "../errors.js";
import { loadVoiceCard } from "../voice/loader.js";
import type { Article, Draft } from "../types.js";
import type { Result } from "../errors.js";

const EmitDraftSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("single"),
    body: z.string().min(1).max(270),
  }),
  z.object({
    type: z.literal("thread"),
    parts: z.array(z.string().min(1).max(280)).min(8).max(15),
  }),
]);

const TOOL = {
  name: "emit_draft",
  description: "Emit the X (Twitter) draft as either a single tweet or a thread.",
  input_schema: {
    type: "object" as const,
    oneOf: [
      {
        properties: {
          type: { const: "single" },
          body: { type: "string", maxLength: 270 },
        },
        required: ["type", "body"],
      },
      {
        properties: {
          type: { const: "thread" },
          parts: {
            type: "array",
            items: { type: "string", maxLength: 280 },
            minItems: 8,
            maxItems: 15,
          },
        },
        required: ["type", "parts"],
      },
    ],
  },
};

const buildSystemBlock = async (): Promise<string> => {
  const voice = await loadVoiceCard();
  const examples = JSON.stringify(voice.examples.x_en, null, 2);
  return `You are writing an X (Twitter) post in ENGLISH for Artem Kashuta's audience.

<HARD-RULES>
- Single tweet: ≤270 characters (270, NOT 280 — leave room for link preview).
- Threads: 8 to 12 tweets ONLY. NEVER 2-4 — that pattern is the AI signature on X.
- No engagement bait. No hashtags in the lead tweet.
- ≤1 emoji in the lead tweet.
- Use first-person ("I spent...", "Last time I..."). Concrete numbers > vague qualifiers.
</HARD-RULES>

<POLICY>
${voice.policy.x_en}
</POLICY>

<VOICE-PROFILE>
${voice.profile}
</VOICE-PROFILE>

<EXAMPLES>
${examples}
</EXAMPLES>

Decide single vs thread by the article's structure: ≥3 distinct claims that
benefit from sequential framing → thread of 8-12. Otherwise → single.
Emit using the emit_draft tool.`;
};

export const writeXEn = async (ctx: { article: Article }): Promise<Result<Draft>> => {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const system = await buildSystemBlock();
    const truncatedBody = ctx.article.body.slice(0, ARTICLE_BODY_TRUNCATE);

    const response = await client.messages.create({
      model: WRITER_MODEL,
      max_tokens: 1500,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      tools: [TOOL] as never,
      tool_choice: { type: "tool", name: "emit_draft" } as never,
      messages: [
        {
          role: "user",
          content: `<ARTICLE>
title: ${ctx.article.title}
summary: ${ctx.article.summary}
url: ${ctx.article.sourceUrl}

body:
${truncatedBody}
</ARTICLE>

Generate the X-EN draft.`,
        },
      ],
    });

    const block = response.content.find((b: { type: string }) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") {
      return err(generationError("writer", "x_en", "no tool_use block in response"));
    }

    const parsed = EmitDraftSchema.safeParse((block as { input: unknown }).input);
    if (!parsed.success) {
      return err(generationError("writer", "x_en", parsed.error));
    }

    const out = parsed.data;

    if (out.type === "single") {
      return ok({
        body: out.body,
        mediaUrl: ctx.article.cover?.src ?? null,
      });
    }

    return ok({
      body: out.parts[0]!,
      threadTail: out.parts.slice(1),
      mediaUrl: ctx.article.cover?.src ?? null,
    });
  } catch (cause) {
    return err(generationError("writer", "x_en", cause));
  }
};
