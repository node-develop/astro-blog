# Промпты для CLI-агента: доведение первой недели

Дата: 19 сентября 2026
Репозиторий: `/Users/artemkashuta/Documents/astro-blog`
Ветка с правками: `seo/week-1-indexing` (8 коммитов поверх `main`, рабочее дерево чистое)

---

## Сначала прочитайте это сами

**Репозиторий не мёртв, он приватный.** Remote проекта указывает на `https://github.com/node-develop/astro-blog.git`, и он рабочий. Анонимный запрос получает 404 именно потому, что доступ закрыт: так GitHub отвечает на приватные репозитории.

Это меняет коммит `98d1c90`. Сейчас в статьях и на странице проекта написано «исходный код сайта не опубликован», а ссылки переведены на профиль. Формально это правда, но у вас есть выбор получше:

- **Если сделаете репозиторий публичным**, верните прежние ссылки и формулировки. Это заметно сильнее для доверия: приглашение проверить код, которое действительно работает. Тогда выполните Промпт 0 ниже вместо ничего.
- **Если репозиторий остаётся приватным**, ничего не делайте, текущее состояние коммита верное.

Решение принимайте до выкладки, иначе придётся править дважды.

**Как устроена выкладка** (это важно для промптов 4 и 5):

```
pull request  ->  .github/workflows/ci.yml (полная проверка)
push в main   ->  .github/workflows/docker-publish.yml
                  -> сборка образа -> ghcr.io/node-develop/astro-blog
                  -> POST на DOKPLOY_WEBHOOK_URL
                  -> Dokploy тянет образ и перезапускает сервис
```

То есть деплой запускается сам при слиянии в `main`. Отдельно нажимать «Deploy» в Dokploy не нужно, если только webhook не отвалился.

---

## Промпт 0 (необязательный, только если делаете репозиторий публичным)

```
Репозиторий github.com/node-develop/astro-blog теперь публичный.

В ветке seo/week-1-indexing лежит коммит 98d1c90, который убрал ссылки на этот
репозиторий, заменил их на ссылку на профиль node-develop и переписал текст
вокруг них на «исходный код сайта не опубликован». Это больше не соответствует
действительности, надо откатить именно эту часть.

Сделай:
1. Посмотри `git show 98d1c90` целиком.
2. Верни прежние ссылки на репозиторий в восьми местах и прежние формулировки
   вокруг них. Точные адреса возьми из коммита:
   - https://github.com/node-develop/astro-blog
   - https://github.com/node-develop/astro-blog/tree/main/src/lib/seo
   - https://github.com/node-develop/astro-blog/blob/main/astro.config.ts
   Файлы: src/content/posts/{json-ld-graph-astro,mermaid-svg-playwright-build-time,claude-md-12-rules}.md
   и их английские двойники в src/content/posts/en/, плюс
   src/content/projects/astro-blog.md и src/content/projects/en/astro-blog.md.
3. НЕ откатывай из этого коммита правку стажа в src/lib/seo/person.ts
   (5+ на 7+). Она остаётся.
4. Проверь каждую ссылку живьём через curl, что она отдаёт 200, а не 404.
   Особенно ссылки на конкретные файлы с /tree/main/ и /blob/main/: путь мог
   измениться с тех пор, как их написали.
5. Английские двойники статей хранят поле sourceHash, это sha256 от всего
   русского файла. Ты меняешь русские файлы, значит отпечатки надо пересчитать.
   Как это делается, смотри в scripts/translate.ts (функция sha256 из
   src/lib/translate/hash.ts) и scripts/refresh-en-sourcehash.ts.
   После пересчёта обязательно прогони pnpm translate:check.
6. Верни на место проверку в tests/unit/seo/landing-content.test.ts: коммит
   заменил там ожидание адреса репозитория на адрес профиля.
7. Закоммить одним коммитом:
   `revert(content): restore repository links now that the repo is public`
   В теле напиши, что репозиторий стал публичным и почему это лучше профиля.

Не трогай ничего за пределами перечисленного. Остальные семь коммитов ветки
корректны и откату не подлежат.
```

---

## Промпт 1. Проверить и довести ветку

Это главный промпт. Отдавайте его первым (после Промпта 0, если он нужен).

