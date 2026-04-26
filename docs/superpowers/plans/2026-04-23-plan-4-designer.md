# Plan 4 — Designer Subagent + Skills

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use `- [ ]` syntax for tracking.

**Goal:** Add a `designer` subagent and two supporting skills (`design-system-tokens`, `ui-design-review`) to the project's Claude Code team. Calibrated to the live Editorial × Technical token system in `src/styles/tokens.css`.

**Architecture:** Plain authored Markdown under `.claude/agents/` and `.claude/skills/`. No code, no tests; surface verification is "frontmatter parses, references resolve, no broken token names."

**Tech Stack:** Claude Code agents/skills (see `docs/claude-code-guide/04-skills.md` and `09-subagents.md`). Files match the existing patterns established by `architect.md`, `frontender.md`, and the four existing skills.

---

## Conventions

- All new files in Russian to match the existing team (`architect.md`, `backender.md`, etc. are all in Russian).
- Frontmatter must be valid YAML. `name` must be lowercase-kebab and unique within its directory.
- Token references in body text MUST exist in `src/styles/tokens.css` — copy/paste, do not invent.
- Single conventional commit at the end: `chore(claude): add designer agent + design-system-tokens + ui-design-review skills`.

## Phase map

- **Task 1:** Designer agent (`.claude/agents/designer.md`).
- **Task 2:** `design-system-tokens` skill.
- **Task 3:** `ui-design-review` skill.
- **Task 4:** Verify + commit + push.

---

### Task 1: Designer subagent

**Files:**
- Create: `.claude/agents/designer.md`

- [ ] **Step 1: Author the agent**

Frontmatter must contain:
- `name: designer`
- `description: …` (single paragraph: when to invoke, what role)
- `model: opus`
- `tools: ["Read", "Grep", "Glob", "WebFetch", "WebSearch"]`
- `disallowedTools: ["Write", "Edit", "Bash"]`
- `effort: high`
- `memory: read-only`

Body in Russian, sections:
1. Роль — кратко (UI/UX designer, доменно про этот блог).
2. Контекст визуального направления — Editorial × Technical, перечислить актуальные тройки шрифтов и три ключевых цвета (`--color-bg`, `--color-fg`, `--color-accent` с реальными hex), плюс правило "не хардкодим — обращаемся через токены".
3. Что делает (читает код, исследует через WebFetch, предлагает варианты, рисует HTML-эскизы).
4. Что НЕ делает (не редактирует файлы, не запускает Bash, не пишет финальный код — это `frontender`).
5. Принципы: WCAG 2.1 AA по контрасту (4.5:1 текст / 3:1 крупный), композиция > новизна, делегирование `frontender` для реализации, маршрутизация через `critic` для финального ревью.
6. Формат ответа (структурированный markdown: «Задача / Варианты / Рекомендация / Wireframe / Открытые вопросы»).

- [ ] **Step 2: Sanity check the YAML by re-reading the file**

```bash
head -10 .claude/agents/designer.md
```

Expected: well-formed frontmatter, no stray indentation.

---

### Task 2: `design-system-tokens` skill

**Files:**
- Create: `.claude/skills/design-system-tokens/SKILL.md`
- Create: `.claude/skills/design-system-tokens/REFERENCE.md` (the live token catalog snapshot)

- [ ] **Step 1: Author SKILL.md**

Frontmatter:
- `name: design-system-tokens`
- `description: …` — when to use: "когда нужно добавить/изменить токен в src/styles/tokens.css или Tailwind @theme"
- `allowed-tools: ["Read", "Write", "Edit", "Grep", "Glob"]`

Body in Russian, sections:
1. Цель — единый источник правды для визуальных токенов.
2. Архитектура: `src/styles/tokens.css` (CSS custom properties) → `src/styles/global.css` (`@theme` маппинг для Tailwind 4) → консьюмеры (`*.astro`, `*.tsx`, `*.css`).
3. Категории токенов (typography, colors, space, radius, shadow, layout, motion) — со ссылкой на REFERENCE.md.
4. Правила:
   - Каждый цветовой токен ОБЯЗАН иметь dark-mode counterpart (через `@media (prefers-color-scheme: dark)`).
   - Контраст текст/фон проверяется по WCAG AA до коммита.
   - Изменения токенов идут через эту скилл — никаких локальных hex в компонентах.
   - При добавлении новой категории — обновить REFERENCE.md и `@theme` блок.
5. Шаги:
   - Прочитать `src/styles/tokens.css` целиком (он маленький).
   - Определить категорию нового токена.
   - Дописать в `:root` и в dark-mode override (если цвет/тень).
   - Если токен должен быть utility-доступен Tailwind — добавить в `@theme` в `global.css`.
   - Запустить `pnpm typecheck && pnpm lint` (здесь это no-op для CSS, но ловит регрессии в импортирующих файлах).
