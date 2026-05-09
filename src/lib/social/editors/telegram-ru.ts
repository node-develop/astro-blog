import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { EDITOR_MODEL, ARTICLE_BODY_TRUNCATE } from "../config.js";
import { generationError, ok, err } from "../errors.js";
import { loadVoiceCard } from "../voice/loader.js";
import { validateMarkdownV2 } from "../markdown-v2.js";
import type { Article, Draft } from "../types.js";
import type { Result } from "../errors.js";

const EmitEditedSchema = z.object({ body: z.string().min(200).max(600) });

const TOOL = {
  name: "emit_edited",
  description: "Emit the rewritten Telegram draft.",
  input_schema: {
    type: "object" as const,
    properties: { body: { type: "string", minLength: 200, maxLength: 600 } },
    required: ["body"],
  },
};

const buildSystem = async (): Promise<string> => {
  const v = await loadVoiceCard();
  return `Ты EDITOR для поста в Telegram-канал «artka_blog». Перепиши черновик в голос Артёма, сохрани структуру и MarkdownV2-экранирование.

<HARD-RULES>
- Длина: 200 ≤ chars ≤ 600.
- MarkdownV2: ВСЕ reserved chars (_*[]()~\`>#+-=|{}.!) экранируй обратным слэшем, КРОМЕ внутри **bold**, *italic*, \`code\`, [label](url).
- Сохрани emoji + bold-хук в первой строке.
- Сохрани финальную ссылку на статью.
- 0 хэштегов.
</HARD-RULES>

<VOICE-PROFILE>
${v.profile}
</VOICE-PROFILE>

<BANNED-PHRASES (ru)>
${JSON.stringify(v.banned.ru)}
</BANNED-PHRASES>

<POLICY>
${v.policy.tg_ru}
</POLICY>

<EXAMPLES>
${JSON.stringify(v.examples.tg_ru, null, 2)}
</EXAMPLES>

Используй tool emit_edited.`;
};

export const editTgRu = async (article: Article, draft: Draft): Promise<Result<Draft>> => {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const system = await buildSystem();
    const truncated = article.body.slice(0, ARTICLE_BODY_TRUNCATE);

    const response = await client.messages.create({
      model: EDITOR_MODEL,
      max_tokens: 1200,
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
${JSON.stringify({ body: draft.body }, null, 2)}
</DRAFT>

Перепиши черновик в голос Артёма через emit_edited.`,
        },
      ],
    });

    const block = response.content.find((b: { type: string }) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") {
      return err(generationError("editor", "tg_ru", "no tool_use block in response"));
    }

    const parsed = EmitEditedSchema.safeParse((block as { input: unknown }).input);
    if (!parsed.success) {
      return err(generationError("editor", "tg_ru", parsed.error));
    }

    const mv2 = validateMarkdownV2(parsed.data.body);
    if (!mv2.ok) {
      return err(generationError("editor", "tg_ru", `markdownV2: ${mv2.issues.join(", ")}`));
    }

    return ok({ body: parsed.data.body, mediaUrl: draft.mediaUrl });
  } catch (cause) {
    return err(generationError("editor", "tg_ru", cause));
  }
};
