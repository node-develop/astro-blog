import Anthropic from "@anthropic-ai/sdk";
import type { ProsePlaceholder } from "./extract-prose";
import { checkLengths, truncateAtBoundary, type Limits, type Violation } from "./validate-lengths";
import {
  findStructuralMismatches,
  formatMismatchSummary,
  type StructuralMismatch,
} from "./validate-structure";

const MODEL = "claude-sonnet-5";
const MAX_RETRIES = 3;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const SYSTEM_PROMPT_PROSE = `You are a technical translator for a developer blog.

Rules:
- Translate from {{SOURCE}} to {{TARGET}}
- Preserve markdown formatting (bold, italic, links, lists, code spans, footnotes) exactly
- Markdown markers come in pairs: every \`**\` opens AND closes a bold span; every \`\\\`\` opens AND closes a code span. ALWAYS emit the closing marker, even when the span ends with internal punctuation like \`."\`, \`?"\`, or \`)\` — internal punctuation does NOT close the marker
- Preserve all proper nouns: "Claude Code", "Astro", "MCP", "Anthropic", model names like "Opus 4.7", "Sonnet 4.6"
- Tone: technical, conversational, second-person ("you")
- NEVER touch URLs inside markdown links — they have already been rewritten where needed
- For Mermaid diagrams (placeholders with kind="mermaid"), only translate text inside [brackets], {braces}, and after colons in ("quoted strings"). NEVER touch arrows (-->, ---, ===, ==>, etc.), node IDs, or keywords (flowchart, subgraph, classDef, click, style, etc.)
- If an input item has an "issue" field, your previous translation of that id was rejected for the reason given — produce a corrected translation that fixes the issue while keeping all markdown markers paired
- Return a JSON array of {id, text} objects matching the input ids exactly. No commentary, no markdown fences around the JSON.`;

const SYSTEM_PROMPT_STRINGS = `You are translating UI strings from {{SOURCE}} to {{TARGET}} for a developer blog.

Rules:
- Keep the same JSON keys; translate only values
- Preserve emoji, symbols (→, ⌘, ·, ↑, ↓, ⏎, Esc), HTML tags inside strings (e.g. <kbd>...</kbd>) — only the natural-language portions translate
- Keep "Claude Code", "Astro", and other proper nouns untranslated
- Return only the JSON object. No commentary, no markdown fences.
- Length constraints (when provided): each value's character count must satisfy the per-key limits in input.limits. If a natural translation exceeds max, rewrite tighter — do not truncate mid-word.`;

const localeName = (l: string): string => (l === "ru" ? "Russian" : "English");

/**
 * Strip optional ```json ... ``` fences that the model sometimes wraps around JSON output.
 * Also handles truncated responses where the closing fence is missing.
 */
