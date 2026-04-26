---
name: design-system-tokens
description: Добавить или изменить визуальный токен в src/styles/tokens.css и связанный @theme в global.css. Используй, когда нужен новый цвет/шрифт/размер/радиус/тень/брейкпоинт, и если в существующих токенах его нет. Не используй для одноразовых стилей в компоненте — там просто бери существующий токен.
allowed-tools: ["Read", "Write", "Edit", "Grep", "Glob"]
---

# Дизайн-система: токены

## Цель

Единый источник правды для визуальных токенов проекта. Все цвета, шрифты, размеры, радиусы, тени, отступы и тайминги анимаций живут в `src/styles/tokens.css`. Компоненты обращаются к ним через `var(--…)` или Tailwind utility-классы, замаппленные в `src/styles/global.css` через `@theme`.

## Архитектура

```
src/styles/
├── tokens.css     ← :root + dark + reduced-motion. Источник правды.
├── global.css     ← @import "tailwindcss"; @theme { ... }; импорт tokens.css; prose overrides.
└── prose.css      ← typography для body статей, целиком на токенах.
```

Поток:

1. `tokens.css` объявляет CSS custom property (`--color-bg`, `--space-4`, ...).
2. `global.css` `@theme` блок маппит её в Tailwind: `--color-bg: var(--color-bg)` → доступно как `bg-bg` в utility.
3. Компоненты используют либо utility (`class="bg-bg text-fg"`), либо прямой `var(--color-bg)` в `<style>` блоке.

## Категории токенов

См. `REFERENCE.md` рядом — это «человеческий путеводитель» по токенам с подсказками когда какой использовать.

Категории:

- **Typography** — `--font-*`, `--fs-*`, `--lh-*`, `--tracking-*`.
- **Colors** — `--color-*` (всегда с dark counterpart).
- **Space** — `--space-1`…`--space-9` (4px-шаг).
- **Radii** — `--radius-sm/md/lg/pill`.
- **Shadow** — `--shadow-soft`, `--shadow-lifted` (свои значения для dark).
- **Layout** — `--col-*`, `--gutter`, `--content-max`.
- **Motion** — `--ease-*`, `--dur-*` (`--dur-*` обнуляются в `prefers-reduced-motion`).

## Правила

1. **Каждый цветовой токен ОБЯЗАН иметь dark-mode counterpart** в блоке `@media (prefers-color-scheme: dark)` внутри `tokens.css`.
2. **Контраст текст/фон проверяется по WCAG AA** до коммита (4.5:1 body, 3:1 large). Если AA не вытягивается — пересмотри сам hex, не уменьшай порог.
3. **Никаких локальных hex/px в компонентах.** Если значение нужно один раз — это всё равно токен, потому что назавтра его захотят повторить. Цена добавить — две строчки.
4. **Не дублируй токены** под разными именами. Перед добавлением — `grep -E '\-\-color-' src/styles/tokens.css` и аналогично для других категорий.
5. **`@apply` запрещён** (Tailwind 4 best practice + наш CLAUDE.md). Внутри компонентов используй либо utility-классы, либо `var(--…)` в `<style>`.
6. **Тени для dark mode** — отдельные значения, потому что `rgba(31,27,22,…)` на тёмном фоне даёт выпуклый эффект; нужны `rgba(0,0,0,…)`.
7. **Motion-токены уважают `prefers-reduced-motion`** — `--dur-*` обнуляются в media-query. Если добавляешь новый `--dur-*`, обнули и его.

## Шаги

1. **Прочитай `src/styles/tokens.css` целиком** (он маленький, ~110 строк). Сверься с категориями.
2. **Определи категорию** нового токена. Если его реальное место — новая категория, обнови REFERENCE.md и добавь подразделение в `tokens.css` (с заголовком-комментарием в стиле существующих).
3. **Имя токена:** `--<category>-<role>[-modifier]`. Примеры: `--color-success`, `--color-success-soft`, `--fs-display`. Без аббревиатур.
4. **Добавь в `:root`** (light режим).
5. **Добавь dark-counterpart** в `@media (prefers-color-scheme: dark)` (для цветов и теней).
6. **Если нужно в `prefers-reduced-motion`** — добавь там override (только для motion).
7. **Если токен должен быть Tailwind-utility** — добавь в `@theme` в `global.css` (например `--color-success: var(--color-success);` → класс `bg-success`).
8. **Обнови `REFERENCE.md`** — короткая запись «когда использовать».
9. **Проверь использование:** прогон `pnpm typecheck && pnpm lint`. Это no-op для CSS, но ловит регрессии в импортирующих TS/Astro файлах.
10. **Проверь контраст** для новых цветовых пар (см. правило 2). Можно прикинуть в голове по shadow-метрикам или прогнать через WebFetch на `https://webaim.org/resources/contrastchecker/`.

## Антипаттерны

❌ **Хардкод hex в компоненте**:

```astro
<style>
  .badge {
    background: #fdf4e3;
    color: #946708;
  } /* плохо */
</style>
```

✅ Через токены:

```astro
<style>
  .badge {
    background: var(--color-accent-soft);
    color: var(--color-accent);
  }
</style>
```

❌ **`@apply` в CSS**:

```css
.btn {
  @apply bg-blue-600 text-white;
} /* запрещено */
```

✅ Либо utility прямо в разметке, либо `var(--color-…)` в `<style>`.

❌ **Дубликат токена**:

```css
:root {
  --color-text: #1f1b16; /* плохо — у нас уже есть --color-fg с тем же значением */
}
```

✅ Использовать существующий `--color-fg`.

❌ **Цвет без dark counterpart**:

```css
:root {
  --color-success: #2ea043;
}
/* в @media dark — ничего, остаётся ярко-зелёный на тёмном bg */
```

✅ Добавить dark-вариант с пониженной светлотой / другим оттенком.

❌ **Произвольное spacing значение**:

```css
.card {
  padding: 14px 22px;
} /* плохо */
```

✅ Подобрать из `--space-*`. Если действительно нужно нечто между — обоснуй и добавь как токен.

## Checkpoint после работы

- [ ] `tokens.css`: токен в `:root` + (если цвет/тень) в dark + (если motion) в reduced-motion.
- [ ] `global.css` `@theme`: маппинг добавлен (если нужен utility).
- [ ] `REFERENCE.md`: запись с «когда использовать».
- [ ] Никаких хардкодов в новых/изменённых компонентах (`grep -nE '#[0-9a-fA-F]{3,6}|[0-9]+px' src/components/<новые файлы>` — должно быть пусто кроме SVG-paths).
- [ ] WCAG AA проверен для новых пар.
- [ ] `pnpm typecheck && pnpm lint` — зелёное.