```
Работай в репозитории astro-blog, ветка seo/week-1-indexing. Она уже создана,
в ней 8 коммитов поверх main, рабочее дерево чистое. Новых веток не создавай,
в main ничего не коммить.

КОНТЕКСТ. Эти коммиты внесены другим агентом, у которого НЕ БЫЛО ни pnpm, ни
node_modules: он не смог запустить ни одной проверки, и хуки husky при коммитах
были пропущены через --no-verify. То есть код не собирался и не тестировался
ни разу. Твоя задача это исправить.

Что в ветке:
  98d1c90 fix(content): replace dead repo links and unify stated experience
  23ae809 fix(seo): keep markdown twins out of ordinary search indexes
  42ea6b9 fix(seo): make every post reachable without JavaScript
  6bb49fd fix(seo): recover concatenated lesson URLs and close their source
  3efe201 fix(og): correct the byline and give each locale and lesson its own card
  6a37f98 fix(seo): fit titles in search results and use the metadata already written
  308dacc test(seo): cover the title budget and the tag archive templates
  aa6ec61 docs: SEO audit 2026-09-19 with Search Console baseline

Подробности каждой правки: docs/audits/seo-audit-artka.dev-2026-09-19.md
и тела самих коммитов (git log -p).

## ШАГ 1. Прогнать проверки в том же порядке, что и CI

Порядок взят из .github/workflows/ci.yml, не меняй его: ранние проверки дешевле
и ловят больше.

    pnpm install --frozen-lockfile
    pnpm exec playwright install --with-deps chromium
    pnpm verify:seo-build
    pnpm exec vitest run --exclude 'tests/integration/**'
    pnpm test:production-smoke
    pnpm exec vitest run tests/integration/seo-utility-routes.test.ts
    pnpm exec vitest run tests/integration/course-dates.test.ts
    pnpm translate:check
    pnpm typecheck
    pnpm lint

Затем второй блок из CI (нужен Docker для Testcontainers):

    pnpm exec vitest run tests/integration \
      --exclude tests/integration/production-server.smoke.test.ts \
      --exclude tests/integration/seo-utility-routes.test.ts \
      --exclude tests/integration/course-dates.test.ts

Не пропускай ни одного шага и не запускай их параллельно.

## ШАГ 2. Чинить падения

Под подозрением в первую очередь, по убыванию:

1. `src/lib/content/loader.test.ts`. Переписан сильнее всего. Туда добавили
   подмену переменной DATABASE_URL через vi.stubEnv, из-за чего поддельная база
   ТЕПЕРЬ РЕАЛЬНО УЧАСТВУЕТ, а раньше загрузчик уходил в ветку сборки и эти
   тесты кода не касались. Если падает, разбирайся по существу: может оказаться,
   что поддельная база не покрывает все вызовы.
2. `tests/unit/latest-publications.test.ts`. Переписан, поднимает собранный
   сервер, значит требует свежего pnpm build. Проверяет поведение через
   BLOG_PAGE_SIZE, а не через жёсткое число.
3. `tests/unit/seo/title-budget.test.ts` и `tests/unit/seo/og-paths.test.ts`.
   Новые файлы, ни разу не запускались.
4. `scripts/verify-seo-build.test.ts`. Туда добавили проверку assertOgAuthorNames,
   которая ищет строковые литералы, похожие на имя человека, в src/lib/og и
   src/pages/og. Белый список ровно один пункт: "Source Serif 4". Если проверка
   ругается на что-то законное, расширь белый список осознанно, а не отключай
   проверку.
5. `tests/unit/seo/redirects.test.ts` и `tests/unit/seo/canonical-internal-links.test.ts`.
   Новые проверки на склеенные адреса уроков.
6. `tests/e2e/seo.spec.ts`. Проверяет разметку превью, а адреса картинок
   изменились.

ПРАВИЛО ПРИ ПОЧИНКЕ. Прежде чем править тест, пойми, что именно он защищает.
Если тест упал потому, что поведение изменилось намеренно, перепиши тест под
новое правило, но так, чтобы он проверял ПРАВИЛО, а не жёсткую строку или число.
Если тест упал потому, что код сломан, чини код. Никогда не отключай тест и не
ставь skip ради зелёной сборки: в CLAUDE.md этого проекта есть правило Fail loud,
оно ровно про это.

## ШАГ 3. Проверить руками то, что тесты не ловят

После `pnpm build && pnpm preview` (или на собранном сервере):

    # На /blog/ должно быть 6 ссылок на статьи, а не 4
    curl -s http://localhost:4321/blog/ | grep -o 'href="/blog/[^"#?]*/"' | sort -u | wc -l

    # На главной тоже 6
    curl -s http://localhost:4321/ | grep -o 'href="/blog/[^"#?]*/"' | sort -u | wc -l

    # Второй страницы больше нет, ждём 404
    curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4321/blog/partials/2/

    # Склеенный адрес урока: один 301 сразу на настоящий урок
    curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' \
      http://localhost:4321/courses/claude-code-guide/03-claude-md/06-mcp/

    # Заголовок урока не должен вылезать за 60 знаков
    curl -s http://localhost:4321/courses/claude-code-guide/13-best-practices/ \
      | grep -o '<title>[^<]*</title>'

Отдельно посмотри ГЛАЗАМИ две или три картинки превью в dist/client/og/:
подпись внизу слева должна быть «Artyom Kashuta», а не «Artur Karapetov», и на
английской карточке должен стоять английский заголовок. Satori не умеет обрезать
текст по числу строк, поэтому у длинных заголовков уроков текст может вылезать
за край: проверь именно уроки.

## ШАГ 4. Закоммитить

Все починки складывай в НОВЫЕ коммиты поверх ветки. Существующие восемь не
переписывай, историю не перебазируй: по ним удобно смотреть, что и зачем
делалось.

Сообщения:
  fix(tests): <что именно чинил> для <какой из восьми правок>
  fix(seo): <если пришлось чинить код, а не тест>
  chore: prettier formatting after the week 1 SEO batch   (если pnpm lint
                                                           переформатировал файлы)

Коммить от имени `Artem <kashuta@gmail.com>` (так подписаны и предыдущие).
Хуки husky на этот раз НЕ пропускай: pnpm lint должен пройти по-настоящему.

## ШАГ 5. Отчитаться

Напиши коротко и по-русски, без сленга:
- что упало и почему (каждое падение отдельной строкой);
- что ты починил в тестах, а что в коде, и почему выбрал именно так;
- результаты ручных проверок из шага 3 числами;
- что осталось красным, если осталось.

Пулл-реквест пока НЕ открывай, это следующий шаг.
```

