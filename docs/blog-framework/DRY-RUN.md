# Проверенный редакционный dry run

Выполнен 2026-10-11 на базе `a2c9f435e6d9159745f513d5e9363815eef864df`. [RU-статья](../../tests/fixtures/blog-workflow/draft-boundaries.md) и [EN-перевод](../../tests/fixtures/blog-workflow/en/draft-boundaries.md) — короткий учебный пример о `draft` и `sourceHash`, вне content collection, с `draft: true`. Это проверка процесса, а не заявка на публикацию или образец длинной авторской статьи.

## От источников до исправлений

Сохранены [исследование](../../tests/fixtures/blog-workflow/research.md), [план](../../tests/fixtures/blog-workflow/outline.md), две языковые версии и [замечания с исправлениями](../../tests/fixtures/blog-workflow/revisions.md). Источники — фактический код проекта: маршруты, фильтрация списков, translation hash. Уточнены различия между `draft`, `hiddenFromList` и `e2e-`, между sourceHash и review digest, между компиляцией draft и просмотром готовой страницы. Код помечен фрагментом; выдуманные эксперименты и личный опыт отсутствуют.

Отдельный агент независимо проверил источники, техническую точность, голос и смысловую точность EN. Он также выполнил read-only эксперимент с изменениями полей и хешей. [Отчёт](evidence/editorial-review.md) содержит реальное покрытие и ограничения этого ревью.

- Native EN sourceHash: `ffe7b307e27fff2df722d9bdf5b3cfafb4c14430b1bf86ddd74ba59d5efd3ff8`.
- Digest точных RU/EN: `499af6809575db76979111acabc24e86f559dde7dcb861ba511d37aaf6e7296b`.

## Настоящий Astro render

В отдельной локальной копии проекта, без `.git`, `.env` и credentials, RU/EN fixture помещены в `src/content/posts`. Только в этой временной копии изменён `draft: true` на `draft: false`, чтобы получить native PostLayout. Контрольный `e2e-framework-hidden.md` сохранил `draft: true` и не получил публичного маршрута. Дополнительный временный MDX проверил Callout, LaTeX, Mermaid с accessible title/description и таблицу. Эти файлы не добавлены в production collection и не входят в PR как статьи.

Выполнены native SEO build и Chromium preview через существующий test production server с тестовой средой. Браузерные запросы вне localhost блокировались. Проверены HTTP 200, язык, один H1, canonical, RU/EN/x-default alternates, разбор JSON-LD, OG-изображения и отсутствие сломанных видимых изображений. У MDX получены KaTeX и оба варианта Mermaid. На ширине 390px нет переполнения документа; диаграмма использует штатный горизонтальный scroll. [Машинный отчёт](evidence/native-report.json) сохраняет результаты, включая отсутствие маршрута контрольного draft.

Сделаны desktop 1440px и mobile 390px screenshots. Основной агент визуально просмотрел RU mobile, EN desktop и MDX mobile: текст читается, обрезки документа нет.

| Страница | Desktop | Mobile |
| --- | --- | --- |
| RU fixture | [Снимок](evidence/draft-boundaries-ru-desktop.png) | [Снимок](evidence/draft-boundaries-ru-mobile.png) |
| EN fixture | [Снимок](evidence/draft-boundaries-en-desktop.png) | [Снимок](evidence/draft-boundaries-en-mobile.png) |
| MDX companion | [Снимок](evidence/e2e-framework-components-ru-desktop.png) | [Снимок](evidence/e2e-framework-components-ru-mobile.png) |

Три точные внешние ссылки статьи отдельно проверены публичным HTTPS HEAD: все вернули 200 ([отчёт](evidence/link-report.json)). Это проверка доступности на указанную дату, не гарантия будущего содержимого. Для доказательства утверждений использована зафиксированная версия кода.

## Воспроизводимый результат адаптера

Из корня проекта:

```sh
pnpm blog:framework
pnpm blog:digest tests/fixtures/blog-workflow/draft-boundaries.md --en tests/fixtures/blog-workflow/en/draft-boundaries.md
pnpm blog:check tests/fixtures/blog-workflow/draft-boundaries.md --en tests/fixtures/blog-workflow/en/draft-boundaries.md --evidence tests/fixtures/blog-workflow/evidence-completed.json
```

Последняя команда возвращает exit 0, `readyForHandoff: true`, `publicationAuthorized: false`. [Completed evidence](../../tests/fixtures/blog-workflow/evidence-completed.json) ссылается на фактически выполненные проверки. Сохранён и [исходный неполный evidence](../../tests/fixtures/blog-workflow/evidence.json): с ним exit 1, поскольку native/visual/assets ещё `not-run`. Это две стадии одного прохода. Старые аттестации не переносятся на изменённую статью.

Для повторного native просмотра создайте отдельную временную копию проекта без secrets; установите обычные зависимости проекта и Chromium по существующей инструкции тестов. Скопируйте обе fixtures в соответствующие RU/EN пути collection, смените только их draft-флаг в копии, оставьте контрольный draft. Запустите `pnpm verify:seo-build` и локальный preview, проверьте обе страницы и отсутствие контрольного маршрута, metadata/OG и desktop/mobile. Сохраните новое evidence с фактическим reviewer/date. Основной checkout при этом не меняется. Автоматический CLI не заявляет, что сам запускает или проверяет браузер.

## Проверки реализации

| Проверка | Результат локального прохода |
| --- | --- |
| `pnpm blog:framework` | 32 skills в обеих средах, 5 ролей, 276 точных файлов, inventory 896 путей; тест повреждения snapshot корректно отклонён |
| `pnpm lint` | pass |
| `pnpm typecheck` | 0 errors, 0 warnings; 39 существующих hints |
| `pnpm translate:check` | pass, существующие EN синхронизированы |
| `pnpm test` | 104 файла, 981 тест; в том числе 15 новых поведенческих тестов адаптера |
| Native SEO build | pass |
| `pnpm test:built` | 30 файлов, 245 тестов |
| `pnpm test:db` | 14 файлов, 174 теста, локальный Docker |
| Isolated fixture preview | RU/EN + MDX, Chromium desktop/mobile, draft exclusion, source links — pass |
| Полный отдельный Playwright e2e suite | not-run; выполнены built-site suite и описанный fixture preview |

Первый sandbox-run не позволял открыть loopback и запустить Chromium: unit worker получил EPERM, а built-site тесты обнаружили отсутствовавший Mermaid. После разрешённого повторного запуска с локальными браузером/портами весь соответствующий suite прошёл. Код сайта ради этих ошибок не менялся. Это ограничение среды, а не пропущенные failing tests.

Проверки не вызывают внешние модели, NotebookLM, Google APIs или upstream Python; ничего не публикуют. Evidence — аттестации ревьюеров, а не криптографическое доказательство истинности. SHA привязывает ревью к статье; изменение research/assets требует нового ревью даже при прежнем articleDigest. Удалённый курс и содержимое существующих production статей не затронуты.