6. Антипаттерны (с примерами):
   - Хардкод hex в `<style>` блоке — bad.
   - Использование `@apply` — запрещено (Tailwind 4 best practice).
   - Дублирование токенов (`--color-text` рядом с `--color-fg`) — bad, использовать существующий.

- [ ] **Step 2: Author REFERENCE.md**

Просто snapshot текущих токенов, сгруппированный по категориям, с краткой подписью к каждому. Не дублирует `tokens.css` дословно — это «человеческий путеводитель»: «когда какой использовать», «не путать с …».

---

### Task 3: `ui-design-review` skill

**Files:**
- Create: `.claude/skills/ui-design-review/SKILL.md`
- Create: `.claude/skills/ui-design-review/CHECKLIST.md`

- [ ] **Step 1: Author SKILL.md**

Frontmatter:
- `name: ui-design-review`
- `description: …` — когда применять: "при ревью компонента/страницы перед мержем — контраст, иерархия, консистентность, респонсив, dark mode, a11y"
- `allowed-tools: ["Read", "Grep", "Glob"]`

Body in Russian:
1. Цель — единый чек-лист дизайн-ревью для всего, что меняет визуальный слой.
2. Когда запускать (после изменений в `src/components/`, `src/styles/`, `src/layouts/`, или перед мержем).
3. Шаги:
   - Прочитать диф или целевые файлы.
   - Пройтись по чек-листу из CHECKLIST.md.
   - Для каждого пункта: ✅ pass / ⚠️ warn / ❌ fail с цитатой строки.
   - Контраст — посчитать WCAG ratio для каждой пары fg/bg, использованной в новых стилях. Если используется цветовой токен из `tokens.css` — взять оттуда.
   - Респонсив — проверить, что есть стили для < 640px и >= 1024px (минимум).
   - Dark mode — для всех цветовых токенов в новом коде убедиться, что у них есть пара в `@media (prefers-color-scheme: dark)`.
4. Формат отчёта: markdown-блок, severity-tagged (`critical`/`important`/`nit`).
5. Что НЕ делает: не вносит правки, не запускает дев-сервер. Только ревью + отчёт. Если правки нужны — вызвать `frontender`.

- [ ] **Step 2: Author CHECKLIST.md**

Чек-лист, разделённый на блоки:
1. Контраст и читаемость (WCAG 2.1 AA: 4.5:1 для body, 3:1 для крупного текста ≥18pt или 14pt bold).
2. Визуальная иерархия (heading scale, spacing rhythm, отсутствие "плоских" текстовых блоков).
3. Консистентность (нет хардкоженых hex/px, все размеры из `--space-*`/`--fs-*`, шрифты из `--font-*`).
4. Респонсив (mobile < 640px, tablet 640–1024, desktop > 1024 — есть отдельные правила).
5. Dark mode (все цветовые токены имеют dark counterpart, тени отдельные для тёмной темы).
6. Motion (использует `--dur-*` и `--ease-*`, уважает `prefers-reduced-motion`).
7. A11y surface (alt на изображениях, label на input, focus-visible виден, role/aria-* корректны, focus-trap для модалок).

Каждый пункт — короткое описание + что искать (grep-pattern или конкретные имена токенов).

---

### Task 4: Verify + commit + push

- [ ] **Step 1: Frontmatter sanity**

```bash
for f in .claude/agents/designer.md .claude/skills/design-system-tokens/SKILL.md .claude/skills/ui-design-review/SKILL.md; do
  head -15 "$f"
  echo "---"
done
```

Expected: each file starts with `---`, has at least `name`, `description`, and either `model`+`tools` (agent) or `allowed-tools` (skill).

- [ ] **Step 2: Token reference sanity**

```bash
grep -oE '\-\-[a-z][a-z0-9-]+' .claude/skills/design-system-tokens/REFERENCE.md .claude/agents/designer.md | sort -u > /tmp/refs.txt
grep -oE '\-\-[a-z][a-z0-9-]+' src/styles/tokens.css | sort -u > /tmp/tokens.txt
comm -23 /tmp/refs.txt /tmp/tokens.txt
```

Expected: no output (every token referenced in agent/skills exists in `tokens.css`). If output appears, those tokens are typos / hallucinations — fix them.

- [ ] **Step 3: Commit**

```bash
git add .claude/agents/designer.md .claude/skills/design-system-tokens/ .claude/skills/ui-design-review/ docs/superpowers/plans/2026-04-23-plan-4-designer.md
git commit -m "chore(claude): add designer agent + design-system-tokens + ui-design-review skills"
```

- [ ] **Step 4: Push**

```bash
git push origin feat/cms-core
```

---

## Out of scope

- A skill for "produce wireframe" — designer agent emits HTML inline; no scaffold needed.
- Designer-driven tokens.css refactor — out of scope; existing tokens are AA-clean.
- Storybook / visual regression — separate future plan.
