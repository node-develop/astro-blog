import tagsRu from "../../i18n/tags.ru.json" with { type: "json" };
import tagsEn from "../../i18n/tags.en.json" with { type: "json" };

/** Project vocabulary, RU → EN. Tag labels are added from `src/i18n/tags.*.json`. */
export const PROJECT_TERMS: readonly (readonly [string, string])[] = [
  ["Читайте также", "Related articles"],
  ["Источники", "Sources"],
  ["черновик", "draft"],
  ["публикация", "publication"],
  ["субагент", "subagent"],
  ["агент", "agent"],
  ["скилл", "skill"],
  ["хук", "hook"],
  ["промпт", "prompt"],
  ["контекстное окно", "context window"],
  ["сервер MCP", "MCP server"],
  ["рабочее дерево", "worktree"],
  ["конвейер", "pipeline"],
  ["сборка", "build"],
  ["развёртывание", "deployment"],
  ["обратная совместимость", "backward compatibility"],
  ["статический сайт", "static site"],
];

/** Pairs (ru, en) of keys both maps share, skipping labels that are the same in both languages. */
export const glossaryPairs = (
  ru: Readonly<Record<string, string>>,
  en: Readonly<Record<string, string>>,
): readonly (readonly [string, string])[] =>
  Object.entries(ru).flatMap(([key, ruLabel]) => {
    const enLabel = en[key];
    return enLabel !== undefined && enLabel !== ruLabel ? [[ruLabel, enLabel] as const] : [];
  });

/** The text appended to the system prompt: a fixed glossary, oriented source → target. */
export const glossaryBlock = (source: "ru" | "en" = "ru", target: "ru" | "en" = "en"): string => {
  const pairs = [...glossaryPairs(tagsRu, tagsEn), ...PROJECT_TERMS];
  const lines = pairs.map(([ru, en]) => (source === "ru" ? `${ru} → ${en}` : `${en} → ${ru}`));
  return `Glossary (${source} → ${target}). Prefer these renderings for the project terms (they are not a rule for the same word in an ordinary sense):\n${lines.map((l) => `- ${l}`).join("\n")}`;
};