const stripJsonFences = (text: string): string => {
  const trimmed = text.trim();
  // Complete fence: ```[json]\n...\n```
  const complete = /^```(?:json)?\r?\n([\s\S]*?)\r?\n```\s*$/.exec(trimmed);
  if (complete) return (complete[1] ?? trimmed).trim();
  // Truncated fence: ```[json]\n... (no closing ```)
  const truncated = /^```(?:json)?\r?\n([\s\S]*)$/.exec(trimmed);
  if (truncated) return (truncated[1] ?? trimmed).trim();
  return trimmed;
};

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

  const accumulated = new Map<number, string>();
  let pendingPlaceholders: readonly ProsePlaceholder[] = input.placeholders;
  let pendingMismatches: readonly StructuralMismatch[] = [];

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const userPayload = pendingPlaceholders.map((p) => {
      const issue = pendingMismatches.find((m) => m.id === p.id);
      if (!issue) return { id: p.id, kind: p.kind, text: p.text };
      return {
        id: p.id,
        kind: p.kind,
        text: p.text,
        issue: `Previous translation had ${issue.translatedCount} '${issue.marker}' markers; source has ${issue.sourceCount}. Re-translate with all '${issue.marker}' markers preserved as pairs — internal punctuation like ." or ?" does NOT close the marker.`,
      };
    });
    const userMsg = JSON.stringify(userPayload);

    let parsed: { id: number; text: string }[];
    try {
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 16384,
        temperature: 0,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userMsg }],
      });
      const block = res.content.find((c: { type: string }) => c.type === "text");
      if (!block || block.type !== "text") throw new Error("no text block in response");
      const rawText = stripJsonFences((block as { text: string }).text);
      parsed = JSON.parse(rawText) as { id: number; text: string }[];
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        await sleep(1000 * attempt);
        continue;
      }
      throw err;
    }

    for (const t of parsed) accumulated.set(t.id, t.text);

    const fullSet = Array.from(accumulated, ([id, text]) => ({ id, text }));
    const mismatches = findStructuralMismatches(input.placeholders, fullSet);
    if (mismatches.length === 0) return fullSet;

    if (attempt === MAX_RETRIES) {
      throw new Error(
        `Translator produced unbalanced markdown markers after ${MAX_RETRIES} attempts: ${formatMismatchSummary(mismatches)}`,
      );
    }

    const failingIds = new Set(mismatches.map((m) => m.id));
    pendingPlaceholders = input.placeholders.filter((p) => failingIds.has(p.id));
    pendingMismatches = mismatches;
  }

  throw lastErr ?? new Error("translateProse: exhausted retries without resolution");
};

export interface TranslateStringsInput {
  readonly apiKey: string;
  readonly sourceLocale: "ru" | "en";
  readonly targetLocale: "ru" | "en";
  readonly strings: Record<string, string>;
  readonly constraints?: Limits;
  readonly optionalKeys?: ReadonlySet<string>;
}

const callTranslateStrings = async (
  client: Anthropic,
  system: string,
  userContent: string,
): Promise<Record<string, string>> => {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        temperature: 0,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userContent }],
      });
      const block = res.content.find((c: { type: string }) => c.type === "text");
      if (!block || block.type !== "text") throw new Error("no text block in response");
      return JSON.parse(stripJsonFences((block as { text: string }).text)) as Record<
        string,
        string
      >;
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) await sleep(1000 * attempt);
    }
  }
  throw lastErr;
};

const applyFallbackPolicy = (
  translated: Record<string, string>,
  violations: readonly Violation[],
  optionalKeys: ReadonlySet<string>,
  slug?: string,
): Record<string, string> => {
  const out = { ...translated };
  for (const v of violations) {
    if (v.kind === "over") {
      const truncated = truncateAtBoundary(out[v.key] ?? "", v.max);
      console.warn(
        `[translate:warn] field=${v.key} truncated ${v.got}→${truncated.length} (max ${v.max})${slug ? ` slug=${slug}` : ""}`,
      );
      out[v.key] = truncated;
    } else {
      // under-min
      if (optionalKeys.has(v.key)) {
        console.warn(
          `[translate:warn] field=${v.key} under-min ${v.got}<${v.min ?? 0} (optional) — dropped${slug ? ` slug=${slug}` : ""}`,
        );
        delete out[v.key];
      } else {
        throw new Error(
          `EN translation under-min for required field "${v.key}": got ${v.got} chars, min ${v.min ?? 0}.${slug ? ` Slug: ${slug}.` : ""} Edit RU source or rerun with different prompt.`,
        );
      }
    }
  }
  return out;
};

export const translateStrings = async (
  input: TranslateStringsInput,
): Promise<Record<string, string>> => {
  if (Object.keys(input.strings).length === 0) return {};

  const client = new Anthropic({ apiKey: input.apiKey });
  const system = buildSystem(SYSTEM_PROMPT_STRINGS, input.sourceLocale, input.targetLocale);

  // No constraints — legacy path (catalog/tags, backward compatible).
  if (!input.constraints || Object.keys(input.constraints).length === 0) {
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
        return JSON.parse(stripJsonFences((block as { text: string }).text)) as Record<
          string,
          string
        >;
      } catch (err) {
        lastErr = err;
        if (attempt < MAX_RETRIES) await sleep(1000 * attempt);
      }
    }
    throw lastErr;
  }

  // Constraints path: call #1 with {strings, limits}.
  const constraints = input.constraints;
  const optionalKeys = input.optionalKeys ?? new Set<string>();

  const userMsg1 = JSON.stringify({ strings: input.strings, limits: constraints });
  let translated = await callTranslateStrings(client, system, userMsg1);

  // Validate after call #1.
  let violations = checkLengths(translated, constraints);
  if (violations.length === 0) return translated;

  // Retry #1: send only failing keys with feedback.
  const failingKeys = violations.map((v) => v.key);
  const failingStrings: Record<string, string> = {};
  for (const k of failingKeys) {
    if (input.strings[k] !== undefined) failingStrings[k] = input.strings[k]!;
  }
  const feedback = violations.map((v) => ({
    key: v.key,
    got: v.got,
    max: v.max,
    ...(v.min !== undefined ? { min: v.min } : {}),
    message:
      v.kind === "over"
        ? `Value is ${v.got} chars, must be ≤${v.max}. Rewrite shorter.`
        : `Value is ${v.got} chars, must be ≥${v.min ?? 0}. Expand.`,
  }));
  const userMsg2 = JSON.stringify({ strings: failingStrings, limits: constraints, feedback });
  const retried = await callTranslateStrings(client, system, userMsg2);

  // Merge retry result into translated (only keys that were retried).
  for (const k of failingKeys) {
    if (retried[k] !== undefined) translated[k] = retried[k]!;
  }

  // Re-validate after retry.
  violations = checkLengths(translated, constraints);
  if (violations.length === 0) return translated;

  // Final fallback policy.
  return applyFallbackPolicy(translated, violations, optionalKeys);
};
