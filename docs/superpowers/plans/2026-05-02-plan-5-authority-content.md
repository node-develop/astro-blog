# EPIC E — Authority Content Brief

> **For agentic workers:** This is a **content brief**, not a code-implementation plan. Most of the work is writing prose: TL;DR lines, FAQs, new article outlines, an `about.md` rewrite. Use `superpowers:writing-skills` discipline (verify-before-claim, evidence beats assertion) when authoring. NO new code is required for E1 and E3; E2 produces three Markdown posts under `src/content/posts/`.
>
> **Spec:** `docs/superpowers/specs/2026-05-02-llm-citable-blog-design.md` § Phase 5 ("Authority content (rolling)") and EPIC E in the executive summary.
>
> **Depends on:** Plan 3 (Retrieval-layer frontmatter — `summary`, `keywords`, `faq[]` zod fields) must ship before E1/E2 frontmatter changes typecheck. Until then, draft the prose in this document and merge frontmatter wholesale once the schema lands.

**Goal:** Convert the existing single-cluster Claude Code corpus into a defensible authority surface for LLM citation by (a) backfilling TL;DR + FAQ on top-10 posts, (b) broadening topical coverage with three new authority pieces, and (c) turning the 14-line `about.md` into a rich `Person`-schema source.

**Audience:** Two readers per page — (1) an LLM crawler extracting a quotable passage with attribution, (2) a senior engineer Googling for a concrete problem.

**Editorial principle:** Every claim that smells like a benchmark or a number needs a real measurement. Placeholders are explicitly labelled `(owner to fill)`. Do not fabricate facts about the author.

---

## Working notes

**Subagent assignments (per CLAUDE.md):**
- `sysanalyst` → drafts Q/A wording, sanity-checks reading-level and citation-readiness.
- `frontender` → only if `<Tldr>`/`<Faq>` MDX components need an authoring example baked into a post (Plan 3 territory; usually no-op here).
- `critic` → final pass on each new authority article before merge: factual accuracy, no hand-wavy benchmarks, no "as we all know" filler.
- `architect` → consulted only for E2-article-3 (architecture deep-dive) if it touches design choices the spec also makes.

**Discipline:**
- Conventional commits per article: `docs(content):` for posts, `docs(site):` for `about.md`.
- One commit per post for E1 (`docs(content): backfill summary+faq for 02-context-and-cache`) so reverts are surgical.
- One commit per new authority article in E2.
- Run `pnpm translate` after every RU edit; commit RU and EN together (project rule, see CLAUDE.md i18n section).
- Run `pnpm test && pnpm typecheck && pnpm build` before merge.

**Owner-provided values still pending — leave a TODO in `about.md` for each:**
- Confirmed years of Node.js / TypeScript experience.
- List of named projects/clients with permission to mention.
- Confirmed sameAs URLs (LinkedIn, GitHub, X, Telegram).
- Public talks / OSS contributions, if any (otherwise the section is omitted, not faked).

---

# E1 — TL;DR + FAQ backfill (top-10 posts)

## Selection rationale

There are 14 posts; we backfill the top 10 by likely citation value. Skipped: `01-introduction.md` (high-level framing already TL;DR-shaped), `12-travel-agent-blueprint.md` (project-specific blueprint, less quotable in isolation), `14-claims-verification.md` (already a verification table, not a thesis), `claude.md` (TOC, not an article).

Targeted: posts 01–11, 13 (12 posts — pruned to the 10 with strongest standalone information density below). The exclusion of 12 is debatable; if owner disagrees, swap in 12 in place of the weakest performer.

## Frontmatter contract (per spec § 2.4)

For each post, after Plan 3 ships, append two top-level frontmatter keys:

```yaml
summary: "…60–280 chars, single line, quotable…"
faq:
  - question: "…"
    answer: "…20+ chars, plain text, no markdown…"
  - question: "…"
    answer: "…"
  - question: "…"
    answer: "…"
```

Authoring rules:
- `summary` is the answer-first TL;DR. Imagine an LLM asked "what does this post say?" and quoted one sentence back.
- FAQ questions should be the actual questions a developer types into Google or asks Claude. Avoid "What is X?" framing — prefer "Why does X happen?" / "How do I X?" / "Does X support Y?".
- Answers stay plain text (no inline backticks-only-content; minimal punctuation). Each answer should stand alone as a quotable paragraph.
- After RU is committed, run `pnpm translate` to regenerate the EN twin under `src/content/posts/en/`.

---

### 1. `src/content/posts/01-introduction.md`

**Current title:** "01. Что такое Claude Code: harness, agent loop и ваше место в нём"

**Draft summary (181 chars):**
```
Claude Code — это harness вокруг LLM, а не сама модель. Модель решает, какой tool вызвать; harness исполняет, возвращает результат и ведёт agent loop до финального ответа.
```

**Draft FAQ:**
```yaml
faq:
  - question: "Чем агент отличается от чат-бота?"
    answer: "Чат-бот — это model.complete(messages): принимает текст, возвращает текст. Агент — это цикл, в котором модель сама решает, какой tool вызвать (Read, Bash, MCP), получает результат и продолжает работу до финального ответа. Этот цикл называется agent loop."
  - question: "Что такое harness в Claude Code?"
    answer: "Harness — локальная программа (Claude Code CLI или IDE-плагин), которая собирает промпт, исполняет tool calls модели, спрашивает разрешения, управляет кэшем и hooks. Сама модель находится в облаке Anthropic и доступа к диску не имеет."
  - question: "Может ли модель напрямую читать файлы?"
    answer: "Нет. Когда говорят «модель прочитала файл», это короткая запись для: модель сделала tool_use Read, harness прочитал файл и вернул содержимое в tool_result. Никакого прямого доступа модели к файловой системе не существует."
```

---

### 2. `src/content/posts/02-context-and-cache.md`

**Current title:** "02. Контекстное окно и prompt cache"

