import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { EDITOR_MODEL, ARTICLE_BODY_TRUNCATE } from "../config.js";
import { generationError, ok, err } from "../errors.js";
import { loadVoiceCard } from "../voice/loader.js";
import type { Article, Draft } from "../types.js";
import type { Result } from "../errors.js";

const EmitEditedSchema = z.object({ body: z.string().min(1300).max(1900) });

const TOOL = {
  name: "emit_edited",
  description: "Emit the rewritten LinkedIn draft.",
  input_schema: {
    type: "object" as const,
    properties: { body: { type: "string", minLength: 1300, maxLength: 1900 } },
    required: ["body"],
  },
};

const buildSystem = async (): Promise<string> => {
  const v = await loadVoiceCard();
  return `You are the EDITOR for a LinkedIn post written in ENGLISH.

Your job: rewrite the draft in Artem's voice. Preserve the AI-disclosure (first 1-2 lines) and the 3-5 PascalCase hashtags at the end. Cut clichés. Replace abstractions with concrete facts.

<HARD-RULES>
- Length: 1300 ≤ chars ≤ 1900.
- AI-disclosure required in first 1-2 lines (preserve from input draft).
- 3-5 PascalCase hashtags at end (preserve from input draft).
- No ALL-CAPS headers.
</HARD-RULES>

<VOICE-PROFILE>
${v.profile}
</VOICE-PROFILE>

<BANNED-PHRASES (en)>
${JSON.stringify(v.banned.en)}
</BANNED-PHRASES>

<POLICY>
${v.policy.li_en}
</POLICY>

<EXAMPLES>
${JSON.stringify(v.examples.li_en, null, 2)}
</EXAMPLES>

Use the emit_edited tool.`;
};

export const editLiEn = async (article: Article, draft: Draft): Promise<Result<Draft>> => {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const system = await buildSystem();
    const truncated = article.body.slice(0, ARTICLE_BODY_TRUNCATE);

    const response = await client.messages.create({
      model: EDITOR_MODEL,
      max_tokens: 2500,
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

Rewrite this draft in Artem's voice using emit_edited.`,
        },
      ],
    });

    const block = response.content.find((b: { type: string }) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") {
      return err(generationError("editor", "li_en", "no tool_use block in response"));
    }

    const parsed = EmitEditedSchema.safeParse((block as { input: unknown }).input);
    if (!parsed.success) {
      return err(generationError("editor", "li_en", parsed.error));
    }

    return ok({ body: parsed.data.body, mediaUrl: draft.mediaUrl });
  } catch (cause) {
    return err(generationError("editor", "li_en", cause));
  }
};