---

## Промпт 2. Dokploy: переадресация с www

Это единственная правка первой недели, которой нет в коде. Google 26 мая 2026 видел на `https://www.artka.dev/` ошибку 404, и этот адрес до сих пор висит в отчёте Search Console.

```
Задача в Dokploy, через MCP. Работай осторожно: за этим Traefik стоят и другие
сервисы, не только блог.

ЦЕЛЬ. Любой запрос на www.artka.dev, по http и по https, должен отдавать ровно
один постоянный редирект 301 на тот же путь и те же параметры на голом домене:

    http://www.artka.dev/$request_uri   ->  https://artka.dev/$request_uri  (301)
    https://www.artka.dev/$request_uri  ->  https://artka.dev/$request_uri  (301)

Сейчас это два шага вместо одного (сначала http на https, потом www на голый
домен), а по данным Google на www какое-то время отдавалась ошибка 404.

ЧТО УЖЕ ИЗВЕСТНО ПРО ЭТУ УСТАНОВКУ. Обязательно прочитай
docs/runbooks/dokploy-compression.md в репозитории целиком перед тем, как
что-то менять. Краткая выжимка:

- Проект в Dokploy называется `blog`, приложение `Blog`,
  образ ghcr.io/node-develop/astro-blog, Traefik версии 3.6.1.
- Настройки Traefik лежат в /etc/dokploy/traefik/ и правятся через API:
  settings.readMiddlewareTraefikConfig / settings.updateMiddlewareTraefikConfig
  для dynamic/middlewares.yml, settings.readTraefikConfig /
  settings.updateTraefikConfig для traefik.yml, затем settings.reloadTraefik.
- В middlewares.yml уже определён `blog-compress`, он подключён на уровне
  ТОЧЕК ВХОДА в traefik.yml (entryPoints.web.http.middlewares и
  entryPoints.websecure.http.middlewares), с суффиксом @file.
- ЧТО НЕ РАБОТАЕТ И ЧЕГО НЕ ПОВТОРЯТЬ: подключение middleware через роутеры
  самого приложения в dynamic/blog-blog-xekukc.yml. Файл пишется на диск,
  Traefik его читает, но middleware не применяется. Плюс Dokploy
  ПЕРЕЗАПИСЫВАЕТ этот файл при любом изменении домена, так что всё
  написанное там руками теряется. Работает только подключение на уровне
  точек входа.

ПОРЯДОК РАБОТЫ.

1. Сначала только чтение. Собери и покажи мне:
   - что отдаёт DNS для www.artka.dev (A или CNAME, куда указывает);
   - текущее содержимое dynamic/middlewares.yml и traefik.yml;
   - список доменов, заведённых на приложении Blog: есть ли там www.artka.dev;
   - есть ли действующий сертификат, покрывающий www.artka.dev;
   - что реально отдают сейчас:
       curl -sS -I 'http://www.artka.dev/about/?x=1'
       curl -sS -I 'https://www.artka.dev/about/?x=1'
       curl -sS -I 'https://artka.dev/about/?x=1'

2. ВАЖНАЯ ТОНКОСТЬ, проверь её до того, как предлагать решение. В Traefik
   middleware на уровне точки входа применяется к роутерам этой точки входа.
   Если ни один роутер не совпал по имени хоста, Traefik отвечает 404 и до
   middleware дело не доходит. Значит, если www.artka.dev не заведён как домен
   приложения, одного редиректа в middlewares.yml НЕ ХВАТИТ: сначала нужен
   роутер и сертификат на этот хост. Проверь по фактам из пункта 1, какой
   случай у нас, и скажи прямо.

3. Предложи мне решение и дождись моего «да» перед тем, как что-то менять.
   Ожидаемая форма решения, но сверься с фактами:
   - добавить www.artka.dev вторым доменом приложения Blog в Dokploy, чтобы
     появился роутер и Let's Encrypt выписал сертификат;
   - в dynamic/middlewares.yml добавить рядом с blog-compress:

         www-to-apex:
           redirectRegex:
             regex: "^https?://www\\.artka\\.dev/(.*)"
             replacement: "https://artka.dev/${1}"
             permanent: true

   - в traefik.yml подключить www-to-apex@file на обеих точках входа, рядом
     с blog-compress@file;
   - выполнить settings.reloadTraefik.

   Про безопасность для соседних сервисов: правило привязано к имени хоста
   www.artka.dev регулярным выражением, поэтому запросы к другим доменам за
   этим же Traefik под него не подпадают. Всё равно проверь это после
   применения, пункт 5.

4. Применяй по одному изменению за раз и после каждого проверяй. Не делай
   несколько правок разом: если что-то сломается, будет непонятно что именно.

5. Проверка после применения:

       curl -sS -I 'http://www.artka.dev/about/?x=1'
       curl -sS -I 'https://www.artka.dev/about/?x=1'

   Ожидается у обоих: ровно 301 и Location: https://artka.dev/about/?x=1
   Ровно один шаг, путь и параметры сохранены, никаких промежуточных хостов.
   Команда https должна пройти без предупреждений про сертификат.

       curl -sS -I 'https://artka.dev/about/'

   Ожидается 200 без всяких редиректов: голый домен трогать нельзя.

   И обязательно проверь, что не сломалось сжатие и соседние сервисы:

       curl -s -o /dev/null -D - -H 'Accept-Encoding: br, gzip' https://artka.dev/ \
         | grep -i '^content-encoding'

   Ожидается content-encoding: br. Проверяй именно GET, не HEAD: Traefik не
   сжимает ответ без тела, и на HEAD заголовка не будет даже при работающем
   сжатии.

   Открой остальные сервисы за этим Traefik и убедись, что они отвечают как
   раньше.

6. Задокументируй. Допиши в репозиторий docs/runbooks/dokploy-www-redirect.md
   по образцу docs/runbooks/dokploy-compression.md: зачем, что настроено,
   что не сработало и почему, как проверить. Коммить в ветку
   seo/week-1-indexing сообщением
   `docs(runbook): www to apex redirect in Dokploy Traefik`.

Если что-то не сходится с тем, что написано выше, остановись и скажи мне.
Не подбирай настройки перебором на живом сервере.
```