**Draft summary (199 chars):**
```
Контекстное окно — это и деньги, и качество. Стандарт Opus/Sonnet 4.6 — 200k токенов; 1M доступен через alias opus[1m]/sonnet[1m]. Prompt cache режет счёт в 10 раз, но живёт всего 5 минут по умолчанию.
```

**Draft FAQ:**
```yaml
faq:
  - question: "Сколько токенов помещается в контекстное окно Claude?"
    answer: "Стандартное окно у Opus 4.7, Opus 4.6 и Sonnet 4.6 — 200000 токенов; 1M доступен только через alias opus[1m] или sonnet[1m] на тарифах Max/Team/Enterprise. Haiku 4.5 — только 200k. Окно делится между input и output."
  - question: "Сколько живёт prompt cache в Claude Code?"
    answer: "По умолчанию 5 минут с момента последней записи. Cache write 5 min стоит 1.25× от input-цены, cache read — 0.1× input. Можно расширить до 1 часа за счёт cache write 2× input. После истечения TTL префикс инвалидируется и считается заново."
  - question: "Почему включать 1M-окно «по умолчанию» — плохая идея?"
    answer: "Помимо линейного роста стоимости input-токенов, по эмпирике после 300–400k качество reasoning заметно падает. Anthropic не рекомендует «всегда 1M». Включайте его осознанно для конкретной задачи, отключайте через CLAUDE_CODE_DISABLE_1M_CONTEXT=1."
```

---

### 3. `src/content/posts/03-claude-md.md`

**Current title:** "03. CLAUDE.md: уровни, импорты, авто-память"

**Draft summary (213 chars):**
```
CLAUDE.md — это «paste this every time» в красивой обёртке: автоматический префикс для каждой сессии. У него пять уровней (managed, user, project, local, subdirectory), они конкатенируются, а не перезаписывают друг друга.
```

**Draft FAQ:**
```yaml
faq:
  - question: "Какие уровни CLAUDE.md существуют и как они приоритезируются?"
    answer: "Уровней пять: managed (enterprise-политики), user (~/.claude/CLAUDE.md), project (./CLAUDE.md), project-local (./CLAUDE.local.md, не коммитится) и subdirectory (./packages/api/CLAUDE.md). Все найденные файлы конкатенируются, более специфичные не перезаписывают, а добавляются."
  - question: "Поддерживает ли CLAUDE.md @-импорты?"
    answer: "Да. Используйте @./path/to/file.md для подключения отдельного файла. Импорты рекурсивны до 5 уровней вложенности. Это позволяет фрагментировать большой контекст и подгружать только релевантные части в нужный момент."
  - question: "Какой максимальный разумный размер CLAUDE.md?"
    answer: "Целиться нужно в 50–150 содержательных строк. CLAUDE.md свыше 5–10 KB начинает «тонуть в шуме»: модель помещает его в контекст, но перестаёт им управлять, чаще игнорирует свежие подсказки. Длинные специфичные правила лучше выносить в скиллы."
```

---

### 4. `src/content/posts/04-skills.md`

**Current title:** "04. Skills: SKILL.md, scripts, references"

**Draft summary (203 chars):**
```
Skill — это директория с SKILL.md и опциональными scripts/references/templates, а не один markdown-файл. Краткое описание скилла попадает в каждый запрос; полный SKILL.md «раскрывается» только когда задача подходит.
```

**Draft FAQ:**
```yaml
faq:
  - question: "Skill — это файл или директория?"
    answer: "Директория. Обязательный SKILL.md с YAML frontmatter (name, description, allowed-tools, model, effort) плюс опциональные scripts/, references/, templates/. Утверждение «skill — это просто markdown-файл» — упрощение: скилл может запускать произвольные скрипты через Bash."
  - question: "Когда Claude решает подгрузить скилл?"
    answer: "Когда формулировка задачи семантически совпадает с полем description в SKILL.md. Поэтому description — самое важное поле frontmatter: пишите его в формате «когда пользователь просит X, использовать Y». Скиллы можно запускать и явно через /skill name (user-invoked)."
  - question: "Чем skill отличается от CLAUDE.md?"
    answer: "CLAUDE.md — статический префикс, влетающий в каждый запрос. Skill — модульный плейбук, который подгружается по необходимости. У вас может быть 50 скиллов в проекте, и в основной контекст попадут только их краткие описания (name + description) — сами SKILL.md раскроются только при срабатывании."
```

---

### 5. `src/content/posts/05-hooks.md`

**Current title:** "05. Hooks: детерминированный контроль над agent loop"

**Draft summary (220 chars):**
```
Hooks — это git hooks для Claude Code: точки в lifecycle, в которых harness гарантированно исполнит ваш скрипт. В Claude Code v2.1.89 их 28+ событий, exit code 2 блокирует действие модели, JSON-ответ {"action":"block"} делает то же.
```

**Draft FAQ:**
```yaml
faq:
  - question: "Чем hooks отличаются от skills?"
    answer: "Skill — рекомендация модели (вероятностная: модель может проигнорировать). Hook — программный триггер harness'а, который случится гарантированно. Hooks дают железную дисциплину, но тормозят, если повешены на каждое событие; skills гибче, но непредсказуемее."
  - question: "Как hook может заблокировать действие модели?"
    answer: "Двумя способами. Exit code 2 со стандартным выводом stderr: harness вернёт это сообщение в модель как ошибку, и модель сама решит, что делать дальше. Альтернатива — JSON-ответ вида {\"action\":\"block\",\"reason\":\"…\"}: эффект аналогичный, но позволяет передавать структурированные данные."
  - question: "Сколько событий поддерживают hooks в Claude Code?"
    answer: "В v2.1.89 — 28+ событий жизненного цикла, включая SessionStart, PreToolUse, PostToolUse, UserPromptSubmit, Notification, Stop, SubagentStop, PreCompact, и так далее. Утверждение «их 6» из ранних туториалов сильно устарело: реальный список значительно богаче."
```

