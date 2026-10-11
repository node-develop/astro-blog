# Framework для статей artka.dev

Проектная адаптация [AgriciDaniel/claude-blog](https://github.com/AgriciDaniel/claude-blog) помогает агенту пройти путь от источника до проверяемого RU/EN-черновика: исследование → план → текст → критика → исправления → проверка настоящего Astro-сайта. Доступны все 32 исходных skill-entrypoints и пять редакционных ролей. 28 workflows адаптированы; runtime четырёх внешних провайдеров явно отложен. Публикация автоматически не выполняется.

Начните с [договора проекта](CONTRACT.md). [Карта возможностей](CAPABILITIES.md) перечисляет каждый skill, варианты команд, выход и ограничения. [Аудит upstream](UPSTREAM-REVIEW.md) объясняет изменения и покрытие исследования. [Dry run](DRY-RUN.md) показывает проверенный пример и границы результата.

## Как вызвать

Откройте репозиторий в выбранном агенте. Установка в домашний каталог, Python, новые ключи и MCP не нужны.

| Среда | Пример |
| --- | --- |
| Claude Code | `/blog write Почему sourceHash не заменяет ревью перевода` или `/blog-write <тема>` |
| Codex | `$blog write <тема>` или `$blog-write Напиши RU/EN draft по этим источникам: …` |
| Другой агент | Прочитать `AGENTS.md`, затем `.agents/skills/blog/SKILL.md` и соответствующий subskill |

Claude Code читает проектные `.claude/skills/<name>/SKILL.md`; здесь это symlink на общий `.agents/skills/<name>/`. Codex сканирует `.agents/skills`. Эти conventions проверены по [Claude Code docs](https://code.claude.com/docs/en/skills) и [Codex docs](https://learn.chatgpt.com/docs/build-skills). Перезапустите сессию, если новые skills не появились. На checkout без поддержки symlink используйте canonical `.agents/skills` и читайте SKILL.md напрямую; не устанавливайте глобальную копию. Одноимённый личный skill может иметь приоритет в Claude — проверьте путь выбранного skill.

Slash/`$` команды — текстовые инструкции агенту, не shell executable и не новый API сервера. Не каждый флаг upstream имеет CLI-парсер в проекте: варианты в карте описывают задачу и формат результата. Локальные shell-команды перечислены отдельно ниже.

Примеры задач:

- `$blog brief <тема> — изучи первичные документы, предложи полезный угол и перечисли пробелы доказательств.`
- `$blog outline <тема> --type tutorial — используй research.md, покажи проверяемые шаги и реальные внутренние ссылки.`
- `$blog write <тема> — подготовь RU/EN draft в work/, сохрани источники, не выдумывай мой личный опыт; код без запуска пометь фрагментом.`
- `$blog factcheck docs/blog-framework/work/<slug>/<slug>.md — сопоставь каждый существенный тезис с точным местом источника.`
- `$blog rewrite <файл> — исправь замечания critique.md, сохрани URL/pubDate и синхронизируй EN; результат отдельным draft.`
- `$blog locale-audit src/content/posts — проверь пары RU/EN и реальный hreflang; только отчёт.`
- `$blog flow prompts — выбери релевантный сохранённый prompt, соблюдай договор проекта; sync не выполнять.`
- `$blog google gsc — проанализируй предоставленный обезличенный экспорт; к аккаунту не подключаться.`

## Что создаёт агент

```text
docs/blog-framework/work/<slug>/
  research.md          # claim → source → version/date → caveat
  outline.md           # sourced outline and intended reader result
  <slug>.md            # RU, lang: ru, draft: true
  en/<slug>.md         # EN, manuallyEdited: true, sourceHash
  critique.md          # reviewer, findings and exact revision
  revisions.md         # what changed and what needs rechecking
  evidence.json        # hash-bound attestations and source ledger
  validation.json      # output of blog:check
  preview/             # real local render evidence, if performed
```

`work/` gitignored и находится вне content collection. Для демонстрации в Git сохранена [тестовая пара](../../tests/fixtures/blog-workflow/draft-boundaries.md) со [вторым языком](../../tests/fixtures/blog-workflow/en/draft-boundaries.md), исследованием, планом и revision notes. Это не production post. Не копировать её в публикуемую коллекцию как готовый контент.

Фактическая схема, Markdown/MDX, Mermaid/LaTeX, native metadata и правила голоса перечислены в [CONTRACT](CONTRACT.md). Для формы статьи и выбора всех 12 структур — [TEMPLATES](TEMPLATES.md). Технические SEO-skills проекта переиспользуются, не заменяются. Удалённый курс не возвращается ни как статья, ни как внутренние ссылки.

## Локальные проверки

После обычной установки зависимостей **этого проекта** (`pnpm install --frozen-lockfile`) доступны:

```sh
pnpm blog:framework
pnpm blog:digest tests/fixtures/blog-workflow/draft-boundaries.md --en tests/fixtures/blog-workflow/en/draft-boundaries.md
pnpm blog:check tests/fixtures/blog-workflow/draft-boundaries.md --en tests/fixtures/blog-workflow/en/draft-boundaries.md
```

Последняя команда без evidence намеренно возвращает exit 1: schema/translation могут пройти, но исследования, code/voice/translation review, native render, visual и assets review ещё не аттестованы. Это ожидаемый fail-closed результат, а не неисправность установки. Exit 0 = все необходимые проверки записаны и локальные проверки прошли; exit 1 = неполная/неуспешная проверка; exit 2 = ошибочный вызов/чтение. Даже exit 0 всегда содержит `publicationAuthorized: false`.

`blog:framework` проверяет 32 регистрации в обеих средах, пять ролей, локальные ссылки и полные SHA-256 сохранённых upstream-файлов. Он включён в `pnpm lint`, поэтому существующие CI и pre-push также проверяют его. `blog:digest` вычисляет точный hash RU/EN (с slug и форматом); он **не** является sourceHash перевода.

Для sourceHash используется только проектная функция, после выполненного перевода:

```sh
node --import tsx --input-type=module -e 'import {readFileSync} from "node:fs"; import {contentHash} from "./src/lib/translate/hash.ts"; process.stdout.write(contentHash("posts", readFileSync(process.argv[1], "utf8"))+"\n");' docs/blog-framework/work/example/example.md
```

Для work-черновиков используйте прямой вызов `contentHash` выше. Существующий `pnpm translate -- --rebase <slug>` работает с production collection и при старте требует настроенный `ANTHROPIC_API_KEY`, даже без генерации: он не входит в этот процесс. Полный `pnpm translate` использует внешнюю платную модель и также не запускается. Draft-only и RU-only работа допустима как промежуточный результат, но bilingual handoff остаётся неполным до перевода.

Evidence schema экспортируется как `blogEvidenceSchema` из `src/lib/blog-workflow.ts`: version 1, `articleDigest`, `claims`, `checks`. У claim: `claim`, HTTPS `sourceUrl`, `sourceTitle`, `checkedAt`, `finding`, статус `supported|uncertain|contradicted`. У check: gate, `pass|fail|not-run`, reviewer, details, массив repo-relative artifacts. Обязательные gates: `sources`, `technical-review`, `voice-review`, `translation-review`, `native-render`, `visual-review`, `assets-review`. Render/visual/assets pass требует существующего локального evidence-файла. Для чужих или непроверенных данных не писать pass.

```sh
pnpm blog:check docs/blog-framework/work/example/example.md --en docs/blog-framework/work/example/en/example.md --evidence docs/blog-framework/work/example/evidence.json --root .
```

Это записи о работе ревьюера, не криптографическое доказательство истинности/просмотра. Любое изменение RU/EN аннулирует digest. Изменение источников или assets также требует повторного ревью; наличие файла не доказывает его историческую неизменность. Проверка не исполняет MDX, не делает сеть и не меняет статьи. Подробные live/HTML/fragment проверки делает reviewer на реальном native output. Английские readability/AI-detection показатели не используются для RU.

Перед предлагаемым переносом готовой пары в collection: отдельный запрос пользователя на этот этап, затем `pnpm translate:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm verify:seo-build`, `pnpm test:built`. `pnpm test:db` требует Docker; полноценные e2e требуют тестовой среды. Не запущенные проверки обозначаются явно. Никакой оценочный балл не разрешает merge/deploy.

## Роли и переносимость

Claude Code получает `blog-researcher`, `blog-writer`, `blog-seo`, `blog-reviewer`, `blog-translator` в `.claude/agents/`. Они наследуют выбранную пользователем модель. Оркестратор назначает минимально необходимые инструменты и отдельные файлы; researcher/reviewer не редактируют статью. Codex и другие агенты используют эти документы как role briefs и фактически доступную делегацию; если делегации нет, проход помечается self-review. Claude frontmatter не создаёт sandbox или регистрацию subagent в Codex.

Модели, credentials и подписки не меняются. Провайдеры Gemini image/audio, NotebookLM и Google API не настроены этой интеграцией; наличие skill означает доступность сценария/экспорта/brief, а не разрешение на вызов сервиса. Причины и доступные offline-замены — в [карте](CAPABILITIES.md).

## Происхождение и сопровождение

Зафиксирован upstream commit **`2500d4c765034864cede2bf215d00ccd4d7d6fb8`**, declared version **2.2.0**. Это main snapshot, не release-tag: `v2.2.0` указывает на `7b6ca107adb40b7c59030568420c117e2ea61301`. 276 исходных файлов сохранены как неисполняемые `.upstream`, все 896 путей отражены в [manifest](../../vendor/claude-blog/manifest.json). 620 файлов отдельного Brain исключены из-за собственной лицензии с сохранением всех прав; Brain не считается реализованным.

Автор upstream — Daniel Agrici / AgriciDaniel. [MIT](../../vendor/claude-blog/LICENSE) и [NOTICE](../../vendor/claude-blog/NOTICE) сохранены. Prompt content [FLOW](https://github.com/AgriciDaniel/flow) — Daniel Agrici, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); inline credit не изменён. Активные skills — модифицированные проектные адаптации, не неизменённый upstream. NOTICE включает также attribution impeccable и last30days-skill. 30 FLOW-файлов — библиотека prompts; многие тела повторяются, это не 30 независимых автоматизаций.

Обновление только через [проверенный pinned diff](UPDATING.md). Никаких автоматических fetch/latest/sync/install во время написания статьи.