---

## Промпт 3. Dokploy: кеш для статики (необязательно, можно отложить)

Это уже из второй недели, но правится в том же месте, поэтому логично сделать заодно.

```
Задача в Dokploy, через MCP. Сначала прочитай docs/runbooks/dokploy-compression.md,
там описано, как в этой установке правится Traefik и что в ней не работает.

ПРОБЛЕМА. Вся статика из public/ отдаётся с заголовком
`cache-control: public, max-age=0`. Проверено живьём на /avatar-128.webp,
/og-default.png, /favicon.svg, /site.webmanifest, /pagefind/pagefind.js.
Адаптер @astrojs/node в режиме standalone ставит вечный кеш только тому, что
лежит в _astro/ (там имена с хешем), всё остальное получает max-age=0.
Возвращается 304, то есть байты повторно не качаются, но каждое посещение
любой страницы стоит нескольких лишних обращений к серверу: пять значков,
манифест, аватар. На мобильной сети с задержкой 150 до 250 миллисекунд это
заметно.

Кодом это не лечится: адаптер раздаёт dist/client своим обработчиком ДО
приложения, поэтому src/middleware.ts до этих файлов не доходит.

ЦЕЛЬ. Отдавать этим путям Cache-Control: public, max-age=604800 (неделя).
Не год: имена без хеша, при замене аватара нужен разумный срок обновления.
Папка /pagefind/ перестраивается на каждой сборке, ей недели тоже достаточно.

Пути, которые надо покрыть: /avatar-, /icon-, /favicon, /apple-touch-icon,
/site.webmanifest, /pagefind/, /humans.txt.
НЕ трогай: /_astro/ (там уже вечный кеш), /robots.txt, /sitemap-*.xml,
/llms.txt, /llms-full.txt, /rss.xml, /feed.json (они должны обновляться быстро),
и сами HTML-страницы.

ПОРЯДОК. Тот же, что и в прошлой задаче: сначала покажи текущую конфигурацию и
предложи решение, дождись моего «да», применяй по одному изменению, после
каждого проверяй.

Учти особенность этой установки: middleware на уровне точки входа применяется
ко ВСЕМ сервисам за этим Traefik. Заголовок кеша нельзя вешать на точку входа
без разбора, иначе он прилетит и на HTML, и на соседние сервисы. Нужен
отдельный роутер с правилом по путям и приоритетом выше основного, либо другой
приём. Продумай и объясни мне, прежде чем делать.

Проверка после применения:

    for u in /avatar-128.webp /favicon.svg /site.webmanifest /pagefind/pagefind.js; do
      echo -n "$u  "; curl -s -o /dev/null -D - "https://artka.dev$u" | grep -i '^cache-control'
    done
    # ожидается max-age=604800

    for u in / /robots.txt /sitemap-index.xml /blog/; do
      echo -n "$u  "; curl -s -o /dev/null -D - "https://artka.dev$u" | grep -i '^cache-control'
    done
    # НЕ должно стать 604800: страницы и служебные файлы остаются как были

Задокументируй в docs/runbooks/dokploy-static-cache.md и закоммить.
```

