import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { EDITOR_MODEL, ARTICLE_BODY_TRUNCATE } from "../config.js";
import { generationError, ok, err } from "../errors.js";
import { loadVoiceCard } from "../voice/loader.js";
import type { Article, Draft } from "../types.js";
import type { Result } from "../errors.js";

const EmitEditedSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("single"),
    body: z.string().min(1).max(270),
  }),
  z.object({
    type: z.literal("thread"),
    parts: z.array(z.string().min(1).max(280)).min(2).max(15),
  }),
]);

const TOOL = {
  name: "emit_edited",
  description:
    "Emit the rewritten X draft. Keep the same type as the input (single→single, thread→thread).",
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
          },
        },
        required: ["type", "parts"],
      },
    ],
  },
};

const buildSystem = async (): Promise<string> => {
  const v = await loadVoiceCard();
  return `You are the EDITOR for an X (Twitter) post written in ENGLISH.

Your job: rewrite the draft in Artem's voice. Keep the structure (single vs thread). Cut clichés. Replace abstractions with concrete facts. Match Artem's typical opening rhythms.

<VOICE-PROFILE>
${v.profile}
</VOICE-PROFILE>

<BANNED-PHRASES (en)>
${JSON.stringify(v.banned.en)}
</BANNED-PHRASES>

<POLICY>
${v.policy.x_en}
</POLICY>

<EXAMPLES>
${JSON.stringify(v.examples.x_en, null, 2)}
</EXAMPLES>

Use the emit_edited tool. NEVER convert single↔thread.`;
};

export const editXEn = async (article: Article, draft: Draft): Promise<Result<Draft>> => {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const system = await buildSystem();
    const truncated = article.body.slice(0, ARTICLE_BODY_TRUNCATE);

    const draftPayload =
      draft.threadTail && draft.threadTail.length > 0
        ? { type: "thread" as const, parts: [draft.body, ...draft.threadTail] }
        : { type: "single" as const, body: draft.body };

    const response = await client.messages.create({
      model: EDITOR_MODEL,
      max_tokens: 2000,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      tools: [TOOL] as never,
      tool_choice: { type: "tool", name: "emit_edited" } as never,
      messages: [
        {
          role: "user",
          content: `<ARTICLE>
title: ${article.title}
url: ${article.sourceUrl}
body:
${truncated}
</ARTICLE>

<DRAFT>
${JSON.stringify(draftPayload, null, 2)}
</DRAFT>

Rewrite this draft in Artem's voice using emit_edited.`,
        },
      ],
    });

    const block = response.content.find((b: { type: string }) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") {
      return err(generationError("editor", "x_en", "no tool_use block in response"));
    }

    const parsed = EmitEditedSchema.safeParse((block as { input: unknown }).input);
    if (!parsed.success) {
      return err(generationError("editor", "x_en", parsed.error));
    }

    const out = parsed.data;

    if (out.type !== draftPayload.type) {
      return err(
        generationError("editor", "x_en", `type changed ${draftPayload.type}→${out.type}`),
      );
    }

    if (out.type === "single") {
      return ok({ body: out.body, mediaUrl: draft.mediaUrl });
    }

    return ok({ body: out.parts[0]!, threadTail: out.parts.slice(1), mediaUrl: draft.mediaUrl });
  } catch (cause) {
    return err(generationError("editor", "x_en", cause));
  }
};
