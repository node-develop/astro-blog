/**
 * Phase 5 — challenge registry.
 *
 * Each lesson can register its <CodeChallenge id="..."> rubrics here.
 * Keep rubrics in code, not in MDX or DB — they're reviewable, version-
 * controlled, and don't ship to the client.
 *
 * Two grading paths:
 *   - deterministic: a function (code: string) => { pass, feedback }.
 *     Use for challenges with a clear yes/no. Fast, no LLM calls.
 *   - LLM-graded: omit `deterministic`, fill `prompt` + `rubric`. The
 *     /api/check endpoint will pass these to claude-haiku-4-5.
 */
export interface Challenge {
  prompt: string;
  language: string;
  rubric: string;
  /** If set, used in place of LLM grading. */
  deterministic?: (code: string) => { pass: boolean; feedback: string };
}

const containsAll = (text: string, needles: ReadonlyArray<string>): boolean =>
  needles.every((n) => text.includes(n));

export const challenges: Record<string, Challenge> = {
  "hooks-pre-tool-use-guard": {
    language: "bash",
    prompt:
      "Напишите PreToolUse hook, который блокирует команду `rm -rf /` " +
      "(и её разновидности с любыми пробелами / -rf -r-f) и пропускает остальные.",
    rubric:
      "Скрипт читает JSON со stdin, проверяет поле tool_input.command на " +
      "опасные конструкции (rm с -r/-rf и путём начинающимся с /), при " +
      "совпадении печатает причину в stderr и выходит с кодом 2; иначе exit 0.",
    // Deterministic path: we accept solutions that read stdin, do a regex
    // match for `rm` + any -r-style flag + a root-ish path, and exit 2.
    deterministic: (code) => {
      const ok = containsAll(code.toLowerCase(), ["rm", "exit 2"]);
      const readsStdin = /(jq|read|cat\s*-|\$\(<\/dev\/stdin)/i.test(code);
      const checksRoot = /\/[^a-z]/i.test(code) || /["']\/["']/.test(code);
      const pass = ok && readsStdin && checksRoot;
      return {
        pass,
        feedback: pass
          ? "Зачёт. Скрипт читает stdin, ловит rm с root-путём и выходит с кодом 2."
          : "Проверьте: (1) читаете JSON со stdin, (2) проверяете путь, (3) выходите с exit 2 при опасной команде.",
      };
    },
  },

  // Add new entries as you write challenges into lessons. Example
  // LLM-graded shape:
  //
  // "skills-yaml-frontmatter": {
  //   language: "yaml",
  //   prompt: "Опишите SKILL.md frontmatter для skill «pdf-extract»…",
  //   rubric: "Должен содержать поля name, description, scripts, references…",
  // },
};