---

## Промпт 4. Выкладка

Отдавайте только после того, как Промпт 1 закончился зелёным.

```
Ветка seo/week-1-indexing готова, все проверки проходят локально. Выкладываем.

1. Запушь ветку и открой пулл-реквест в main.
   Заголовок: `SEO week 1: indexing fixes`
   В теле опиши по одному абзацу на каждую из восьми правок, своими словами,
   плюс раздел «Что проверить после выкладки» с командами из пункта 4 ниже.
   Сошлись на docs/audits/seo-audit-artka.dev-2026-09-19.md.

2. Дождись, пока пройдёт CI (.github/workflows/ci.yml, две задачи: validate и
   integration). Если что-то упало на CI, но проходило локально, разбирайся по
   существу: скорее всего это разница окружений, чаще всего Testcontainers или
   Playwright. Не отключай проверку.

3. После слияния в main автоматически запускается
   .github/workflows/docker-publish.yml: сборка образа, публикация в
   ghcr.io/node-develop/astro-blog, затем POST на DOKPLOY_WEBHOOK_URL, по
   которому Dokploy тянет образ и перезапускает сервис.
   Проследи через MCP Dokploy, что деплой действительно случился и сервис
   поднялся. Если webhook не сработал (в логах шага будет строка про то, что
   секрет не задан), запусти развёртывание вручную через Dokploy MCP.

4. Проверка на проде, ПОСЛЕ того как деплой завершился:

    # шесть ссылок на статьи, а не четыре
    curl -s https://artka.dev/blog/ | grep -o 'href="/blog/[^"#?]*/"' | sort -u | wc -l
    curl -s https://artka.dev/ | grep -o 'href="/blog/[^"#?]*/"' | sort -u | wc -l

    # markdown-двойник закрыт в robots.txt
    curl -s https://artka.dev/robots.txt | grep -A2 -B6 'Disallow: /\*\.md'

    # склеенный адрес урока: один 301 на настоящий урок
    curl -sS -I 'https://artka.dev/courses/claude-code-guide/03-claude-md/06-mcp/'
    curl -sS -I 'https://artka.dev/en/courses/claude-code-guide/05-hooks/10-agent-teams/'

    # заголовок урока в пределах бюджета
    curl -s https://artka.dev/courses/claude-code-guide/13-best-practices/ | grep -o '<title>[^<]*</title>'

    # заголовок списка статей больше не пустой по смыслу
    curl -s https://artka.dev/blog/ | grep -o '<title>[^<]*</title>'

    # картинки превью: разные у языков, обе существуют
    curl -s https://artka.dev/blog/robots-txt-ai-crawlers-2026/ | grep -o 'og:image" content="[^"]*"'
    curl -s https://artka.dev/en/blog/robots-txt-ai-crawlers-2026/ | grep -o 'og:image" content="[^"]*"'

    # карта сайта на месте и не сломалась
    curl -s https://artka.dev/sitemap-ru.xml | grep -c '<loc>'

   Скачай две картинки превью и посмотри на них: подпись «Artyom Kashuta»,
   на английской карточке английский заголовок.

5. Сбрось кеш карточек в соцсетях. Адреса картинок изменились у ОБОИХ языков
   (теперь с суффиксом -ru и -en), а соцсети держат свой кеш по адресу страницы.
   Отладчики:
     X: https://cards-dev.twitter.com/validator
     LinkedIn: https://www.linkedin.com/post-inspector/
     Telegram: бот @WebpageBot, команда /update и ссылка на страницу
   Прогнать надо по одной странице: шесть пар статей, разделы, уроки.
   Это ручная работа, просто напомни мне списком, какие адреса прогнать.

6. Отчитайся числами по каждому пункту проверки.
```

