import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { WRITER_MODEL, ARTICLE_BODY_TRUNCATE } from "../config.js";
import { generationError, ok, err } from "../errors.js";
import { loadVoiceCard } from "../voice/loader.js";
import { validateMarkdownV2 } from "../markdown-v2.js";
import type { Article, Draft } from "../types.js";
import type { Result } from "../errors.js";

const EmitDraftSchema = z.object({
  body: z.string().min(200).max(600),
});

const TOOL = {
  name: "emit_draft",
  description: "Emit the Telegram post draft.",
  input_schema: {
    type: "object" as const,
    properties: {
      body: { type: "string", minLength: 200, maxLength: 600 },
    },
    required: ["body"],
  },
};

const buildSystemBlock = async (): Promise<string> => {
  const voice = await loadVoiceCard();
  const examples = JSON.stringify(voice.examples.tg_ru, null, 2);
  return `Ты пишешь пост в Telegram-канал «artka_blog» на русском языке.

<HARD-RULES>
- Длина: 200 ≤ chars ≤ 600.
- MarkdownV2: ВСЕ reserved chars (_*[]()~\`>#+-=|{}.!) экранируй обратным слэшем, КРОМЕ внутри **bold**, *italic*, \`code\`, [label](url).
- Первая строка: emoji + **bold-хук**.
- Последняя строка: ссылка на статью без preview.
- 0 хэштегов.
- Без фейковых CTA («Жми сейчас», «Like если согласен»).
</HARD-RULES>

<POLICY>
${voice.policy.tg_ru}
</POLICY>

<VOICE-PROFILE>
${voice.profile}
</VOICE-PROFILE>

<EXAMPLES>
${examples}
</EXAMPLES>

Используй tool emit_draft.`;
};

export const writeTgRu = async (ctx: { article: Article }): Promise<Result<Draft>> => {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const system = await buildSystemBlock();
    const truncatedBody = ctx.article.body.slice(0, ARTICLE_BODY_TRUNCATE);

    const response = await client.messages.create({
      model: WRITER_MODEL,
      max_tokens: 1200,
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

Напиши TG-RU пост через emit_draft.`,
        },
      ],
    });

    const block = response.content.find((b: { type: string }) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") {
      return err(generationError("writer", "tg_ru", "no tool_use block in response"));
    }

    const parsed = EmitDraftSchema.safeParse((block as { input: unknown }).input);
    if (!parsed.success) {
      return err(generationError("writer", "tg_ru", parsed.error));
    }

    const v = validateMarkdownV2(parsed.data.body);
    if (!v.ok) {
      return err(generationError("writer", "tg_ru", `markdownV2: ${v.issues.join(", ")}`));
    }

    return ok({
      body: parsed.data.body,
      mediaUrl: ctx.article.cover?.src ?? null,
    });
  } catch (cause) {
    return err(generationError("writer", "tg_ru", cause));
  }
};
