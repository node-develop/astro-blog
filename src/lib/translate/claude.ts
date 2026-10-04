import Anthropic from "@anthropic-ai/sdk";
import type { ProsePlaceholder } from "./extract-prose";
import { glossaryBlock } from "./glossary";
import { checkLengths, truncateAtBoundary, type Limits, type Violation } from "./validate-lengths";
import {
  findStructuralMismatches,
  formatMismatchSummary,
  type StructuralMismatch,
} from "./validate-structure";

/** The model of every RU→EN translation (file pipeline and Content API). */
export const TRANSLATION_MODEL = "claude-sonnet-5";
const MAX_RETRIES = 3;
/** Rough source tokens per request: Cyrillic is about 2-3 characters per token (an assumption). */
const BATCH_TOKENS = 3000;

/**
 * Optional transport limits. Unset, the SDK defaults apply (own retries with backoff and
 * Retry-After, 10 minute timeout): that is what the file pipeline relies on. The Content API
 * sets a short timeout and no SDK retries because it has a whole-request deadline and a budget.
 */
export interface RequestLimits {
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
}

const makeClient = (apiKey: string, limits?: RequestLimits): Anthropic =>
  new Anthropic({
    apiKey,
    ...(limits?.timeoutMs !== undefined ? { timeout: limits.timeoutMs } : {}),
    ...(limits?.maxRetries !== undefined ? { maxRetries: limits.maxRetries } : {}),
  });

const estimateTokens = (text: string): number => Math.ceil(text.length / 3);

/**
 * Greedy, order-preserving split of placeholders into requests of about `maxTokens` source
 * tokens. A placeholder larger than the budget gets a batch of its own.
 */