---

### 6. `src/content/posts/06-mcp.md`

**Current title:** "06. MCP-серверы"

**Draft summary (212 chars):**
```
MCP (Model Context Protocol) — «USB-C для AI-интеграций»: пишете сервер один раз, его потребляют Claude Code, Claude Desktop, Cursor, Continue, custom SDK. Три транспорта (stdio, SSE, HTTP); экспортируются tools, resources, prompts, elicitation.
```

**Draft FAQ:**
```yaml
faq:
  - question: "Какие транспорты поддерживает MCP и какой выбрать?"
    answer: "Три: stdio (harness запускает сервер как child process — для локальной разработки), SSE (persistent connection с streaming — для удалённых серверов), HTTP (stateless request/response — для multi-tenant SaaS). Большинство серверов используют stdio: проще, быстрее, без сетевых проблем."
  - question: "Что MCP-сервер может экспортировать кроме tools?"
    answer: "Помимо tools (функции, которые модель вызывает) — resources (данные, которые модель может прочитать через URI вроде config://app/settings), prompts (преднастроенные шаблоны, появляются как slash-команды), elicitation (серверо-инициированные диалоги с пользователем). Claude Code потребляет tools и resources активнее всего."
  - question: "Как тестировать MCP-сервер локально?"
    answer: "Команда claude mcp test <name> запускает сервер, выполняет initialize-handshake и выводит список tools/resources. Для сервера в репозитории сначала pnpm build, затем добавьте конфигурацию в .mcp.json (тип stdio, command, args, env), и Claude Code подхватит сервер при следующем запуске."
```

---

### 7. `src/content/posts/07-plugins.md`

**Current title:** "07. Plugins: упаковка skills + hooks + agents + MCP"

**Draft summary (197 chars):**
```
Plugin — npm-пакет для Claude Code: упаковка skills, hooks, subagents, slash-команд и MCP-конфига в одну версионируемую сущность. Манифест .claude-plugin/plugin.json, установка через /plugin install, маркетплейсы.
```

**Draft FAQ:**
```yaml
faq:
  - question: "Зачем нужны плагины, если можно просто закоммитить .claude/?"
    answer: "Плагины решают проблему переиспользования между репозиториями и командами. Один источник истины, версионирование через семвер, обновление в один клик через /plugin update. Без плагинов вы копипастите .claude/ из проекта в проект и расходитесь по версиям."
  - question: "Что входит в манифест plugin.json?"
    answer: "Минимум: name, version (semver), description. Дополнительно — author, repository, claude_code_version (минимальная версия CLI), keywords, license. Этот файл — единственный обязательный артефакт; всё остальное (skills/, agents/, hooks/, .mcp.json) опционально и подхватывается harness'ом из стандартных директорий."
  - question: "Можно ли публиковать плагины в публичный маркетплейс?"
    answer: "Да. Существует публичный реестр и возможность держать приватные внутрикорпоративные маркетплейсы. Установка из публичного: /plugin install github:org/repo@v1.2.3. Для приватных — настраиваемый registry URL и аутентификация. Это лучше, чем git submodule."
```

---

### 8. `src/content/posts/08-tool-calls-and-loop.md`

**Current title:** "08. Tool calls и agent loop под капотом"

**Draft summary (208 chars):**
```
Tool call — фундаментальный механизм, превращающий LLM из чат-бота в агента. Модель возвращает не текст, а tool_use block; harness исполняет вызов и возвращает tool_result. Поняв этот цикл, вы понимаете 80% работы любого AI-агента.
```

**Draft FAQ:**
```yaml
faq:
  - question: "Как выглядит tool_use block от модели?"
    answer: "Это JSON со stop_reason равным tool_use, в content которого есть блок типа tool_use с уникальным id, name инструмента и input — параметрами, удовлетворяющими input_schema. Harness берёт этот блок, исполняет инструмент, и формирует tool_result block с тем же tool_use_id для следующего шага диалога."
  - question: "Что такое permissions в Claude Code и как они устроены?"
    answer: "Три уровня: allow (выполнять без подтверждения), ask (спросить у пользователя), deny (запрещено всегда, нельзя обойти даже в bypassPermissions). Permissions конфигурируются в settings.json по matcher-паттернам — например, Bash(pnpm test*) или Edit(.env*). Deny — финальный приговор."
  - question: "Что значит stop_reason в ответе модели?"
    answer: "Это маркер причины завершения хода. Основные значения: end_turn (модель ответила и не хочет ничего больше делать), tool_use (модель просит harness исполнить инструмент), max_tokens (упёрлись в лимит — output обрезан), pause_turn (модель сама взяла паузу для thinking). Harness реагирует на каждое значение по-своему."
```

---

### 9. `src/content/posts/09-subagents.md`

**Current title:** "09. Subagents: изолированные агентные циклы"

**Draft summary (218 chars):**
```
Subagent — мини-сессия Claude Code со своим контекстом и system prompt. В основной контекст возвращается только финальный summary. Это спасение от переполнения окна на browse-heavy задачах и причина неожиданных счетов, если запускать их без меры.
```

**Draft FAQ:**
```yaml
faq:
  - question: "Когда subagent оправдан, а когда — лишний?"
    answer: "Оправдан на browse-heavy задачах (Grep по 200 совпадений, чтение 30 файлов): промежуточные tool_results остаются в его контексте, в основной возвращается только summary. Лишний на коротких задачах из 1–2 шагов: накладные расходы на отдельный вызов API превышают экономию контекста."
  - question: "Через какой tool Claude вызывает subagent?"
    answer: "Через built-in Agent (раньше назывался Task; в v2.1.63 переименован, Task сохранён как алиас). Параметры: subagent_type (например, Explore, Plan, general-purpose или ваш кастомный из .claude/agents/), description, prompt. Также можно передать isolation: \"worktree\" для запуска в отдельном git worktree."
  - question: "Можно ли запускать несколько subagents параллельно?"
    answer: "Да. Положите несколько Agent tool_use в одно assistant-message — harness исполнит их параллельно. Это полезно для независимых задач (поиск в разных частях репо, проверка нескольких MCP-серверов). Параллельные subagents разделяют между собой только финальный merge их summary в основной контекст."
```