---

## Шаг 5. Search Console (руками, агенту не отдавать)

Делается только **после** того, как деплой прошёл и проверки из Промпта 4 зелёные. Раньше нельзя: повторная проверка запускается один раз, при неудаче отсчёт начинается заново.

1. Откройте отчёт «Индексирование страниц» в ресурсе `sc-domain:artka.dev`.
2. Вручную откройте пять адресов из раздела «Не найдено (404)» и убедитесь, что каждый отдаёт 301 на настоящий урок. Если хоть один всё ещё 404, не запускайте проверку, вернитесь к коду.
3. Нажмите «Проверить исправление» в разделах «Не найдено (404)» и «Страница с переадресацией».
4. Через «Проверка URL» проверьте и запросите индексирование для: главной, шести статей, лендинга курса. Больше не надо, на запросы индексирования есть суточный лимит.
5. Запишите базовые цифры на сегодня: проиндексировано 8, не проиндексировано 177, из них просканировано и не проиндексировано 112. Шаблон таблицы для еженедельного отслеживания лежит в `docs/runbooks/google-indexing-recovery.md`, раздел 6.
6. Снимайте цифры раз в неделю четыре недели подряд.

Отдельно проверьте, что в Search Console заведён ресурс и для `www.artka.dev`, иначе результат работы по Промпту 2 будет не виден.

---

## Чего эти промпты сознательно не делают

- **Не трогают содержание статей.** Главная причина, по которой 112 страниц не берут в индекс, это объём и тонкость материала, а не техника. Это вторая и последующие недели.
- **Не делают `/terms` переадресацией.** В `tests/unit/seo/redirects.test.ts` уже есть осознанная проверка «не выдумывать редирект для /terms». Страница такая не существовала никогда, честный 404 правильнее подмены смысла.
- **Не переписывают историю ветки.** Восемь коммитов остаются как есть, починки ложатся сверху.
