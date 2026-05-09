import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { WRITER_MODEL, ARTICLE_BODY_TRUNCATE } from "../config.js";
import { generationError, ok, err } from "../errors.js";
import { loadVoiceCard } from "../voice/loader.js";
import type { Article, Draft } from "../types.js";
import type { Result } from "../errors.js";

const EmitDraftSchema = z.object({
  body: z.string().min(1300).max(1900),
});

const TOOL = {
  name: "emit_draft",
  description: "Emit the LinkedIn post draft.",
  input_schema: {
    type: "object" as const,
    properties: {
      body: { type: "string", minLength: 1300, maxLength: 1900 },
    },
    required: ["body"],
  },
};

const buildSystemBlock = async (): Promise<string> => {
  const voice = await loadVoiceCard();
  const examples = JSON.stringify(voice.examples.li_en, null, 2);
  return `You are writing a LinkedIn post in ENGLISH for Artem Kashuta's audience.

<HARD-RULES>
- Length: 1300 ≤ chars ≤ 1900.
- AI-disclosure REQUIRED in the first 1-2 lines (e.g. "Drafted with Claude, edited by hand.").
- 3 to 5 PascalCase hashtags at the end (e.g. #FunctionalTypeScript).
- No ALL-CAPS headers.
- No external links in the first 100 chars.
- Use line breaks; avoid wall-of-text paragraphs.
</HARD-RULES>

<POLICY>
${voice.policy.li_en}
</POLICY>

<VOICE-PROFILE>
${voice.profile}
</VOICE-PROFILE>

<EXAMPLES>
${examples}
</EXAMPLES>

Emit using the emit_draft tool.`;
};

export const writeLiEn = async (ctx: { article: Article }): Promise<Result<Draft>> => {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const system = await buildSystemBlock();
    const truncatedBody = ctx.article.body.slice(0, ARTICLE_BODY_TRUNCATE);

    const response = await client.messages.create({
      model: WRITER_MODEL,
      max_tokens: 2500,
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

Generate the LI-EN draft.`,
        },
      ],
    });

    const block = response.content.find((b: { type: string }) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") {
      return err(generationError("writer", "li_en", "no tool_use block in response"));
    }

    const parsed = EmitDraftSchema.safeParse((block as { input: unknown }).input);
    if (!parsed.success) {
      return err(generationError("writer", "li_en", parsed.error));
    }

    return ok({
      body: parsed.data.body,
      mediaUrl: ctx.article.cover?.src ?? null,
    });
  } catch (cause) {
    return err(generationError("writer", "li_en", cause));
  }
};