---

### 10. `src/content/posts/11-models-and-pricing.md`

**Current title:** "11. Модели и pricing"

**Draft summary (227 chars):**
```
Выбор модели — компромисс скорость/стоимость/качество, а не «всегда Opus». Cache read стоит 0.1× input (10× дешевле), output ~5× input. Opus 4.7 имеет новый токенизатор (+35% токенов на тех же текстах), на Bedrock/Vertex дефолтные алиасы сдвинуты на версию назад.
```

**Draft FAQ:**
```yaml
faq:
  - question: "Какая разница в цене между Opus, Sonnet и Haiku?"
    answer: "На апрель 2026 input/output за миллион токенов: Opus 4.7/4.6 — $5/$25, Sonnet 4.6 — $3/$15, Haiku 4.5 — $1/$5. Cache read везде 0.1× input. Output обычно стоит 5× input. Sonnet — 80% повседневных задач, Opus — архитектура и сложный reasoning, Haiku — поиск и первичные read'ы."
  - question: "Почему Opus 4.7 расходует больше токенов, чем 4.6?"
    answer: "У Opus 4.7 новый токенизатор: на одних и тех же текстах он расходует до +35% токенов по сравнению с 4.6. Если у вас были оценки бюджета на 4.6 — пересчитайте. На Bedrock/Vertex/Foundry алиасы opus/sonnet сдвинуты на одну версию назад: указывайте полное имя модели для свежих."
  - question: "Что такое режим opusplan и как он работает?"
    answer: "Это plan mode на Opus с автоматическим переключением на Sonnet после ExitPlanMode: дорогая модель планирует, дешёвая реализует. Включается через /model opusplan или Shift+Tab. Важно: opusplan не поддерживает 1M-окно — plan-фаза работает в стандартных 200k, даже если 1M включено глобально."
```

---

### Bonus (substitute slot if owner prefers): `src/content/posts/13-best-practices.md`

If owner wants to swap one of the 10 above for the practices article (cluster reach), use:

**Current title:** "13. Best practices: ежедневная рутина и антипаттерны"

**Draft summary (217 chars):**
```
Дисциплина важнее конфигурации: «одна задача — одна сессия», /clear после задачи, plan mode для незнакомого, /cost в конце дня. Топ-3 «убийц кошелька» — teammate в цикле, дефолтное 1M-окно и кэш мимо из-за {{date}} в CLAUDE.md.
```

**Draft FAQ:**
```yaml
faq:
  - question: "Что значит «одна задача — одна сессия»?"
    answer: "После завершения логически законченной задачи делайте /clear или открывайте новую сессию. Если контекст копит «всё подряд за день», ухудшается качество, растёт стоимость кэширования и теряется фокус. Plan-фаза, реализация и code review одной фичи — нормально в одной сессии; разные фичи — нет."
  - question: "Какие три типичные причины внезапно большого счёта за месяц?"
    answer: "Первая — запущенный teammate (agent team), который ушёл в цикл, ловится hook'ом TeammateIdle. Вторая — 1M-окно «по умолчанию»: каждая итерация платит линейно по input. Третья — кэш мимо из-за динамики в CLAUDE.md (например, {{date}}): любое изменение байт инвалидирует префикс."
  - question: "Какой максимальный размер CLAUDE.md, прежде чем модель его «не видит»?"
    answer: "Эмпирическая граница — около 5–10 KB. Файл всё ещё помещается в контекст, но утопает в шуме: модель чаще игнорирует свежие подсказки, использует устаревшие паттерны. Целиться нужно в 50–150 содержательных строк; длинные правила выносите в .claude/skills/<topic>/SKILL.md."
```

---

## E1 backfill checklist (per post)

- [ ] Read post end-to-end. Confirm the draft summary actually reflects the thesis.
- [ ] Confirm each FAQ answer is fully grounded in the post body (no fabrication).
- [ ] Add `summary:` and `faq:` keys to RU frontmatter.
- [ ] Run `pnpm typecheck` (zod will reject malformed shapes).
- [ ] Run `pnpm translate` to regenerate the EN twin under `src/content/posts/en/`.
- [ ] Spot-check the EN translation: hand-edit if a technical term ("harness", "agent loop") came back wrong; if you do, add `manuallyEdited: true` to EN frontmatter.
- [ ] Commit RU + EN together: `docs(content): backfill summary+faq for <NN>-<slug>`.

---

# E2 — Three new authority articles

Selection criteria: each article should (a) widen topical coverage beyond Claude Code, (b) showcase a different epistemic mode (postmortem / benchmark / deep-dive), (c) lean on something the owner has actually built or measured (visible in the repo).

The three picks:

1. **Postmortem** — "robots.txt for AI crawlers in 2026" — lived experience from EPIC A, factual, useful as a reference.
2. **Benchmark** — "Mermaid → SVG via Playwright at build time: cold-start, cache, and SSG cost" — a measurable build-time problem this site already solved.
3. **Deep-dive** — "JSON-LD `@graph` in Astro: from inline duplicates to a single citable node" — directly mirrors the EPIC A architecture and demonstrates schema thinking.

Rejected from the candidate list and why:
- Pagefind indexing postmortem — currently only 14 posts; not enough scale to make claims interesting yet. Revisit at 50+ posts.
- Astro 5 i18n architecture — already covered exhaustively in `docs/superpowers/specs/2026-04-27-bilingual-ru-en-design.md`; would duplicate.
- Drizzle + Postgres 18 admin — admin is private, code is small, hard to write authoritatively without leaking schema choices.
- "Why I avoided `class` in 4000 lines of TypeScript" — opinion piece, weak authority signal without code metrics. Could ship later as a v2.

