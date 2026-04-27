import Anthropic from "@anthropic-ai/sdk";
import type { ProsePlaceholder } from "./extract-prose";

const MODEL = "claude-sonnet-4-6";
const MAX_RETRIES = 3;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const SYSTEM_PROMPT_PROSE = `You are a technical translator for a developer blog.

Rules:
- Translate from {{SOURCE}} to {{TARGET}}
- Preserve markdown formatting (bold, italic, links, lists, code spans, footnotes) exactly
- Preserve all proper nouns: "Claude Code", "Astro", "MCP", "Anthropic", model names like "Opus 4.7", "Sonnet 4.6"
- Tone: technical, conversational, second-person ("you")
- NEVER touch URLs inside markdown links — they have already been rewritten where needed
- For Mermaid diagrams (placeholders with kind="mermaid"), only translate text inside [brackets], {braces}, and after colons in ("quoted strings"). NEVER touch arrows (-->, ---, ===, ==>, etc.), node IDs, or keywords (flowchart, subgraph, classDef, click, style, etc.)
- Return a JSON array of {id, text} objects matching the input ids exactly. No commentary, no markdown fences around the JSON.`;

const SYSTEM_PROMPT_STRINGS = `You are translating UI strings from {{SOURCE}} to {{TARGET}} for a developer blog.

Rules:
- Keep the same JSON keys; translate only values
- Preserve emoji, symbols (→, ⌘, ·, ↑, ↓, ⏎, Esc), HTML tags inside strings (e.g. <kbd>...</kbd>) — only the natural-language portions translate
- Keep "Claude Code", "Astro", and other proper nouns untranslated
- Return only the JSON object. No commentary, no markdown fences.`;

const localeName = (l: string): string => (l === "ru" ? "Russian" : "English");

const buildSystem = (template: string, source: string, target: string): string =>
  template.replace("{{SOURCE}}", localeName(source)).replace("{{TARGET}}", localeName(target));

export interface TranslateProseInput {
  readonly apiKey: string;
  readonly sourceLocale: "ru" | "en";
  readonly targetLocale: "ru" | "en";
  readonly placeholders: readonly ProsePlaceholder[];
}

export const translateProse = async (
  input: TranslateProseInput,
): Promise<readonly { id: number; text: string }[]> => {
  if (input.placeholders.length === 0) return [];

  const client = new Anthropic({ apiKey: input.apiKey });
  const system = buildSystem(SYSTEM_PROMPT_PROSE, input.sourceLocale, input.targetLocale);
  const userMsg = JSON.stringify(
    input.placeholders.map((p) => ({ id: p.id, kind: p.kind, text: p.text })),
  );

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 8192,
        temperature: 0,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userMsg }],
      });
      const block = res.content.find((c: { type: string }) => c.type === "text");
      if (!block || block.type !== "text") throw new Error("no text block in response");
      const parsed = JSON.parse((block as { text: string }).text) as {
        id: number;
        text: string;
      }[];
      return parsed;
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) await sleep(1000 * attempt);
    }
  }
  throw lastErr;
};

export interface TranslateStringsInput {
  readonly apiKey: string;
  readonly sourceLocale: "ru" | "en";
  readonly targetLocale: "ru" | "en";
  readonly strings: Record<string, string>;
}

export const translateStrings = async (
  input: TranslateStringsInput,
): Promise<Record<string, string>> => {
  if (Object.keys(input.strings).length === 0) return {};

  const client = new Anthropic({ apiKey: input.apiKey });
  const system = buildSystem(SYSTEM_PROMPT_STRINGS, input.sourceLocale, input.targetLocale);

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        temperature: 0,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: JSON.stringify(input.strings) }],
      });
      const block = res.content.find((c: { type: string }) => c.type === "text");
      if (!block || block.type !== "text") throw new Error("no text block in response");
      return JSON.parse((block as { text: string }).text) as Record<string, string>;
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) await sleep(1000 * attempt);
    }
  }
  throw lastErr;
};
