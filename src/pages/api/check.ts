/**
 * POST /api/check — CodeChallenge submission endpoint.
 *
 * Body: { challengeId: string, code: string, language: string }
 * Response: { pass: boolean, feedback: string }
 *
 * Strategy:
 *   1. Look up the challenge rubric in `src/data/challenges.ts` (a static
 *      registry — keep rubrics in code, not request-time, so they're
 *      reviewable and don't ship to the client).
 *   2. If the rubric has `tests: () => boolean` cases, run them in-process.
 *      Otherwise fall back to LLM-validated rubric matching.
 *   3. Always rate-limit per IP (20/min) — `claude.complete` calls are
 *      not free.
 *
 * No execution of user code on the server. We never `eval` or shell-out
 * the submission — only pattern-match (for deterministic challenges) or
 * pass it as TEXT to Claude with a strict rubric prompt.
 */
import type { APIRoute } from "astro";
import Anthropic from "@anthropic-ai/sdk";
import { challenges, type Challenge } from "~/data/challenges";

export const prerender = false;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Tiny in-memory rate limiter. For multi-instance you'd want Redis.
const buckets = new Map<string, { count: number; reset: number }>();
const RATE_LIMIT = 20;
const WINDOW_MS = 60_000;

const checkRateLimit = (ip: string): boolean => {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || b.reset < now) {
    buckets.set(ip, { count: 1, reset: now + WINDOW_MS });
    return true;
  }
  if (b.count >= RATE_LIMIT) return false;
  b.count++;
  return true;
};

const grade = async (
  challenge: Challenge,
  code: string,
): Promise<{ pass: boolean; feedback: string }> => {
  // Deterministic path: regex + custom validators.
  if (challenge.deterministic) {
    return challenge.deterministic(code);
  }

  // LLM path: Claude grades against the rubric in Russian.
  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 400,
    system:
      "Ты — преподаватель курса по Claude Code. Оцени ответ студента по строгому критерию. " +
      'Ответ — JSON объект {"pass": boolean, "feedback": string} без markdown-обёрток. ' +
      "Feedback — 1-3 предложения по-русски.",
    messages: [
      {
        role: "user",
        content: [
          `Задание: ${challenge.prompt}`,
          `Критерий зачёта: ${challenge.rubric}`,
          `Язык кода: ${challenge.language}`,
          `Ответ студента:\n\`\`\`${challenge.language}\n${code}\n\`\`\``,
          "Верни JSON и ничего больше.",
        ].join("\n\n"),
      },
    ],
  });

  const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  try {
    const parsed = JSON.parse(text) as { pass: boolean; feedback: string };
    return parsed;
  } catch {
    return { pass: false, feedback: "Не удалось распарсить ответ оценщика. Попробуйте ещё раз." };
  }
};

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!checkRateLimit(clientAddress)) {
    return new Response(
      JSON.stringify({ pass: false, feedback: "Слишком много попыток. Подождите минуту." }),
      {
        status: 429,
        headers: { "content-type": "application/json" },
      },
    );
  }

  let body: { challengeId?: string; code?: string; language?: string };
  try {
    body = (await request.json()) as never;
  } catch {
    return new Response(JSON.stringify({ pass: false, feedback: "Bad JSON." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const challenge = challenges[body.challengeId ?? ""];
  if (!challenge) {
    return new Response(JSON.stringify({ pass: false, feedback: "Неизвестное упражнение." }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const code = (body.code ?? "").slice(0, 4000);
  if (code.trim().length < 5) {
    return new Response(JSON.stringify({ pass: false, feedback: "Ответ слишком короткий." }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  const result = await grade(challenge, code);
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