---

## E2-A — Postmortem: `robots.txt` for AI crawlers in 2026

**Working titles**
- RU: "robots.txt в эпоху AI-краулеров: GPTBot, ClaudeBot, PerplexityBot — реальность 2026"
- EN: "robots.txt in the AI-crawler era: GPTBot, ClaudeBot, PerplexityBot in 2026"

**Cluster:** Cross-cluster — sits at the intersection of SEO, AI-engineering, and web-platform.

**Audience:** (a) An LLM crawler asked "should I crawl this page?" — reads the post for policy. (b) An engineer maintaining a personal site or company blog who wants to allow AI training/answer crawlers consciously rather than by default.

**Thesis (1 paragraph):**
В 2026 robots.txt — это не «запретить ботам всё» и не «открыть всё». Это политика по каждому из 9+ именованных агентов: GPTBot (OpenAI training), OAI-SearchBot (OpenAI answers), ChatGPT-User (on-demand fetches), ClaudeBot (Anthropic crawler), Claude-Web/anthropic-ai (Anthropic on-demand), PerplexityBot, Perplexity-User, Google-Extended (Gemini opt-in), Bingbot. Каждое решение — частный случай: открываете ли вы свой контент для тренировки моделей? Для on-demand цитирования? Что вы хотите, чтобы Perplexity показал в карточке ответа? Этот пост — таблица решений по каждому боту, готовый шаблон robots.txt и обсуждение того, почему llms.txt — отдельный артефакт (не замена), и зачем нужны namespace-disallow для /admin, /api, /login.

**H2 outline (8 sections):**
1. Зачем переписывать robots.txt в 2026 — короткий бэкграунд про сдвиг от классического SEO к AI-citation.
2. Список именованных AI-краулеров и их назначение — таблица 9+ ботов с производителем, целью (training / answering / on-demand) и официальной документацией.
3. Решения по каждому боту — таблица «Allow/Disallow + почему», с примерами: разрешение ChatGPT-User, но осознанное Disallow для GPTBot, если не хотите тренировки.
4. Готовый шаблон robots.txt — копи-паст блок с комментариями по каждому User-agent.
5. Disallow-namespace'ы (`/admin/`, `/api/`, `/login`) — почему это важнее, чем решение по конкретному боту.
6. `llms.txt` и `llms-full.txt` — почему это другой контракт (политика и AI-README), а не дубликат robots.txt.
7. Чего robots.txt не контролирует — IP-block нужен для ботов, не уважающих robots; Cloudflare AI Audit для аудита; meta-теги `noai`/`noimageai` (статус и ограничения).
8. Чек-лист аудита — 5 шагов, которые повторяете раз в полгода.

**Evidence/data points to include (real, not fabricated):**
1. Точные имена User-agent-строк всех 9 ботов из их официальных страниц (OpenAI's GPTBot page, Anthropic's `claudebot.anthropic.com/`, Perplexity docs). Цитата с датой проверки.
2. Реальный robots.txt сайта на момент публикации — взять из `public/robots.txt` после Plan-1.
3. Реальный `llms.txt` сайта — взять из `public/llms.txt` после Plan-1.
4. Скриншот выдачи `curl -A "GPTBot" -s -o /dev/null -w "%{http_code}\n" https://artka.dev/admin/` показывающий 403 (или 404, в зависимости от middleware) — доказательство, что namespace-deny работает.
5. Фрагмент access-логов с реальными User-Agent-строками от перечисленных ботов за последние 30 дней (если доступны; иначе пометить как `(owner to fill: extract from access log if logging is enabled)`).

**Estimated word count:** 1800–2400 слов.
**Writing effort:** ~3–4 часов чистого письма + 1 час на сверку UA-строк по официальным источникам.
**Dependencies:** Plan 1 должен быть смержен (тогда robots.txt и llms.txt стабильно опубликованы).

---

## E2-B — Benchmark: Mermaid → SVG via Playwright at build time

**Working titles**
- RU: "Mermaid → SVG через Playwright на билд-тайме: холодный старт, кэш и стоимость SSG"
- EN: "Mermaid to SVG via Playwright at build time: cold start, cache, and the SSG cost"

**Cluster:** Build-tooling / Astro / static-site-generation.

**Audience:** (a) An LLM crawler asked "what's the cost of build-time Mermaid rendering?" — reads the numbers. (b) A developer evaluating `rehype-mermaid` / `mermaid-isomorphic` / client-side mermaid for their Astro/Next/MkDocs site.

**Thesis (1 paragraph):**
Mermaid-диаграммы — это плохой client-side opex (большой JS-бандл, FOUC, hydration cost) и отличный build-time deal, если вы готовы заплатить cold-start Playwright раз за билд. На этом сайте `rehype-mermaid` через Playwright рендерит ~N диаграмм за ~T секунд при холодном кэше и ~T2 секунд при тёплом. Этот пост — конкретные цифры (CPU, wall-time, размер кэша), сравнение с альтернативами (mermaid-cli, client-side mermaid, headless-Chrome via puppeteer), причины выбрать именно Playwright и набор «ловушек», в которые вы попадёте на CI (отсутствие GPU, missing Chrome deps, fontconfig).