export const batchPlaceholders = (
  placeholders: readonly ProsePlaceholder[],
  maxTokens = BATCH_TOKENS,
): readonly (readonly ProsePlaceholder[])[] =>
  placeholders.reduce<readonly (readonly ProsePlaceholder[])[]>((batches, p) => {
    const last = batches.at(-1);
    const used = last ? last.reduce((sum, q) => sum + estimateTokens(q.text), 0) : 0;
    return last && used + estimateTokens(p.text) <= maxTokens
      ? [...batches.slice(0, -1), [...last, p]]
      : [...batches, [p]];
  }, []);

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const SYSTEM_PROMPT_PROSE = `You are a technical translator for a developer blog.

Rules:
- Translate from {{SOURCE}} to {{TARGET}}
- Preserve markdown formatting (bold, italic, links, lists, code spans, footnotes) exactly
- Markdown markers come in pairs: every \`**\` opens AND closes a bold span; every \`\\\`\` opens AND closes a code span. ALWAYS emit the closing marker, even when the span ends with internal punctuation like \`."\`, \`?"\`, or \`)\` — internal punctuation does NOT close the marker
- Preserve all proper nouns: "Claude Code", "Astro", "MCP", "Anthropic", model names like "Opus 4.7", "Sonnet 4.6"
- A fragment that is already in {{TARGET}} (an English sentence, term, quotation or identifier inside the {{SOURCE}} text) must be copied verbatim — do not paraphrase or "improve" it
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
- A value or fragment that is already in {{TARGET}} must be copied verbatim — do not paraphrase it
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

const buildSystem = (template: string, source: "ru" | "en", target: "ru" | "en"): string =>
  `${template
    .replaceAll("{{SOURCE}}", localeName(source))
    .replaceAll("{{TARGET}}", localeName(target))}\n\n${glossaryBlock(source, target)}`;

export interface TranslateProseInput {
  readonly apiKey: string;
  readonly sourceLocale: "ru" | "en";
  readonly targetLocale: "ru" | "en";
  readonly placeholders: readonly ProsePlaceholder[];
  /** Aborts the request in flight and stops retrying. */
  readonly signal?: AbortSignal;
  readonly requestLimits?: RequestLimits;
}

const requestOptions = (signal?: AbortSignal) => (signal ? { signal } : undefined);

/** One batch, retried up to MAX_RETRIES: transport errors, unbalanced markers, omitted ids. */
const translateBatch = async (
  client: Anthropic,
  system: string,
  batch: readonly ProsePlaceholder[],
  signal?: AbortSignal,
): Promise<readonly { id: number; text: string }[]> => {
  const accumulated = new Map<number, string>();
  const batchIds = new Set(batch.map((p) => p.id));
  let pending: readonly ProsePlaceholder[] = batch;
  let pendingMismatches: readonly StructuralMismatch[] = [];
  let pendingMissing: ReadonlySet<number> = new Set();

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const userPayload = pending.map((p) => {
      const mismatch = pendingMismatches.find((m) => m.id === p.id);
      if (mismatch)
        return {
          id: p.id,
          kind: p.kind,
          text: p.text,
          issue: `Previous translation had ${mismatch.translatedCount} '${mismatch.marker}' markers; source has ${mismatch.sourceCount}. Re-translate with all '${mismatch.marker}' markers preserved as pairs — internal punctuation like ." or ?" does NOT close the marker.`,
        };
      if (pendingMissing.has(p.id))
        return {
          id: p.id,
          kind: p.kind,
          text: p.text,
          issue: "This id was missing from your previous response. Translate it.",
        };
      return { id: p.id, kind: p.kind, text: p.text };
    });

    let parsed: { id: number; text: string }[];
    try {
      const res = await client.messages.create(
        {
          model: TRANSLATION_MODEL,
          max_tokens: 16384,
          temperature: 0,
          system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: JSON.stringify(userPayload) }],
        },
        requestOptions(signal),
      );
      const block = res.content.find((c: { type: string }) => c.type === "text");
      if (!block || block.type !== "text") throw new Error("no text block in response");
      parsed = JSON.parse(stripJsonFences((block as { text: string }).text)) as {
        id: number;
        text: string;
      }[];
    } catch (err) {
      if (attempt >= MAX_RETRIES || signal?.aborted) throw err;
      await sleep(1000 * attempt);
      continue;
    }

    for (const t of parsed) if (batchIds.has(t.id)) accumulated.set(t.id, t.text);

    const missing = batch.filter((p) => !accumulated.has(p.id));
    const mismatches = findStructuralMismatches(
      batch,
      Array.from(accumulated, ([id, text]) => ({ id, text })),
    );
    if (missing.length === 0 && mismatches.length === 0)
      return batch.map((p) => ({ id: p.id, text: accumulated.get(p.id)! }));

    if (attempt === MAX_RETRIES) {
      if (missing.length > 0)
        throw new Error(
          `Translator omitted ids ${missing.map((p) => p.id).join(", ")} after ${MAX_RETRIES} attempts`,
        );
      throw new Error(
        `Translator produced unbalanced markdown markers after ${MAX_RETRIES} attempts: ${formatMismatchSummary(mismatches)}`,
      );
    }

    const failing = new Set([...mismatches.map((m) => m.id), ...missing.map((p) => p.id)]);
    pending = batch.filter((p) => failing.has(p.id));
    pendingMismatches = mismatches;
    pendingMissing = new Set(missing.map((p) => p.id));
  }

  throw new Error("translateProse: exhausted retries without resolution");
};

/** Batches run one after another (the API key's rate limit) and are joined in source order. */
export const translateProse = async (
  input: TranslateProseInput,
): Promise<readonly { id: number; text: string }[]> => {
  if (input.placeholders.length === 0) return [];

  const client = makeClient(input.apiKey, input.requestLimits);
  const system = buildSystem(SYSTEM_PROMPT_PROSE, input.sourceLocale, input.targetLocale);

  const out: { id: number; text: string }[] = [];
  for (const batch of batchPlaceholders(input.placeholders)) {
    out.push(...(await translateBatch(client, system, batch, input.signal)));
  }
  return out;
};

export interface TranslateStringsInput {
  readonly apiKey: string;
  readonly sourceLocale: "ru" | "en";
  readonly targetLocale: "ru" | "en";
  readonly strings: Record<string, string>;
  readonly constraints?: Limits;
  readonly optionalKeys?: ReadonlySet<string>;
  /**
   * What to do with a limit still violated after the retry: "truncate" (default, the file
   * pipeline) cuts or drops the value; "throw" raises an error with `code: "length_violation"`
   * and the `violations`.
   */
  readonly onExhausted?: "truncate" | "throw";
  readonly signal?: AbortSignal;
  readonly requestLimits?: RequestLimits;
}

export type LengthViolationError = Error & {
  code: "length_violation";
  violations: readonly Violation[];
};
export const isLengthViolation = (error: unknown): error is LengthViolationError =>
  error instanceof Error && (error as { code?: unknown }).code === "length_violation";

const callTranslateStrings = async (
  client: Anthropic,
  system: string,
  userContent: string,
  signal?: AbortSignal,
): Promise<Record<string, string>> => {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await client.messages.create(
        {
          model: TRANSLATION_MODEL,
          // 20 FAQ pairs of up to 2200 characters do not fit in 4096 tokens.
          max_tokens: 16384,
          temperature: 0,
          system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: userContent }],
        },
        requestOptions(signal),
      );
      const block = res.content.find((c: { type: string }) => c.type === "text");
      if (!block || block.type !== "text") throw new Error("no text block in response");
      return JSON.parse(stripJsonFences((block as { text: string }).text)) as Record<
        string,
        string
      >;
    } catch (err) {
      lastErr = err;
      if (signal?.aborted) throw err;
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

  const client = makeClient(input.apiKey, input.requestLimits);
  const system = buildSystem(SYSTEM_PROMPT_STRINGS, input.sourceLocale, input.targetLocale);

  // No constraints — legacy path (catalog/tags, backward compatible).
  if (!input.constraints || Object.keys(input.constraints).length === 0) {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await client.messages.create({
          model: TRANSLATION_MODEL,
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
  let translated = await callTranslateStrings(client, system, userMsg1, input.signal);

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
  const retried = await callTranslateStrings(client, system, userMsg2, input.signal);

  // Merge retry result into translated (only keys that were retried).
  for (const k of failingKeys) {
    if (retried[k] !== undefined) translated[k] = retried[k]!;
  }

  // Re-validate after retry.
  violations = checkLengths(translated, constraints);
  if (violations.length === 0) return translated;

  if (input.onExhausted === "throw")
    throw Object.assign(
      new Error(`Translation violates length limits: ${violations.map((v) => v.key).join(", ")}`),
      { code: "length_violation" as const, violations },
    );

  // Final fallback policy.
  return applyFallbackPolicy(translated, violations, optionalKeys);
};