**H2 outline (7 sections):**
1. Зачем рендерить Mermaid build-time, а не client-side — таблица trade-offs (TTI, бандл, SEO).
2. Архитектура `rehype-mermaid` + Playwright — короткая диаграмма (rehype walks AST → Playwright launches → Mermaid renders в DOM → SVG serialised → встраивается в HTML).
3. Холодный старт vs тёплый — таблица замеров (см. evidence ниже).
4. Стоимость на CI — Docker-image overhead Playwright (~600 MB), runtime, варианты mitigations (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` + system Chrome).
5. Кэширование SVG — где они кэшируются (file-based кэш rehype-mermaid в `.cache/mermaid/`), invalidation по hash diagram source.
6. Альтернативы и почему они не подошли — `mermaid-cli` (нет cache), client-side (бандл), `mermaid-isomorphic` (новая, не покрывает всех типов диаграмм).
7. Чек-лист «что замерить, прежде чем выбирать» — 5 пунктов: количество диаграмм, частота правок, CI-платформа, целевой размер бандла, требования к интерактиву.

**Evidence/data points to include (real, not fabricated):**
1. Точные числа: количество Mermaid-диаграмм во всех 14 постах (`grep -c '^```mermaid' src/content/posts/*.md` → конкретное число).
2. Wall-time билда: `time pnpm build` на холодном кэше vs `time pnpm build` на тёплом (запустить локально, замерить трижды, взять median).
3. Размер `.cache/mermaid/` после полного билда — `du -sh .cache/mermaid/` или эквивалент.
4. Размер каждого сгенерированного SVG (среднее, медиана, max) — `find dist -name '*.svg' -size +1k | xargs wc -c | sort -n`.
5. Опциональный (`owner to fill`): время билда на GitHub Actions ubuntu-latest vs локально (если CI public).
6. Конфиг блок: реальный фрагмент `astro.config.ts` с `rehype-mermaid` + `playwright` config (без секретов).

**Estimated word count:** 1500–2000 слов.
**Writing effort:** ~3 часа письма + 1.5 часа на замеры (запустить билд несколько раз, собрать таблицу).
**Dependencies:** ничего, можно писать прямо сейчас.

---

## E2-C — Architecture deep-dive: JSON-LD `@graph` in Astro

**Working titles**
- RU: "JSON-LD `@graph` в Astro: от дублирующихся inline-блоков к единому citable-узлу"
- EN: "JSON-LD `@graph` in Astro: from inline duplicates to a single citable node"

**Cluster:** SEO / structured-data / Astro / LLM-citability.

**Audience:** (a) An LLM crawler — собственно эталон того, как делается site-wide schema graph; (b) Developer на Astro/Next/Hugo/Eleventy, который видит per-page inline JSON-LD и понимает, что что-то не так.

**Thesis (1 paragraph):**
Большинство руководств по Schema.org для блогов учат: на странице поста — один `<script type="application/ld+json">` с `BlogPosting`, на главной — другой с `WebSite`, на about — третий с `Person`. Это работает, но проигрывает в citability: краулер видит `Person` из `BlogPosting.author` как «кто-то по имени X», а не как «entity #person, который ещё и founder of #organization, который publisher of #blog». Этот пост — пошаговый разбор, как заменить per-page inline-блоки одним `@graph` в `BaseLayout`, эмитящим `Person#me`, `Organization#brand`, `WebSite#site` со стабильными `@id` плюс page-level `BlogPosting`/`WebPage`-узлы, ссылающиеся на глобальные через `@id`. Реальный код, реальная диаграмма, измерение «было/стало» по weight HTML и по полноте графа.

**H2 outline (7 sections):**
1. Зачем менять — citability vs SERP. Краткий контекст: LLM extracting passages смотрит на entity disambiguation, не на keyword density.
2. Антипаттерн: per-page inline schema. Что emit'ит классический Astro-блог по умолчанию (включая дефолтные `@astrojs/sitemap` / шаблоны).
3. Целевая архитектура — `@graph` с глобальными `@id`. Диаграмма: `Person#me` ←author— `BlogPosting#post`, `Organization#brand` ←publisher— `BlogPosting#post`, `WebSite#site` ←about— `Person#me`.
4. Реализация в Astro 5 — `src/lib/seo/schema.ts` с pure-functional `buildGraph(input)`, `BaseLayout` принимает `extraSchemaNodes` prop, эмитит ровно один `<script type="application/ld+json">`.
5. `articleBody` для `BlogPosting` — почему 800-word excerpt (не полный, не 50 слов): trade-off между HTML weight и extractable chunk.
6. `FAQPage` как side-effect MDX-компонента `<Faq>` — frontmatter.faq → JSON-LD автоматически, без author cognitive load.
7. Замеры до/после — размер HTML, число `@id`-ссылок, поведение в Google Rich Results Test и Schema.org validator.

**Evidence/data points to include (real, not fabricated):**
1. Реальный код `src/lib/seo/schema.ts` (фрагмент, без секретов) после Plan-1.
2. До/после: размер скомпилированной страницы поста в KB (`ls -la dist/blog/01-introduction/index.html` до и после миграции).
3. До/после: количество `<script type="application/ld+json">` блоков на странице (1 vs 3+).
4. Скриншот валидации в Google Rich Results Test или Schema.org validator до и после.
5. Реальный JSON-LD `@graph` со страницы поста — вставить целиком (он же помещается в ~3 KB).
6. Цитата из spec — `docs/superpowers/specs/2026-05-02-llm-citable-blog-design.md` § "Schema-graph design", чтобы статья ссылалась на собственный spec.

**Estimated word count:** 2000–2600 слов.
**Writing effort:** ~4 часа письма + 1 час на замеры/скриншоты.
**Dependencies:** Plan 1 должен быть смержен (только тогда есть `src/lib/seo/schema.ts` и реальный `@graph` для цитирования).

---

## E2 frontmatter contract (all three articles)

```yaml
---
title: "<RU title>"
description: "<60–200 chars, mirrors summary first sentence>"
summary: "<60–280 chars, see drafts above>"
keywords: ["<3–7 semantic keywords, distinct from tags>"]
faq:
  - question: "..."
    answer: "..."
  # 3–5 items
pubDate: 2026-05-…
tags: ["<see tag taxonomy below>"]
cover: "/covers/<slug>.png"     # 1200x630 PNG, see "Editorial discipline"
coverAlt: "<descriptive alt, ≤120 chars>"
lang: "ru"
draft: false
---
```

---

# E3 — `src/content/site/about.md` expansion

## Current state

14 lines. Single H1, four bullets ("Чем занимаюсь"), one mailto. This is enough for `Person#me.name + email`, nowhere near enough for `knowsAbout[]`, `jobTitle`, `description`, `image`, `sameAs[]` — all of which the spec requires for the schema graph.

## Target state

A rich `Person` profile that doubles as (a) human-readable bio and (b) ground truth for the JSON-LD graph builder.

## Section structure to add (h2 headings)

1. `## Кто я` — 1 paragraph, 60–120 words. The "narrative description" Schema.org `Person.description` consumes.
2. `## Опыт` — bulleted timeline of named projects/clients with role and outcome. Powers `knowsAbout[]` and gives citation-worthy specifics.
3. `## Стек` — concrete tech list with versions. Powers `knowsAbout[]` semantic depth.
4. `## Публичные выступления и open source` — talks, OSS contributions, PRs. Powers authority signal. **Omit entirely if the owner has none — do not invent.**
5. `## Контакты` — keep existing email; add social links once owner confirms `sameAs` URLs.

## Per-section prompts for the owner

The author writes prose; the agent does not invent facts. For each section the owner answers these prompts:

### `## Кто я`
- Сколько лет вы пишете на Node.js? На TypeScript? Раньше что было?
- Какой ваш «specialism в одном предложении» — backend / AI agents / distributed / DevOps?
- В каком регионе/часовом поясе работаете (для контекстуализации, не обязательно)?
- Hire-status: open to work / consulting / not looking?

### `## Опыт`
- Назовите 3–5 проектов или работодателей, которых вы можете публично упомянуть. Для каждого:
  - Название (или «Крупный e-commerce игрок СНГ» если NDA).
  - Роль (Senior backend engineer / Tech lead / Solo founder / etc).
  - Период (yyyy–yyyy).
  - 1–2 строки про вклад (что вы построили, какой outcome — производительность, надёжность, фичи).

### `## Стек`
- Языки и фреймворки, на которых вы работаете каждый день, с версиями. Например: Node.js 24 LTS, TypeScript 5.9, Astro 5, PostgreSQL 18, Drizzle ORM, Better-Auth.
- Облака / orchestration / DevOps tooling: AWS / GCP / Self-hosted? Docker, Kubernetes, GitHub Actions?
- AI tooling: Claude Code, Anthropic API, custom MCP-серверы?

### `## Публичные выступления и open source`
- Доклады на митапах/конференциях (название, событие, дата, ссылка на видео/слайды если есть).
- Публикации в чужих блогах / hash node / dev.to.
- Notable PRs в open source — owner предоставляет ссылки на 3–5 PR.
- **Если ничего из этого нет — секция просто не существует. Не выдумывать.**

### `## Контакты`
- Email (есть: a@artka.dev).
- LinkedIn URL?
- GitHub username?
- X/Twitter handle?
- Telegram channel/handle (если публичный)?

---

## Sample filled-in version (PLACEHOLDER FACTS)

> All numbers/projects below are explicitly placeholders. Do not commit until owner verifies.

```markdown
---
title: Обо мне
description: "Об авторе: Node.js/TypeScript разработка, AI-автоматизации, архитектура распределённых систем. Около (owner to fill: N) лет опыта."
---

# Обо мне

## Кто я

Артём Кашута — backend-инженер с фокусом на AI-агентскую инженерию и распределённые системы. Пишу на TypeScript и Node.js около (owner to fill: years of Node.js) лет; до этого работал на (owner to fill: previous languages — Go? Python? Java?). Базируюсь в (owner to fill: timezone), сейчас (owner to fill: open to consulting / employed at X / building Y solo).

Этот блог — публичный side-channel моих заметок по Claude Code, Astro и infrastructure: что узнал — публикую, проверяю по официальной документации, помечаю спорное.

## Опыт

- **(owner to fill: project/employer name)** — (owner to fill: role), (owner to fill: yyyy–yyyy). (owner to fill: 1-2 строки про вклад).
- **(owner to fill: project/employer name)** — (owner to fill: role), (owner to fill: yyyy–yyyy). (owner to fill: 1-2 строки про вклад).
- **(owner to fill: project/employer name)** — (owner to fill: role), (owner to fill: yyyy–yyyy). (owner to fill: 1-2 строки про вклад).

## Стек

Каждый день работаю с:

- **Языки:** TypeScript 5.9 (strict), Node.js 24 LTS.
- **Backend:** Hono / Express / (owner to fill: confirm); PostgreSQL 18 + Drizzle ORM; Better-Auth (после deprecation Lucia в 2025).
- **Frontend:** Astro 5 (SSG + on-demand), Tailwind CSS 4.
- **AI tooling:** Anthropic SDK (Opus 4.7 / Sonnet 4.6 / Haiku 4.5), Claude Code, кастомные MCP-серверы.
- **Infrastructure:** Docker, GitHub Actions, ghcr.io, Dokploy.
- **Тесты:** Vitest 3, Playwright.

## Публичные выступления и open source

(owner to fill: omit this section entirely if there is nothing to put here. Do not write «нет публичных выступлений» — просто удалите H2.)

- (owner to fill: talk title, event, date, link to recording/slides).
- (owner to fill: notable OSS PR with link).

## Контакты

- Email: [a@artka.dev](mailto:a@artka.dev)
- LinkedIn: (owner to fill)
- GitHub: (owner to fill)
- X / Twitter: (owner to fill)
- Telegram: (owner to fill: if public)
```

## E3 acceptance criteria

- [ ] All `(owner to fill: …)` placeholders replaced with real facts or removed.
- [ ] Final word count between 200 and 600 words (long enough to be `Person.description`-quotable, short enough that it doesn't read like a CV).
- [ ] No fabricated talks, OSS contributions, or projects.
- [ ] `pnpm translate` regenerates `src/content/site/en/about.md`.
- [ ] After Plan-2 ships, the schema-graph builder reads from `about.md` frontmatter (`description`) and structured fields — confirm `Person#me.description` reflects the new prose.

---

# Editorial discipline

These rules apply to every new post (E2) and every E1 backfill where applicable.

1. **`summary` and `faq[]` from day one.** Both fields are required for posts dated after 2026-05-02 (enforced by Vitest test once Plan 3 ships). Pre-2026-05-02 posts are exempted but get backfilled in E1.
2. **`cover` image and `coverAlt` are required.** 1200×630 PNG/JPG/WebP under `public/covers/<slug>.<ext>`. `coverAlt` ≤120 chars, descriptive (not "cover for post X" — what does the image *show*?).
3. **`pnpm translate` before merge.** RU is source of truth. EN twin must be in the same commit as the RU change. CI runs `pnpm translate:check` and will fail if EN drifts.
4. **No new tags casually.** The current tag set is `claude-code`, `guide`. New tag proposals must be justified:
   - `seo` — для E2-A (robots.txt) и E2-C (JSON-LD). Useful for cluster archives.
   - `astro` — для E2-B (Mermaid pipeline) и E2-C. Existing posts are about Claude Code; Astro is a separate cluster forming.
   - `build-tooling` — для E2-B specifically. Probably overlaps with `astro`; collapse to `astro` unless three posts demand it.
   - `architecture` — для E2-C. Could be useful as a cluster but currently only one post would carry it; defer.
   - **Decision: introduce `seo` and `astro`. Skip `build-tooling` and `architecture` for now (one-post tags hurt rather than help cluster signal).**
5. **One H1 per post — discipline test.** Plan 4 will land a Vitest test that fails if a post body contains `^# ` (top-level h1 in markdown). The frontmatter `title` is the h1; do not duplicate.
6. **No "as we all know" / "obviously" / "simply".** Every claim that sounds load-bearing should have a citation, a measurement, or a "(owner to verify)" annotation.
7. **Code blocks must compile or run.** If you paste a config snippet or shell command, it must work as written. If it's pseudocode, label it `// pseudocode`.

---

# Workflow steps (per new authority article)

A 12-step checklist the owner runs end-to-end:

1. **Brainstorm topic.** Run `superpowers:brainstorming` (10–20 min). Output: 1 thesis paragraph, 5–8 H2 headings.
2. **Outline.** Sketch H2s and 2–3 sub-bullets each. Stop here, don't write yet.
3. **Evidence pass.** For each H2 with a numerical or factual claim, identify the data source (file in repo, command to run, doc to cite, screenshot to capture). If you can't find a source — drop the claim or relabel it as opinion.
4. **Draft RU under `src/content/posts/<NN>-<slug>.md`.** Use the `new-blog-post` skill or the existing post template. Frontmatter includes `title`, `description`, `summary`, `keywords`, `tags`, `pubDate`, `cover`, `coverAlt`, `lang: "ru"`.
5. **Author `summary` and `faq[]` from the start.** Don't defer. The TL;DR forces you to articulate the thesis early; the FAQs surface gaps in coverage.
6. **Add `cover` image** (1200×630 PNG under `public/covers/<slug>.png`) plus `coverAlt`.
7. **Run measurements** for E2-B style benchmarks. Record raw numbers in the post — never paraphrase ("about 3 seconds"). Always: median of 3+ runs, exact values, environment (CPU, RAM, OS).
8. **Run `pnpm translate`.** Inspect EN diff for technical-term bugs. If you hand-edit, set `manuallyEdited: true` in EN frontmatter.
9. **Run `pnpm test && pnpm typecheck && pnpm build`.** Fix any frontmatter zod errors.
10. **Run critic subagent.** `Agent(critic, "Review src/content/posts/<NN>-<slug>.md for: factual claims without evidence, weasel words, missed citation opportunities.")` — fix issues raised.
11. **Commit RU + EN together.** `docs(content): add <slug> (postmortem|benchmark|deep-dive)`.
12. **PR + merge.** No skipping hooks (CLAUDE.md rule); honour pre-commit checks.

---

# Out of scope for this plan

- Any code changes (zod schema, MDX components, `<Tldr>`/`<Faq>` rendering) — those live in Plans 2/3/4.
- New entity pages (`/now`, `/uses`, `/projects`) — Plan 2.
- Tag archive pages and clickable chips — Plan 4.
- Analytics for LLM citation tracking — non-goal per spec.
- Multi-author byline — non-goal per spec.

---

# Acceptance criteria for EPIC E

- [ ] All 10 selected posts have `summary` (60–280 chars) and `faq[]` (3 items each) committed to RU and EN.
- [ ] Three new authority articles merged: one postmortem, one benchmark, one deep-dive — each with cover, summary, faq, EN twin, and at least 3 evidence/data points grounded in real measurements or cited docs.
- [ ] `about.md` rewritten with at least 3 new sections (Кто я, Опыт, Стек) and no `(owner to fill)` placeholders remaining.
- [ ] `pnpm test && pnpm typecheck && pnpm build` green.
- [ ] `pnpm translate:check` green (no EN drift).
- [ ] Schema-graph builder (Plan 1 output) consumes the expanded `about.md` and produces a `Person#me` node with `description`, `knowsAbout[]`, and `sameAs[]` populated.

---

# References

- Spec: `docs/superpowers/specs/2026-05-02-llm-citable-blog-design.md` § Phase 5
- Companion plans: Plans 1 (foundation), 2 (entities), 3 (retrieval), 4 (authority graph)
- Existing posts: `src/content/posts/01-introduction.md` … `14-claims-verification.md`
- About source: `src/content/site/about.md`
- i18n contract: `docs/superpowers/specs/2026-04-27-bilingual-ru-en-design.md`
- Tag display labels: `src/i18n/tags.ru.json`, `src/i18n/tags.en.json`
