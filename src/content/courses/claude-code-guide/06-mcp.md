---
title: "MCP: как подключить внешний инструмент"
blurb: Создаём локальный MCP-сервер для поиска тестовых маршрутов. Проверяем четыре сценария без модели и подключаем инструмент к Claude Code.
pubDate: 2026-04-23
order: 6
locale: ru
updatedDate: 2026-10-01
---

Чтобы дать Claude Code доступ к своему поиску маршрутов, можно оформить поиск как MCP-инструмент. В этом уроке вы создадите небольшой сервер, проверите его ответы отдельным клиентом и подключите к Claude Code. Сервер читает только три тестовых предложения: ему не нужны ключи API, реальные цены или возможность бронирования.

MCP — протокол обмена инструментами и данными между приложением и сервером. Успешное подключение подтверждает, что стороны могут общаться. Оно ещё не доказывает, что поиск правильно проверяет дату или отличает пустой результат от ошибки. Поэтому сначала проверим эти условия без модели.

## Готовим отдельную папку

Нужны Node.js 24 и npm. Для последнего шага также нужны установленный Claude Code и настроенный вход в него. Команды рассчитаны на Bash или Zsh, например на macOS или Linux. Создайте новую папку рядом с учебным проектом, не внутри каталога с секретами:

```bash
mkdir trip-tools && cd trip-tools
npm init -y
npm install --save-exact @modelcontextprotocol/sdk@1.31.0 zod@4.6.5
```

Команда фиксирует версии двух прямых зависимостей. Сохраните сгенерированный `package-lock.json`, если будете переносить упражнение: он фиксирует и вложенные зависимости, а `npm ci` использует его для повторной установки. Расширение `.mjs` позволяет писать ES-модули без настройки TypeScript и сборки.

После установки сервер и проверочный клиент не обращаются к сети. Позже сессия Claude Code использует модель, но сам инструмент остаётся локальным.

## Создаём сервер с тремя тестовыми предложениями

Сохраните весь следующий блок как `server.mjs` в папке `trip-tools`:

```javascript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const knownCodes = new Set(["ESB", "IST", "BKK"]);
const offers = [
  {
    id: "fixture-esb-bkk-1",
    origin: "ESB",
    destination: "BKK",
    date: "2026-12-24",
    price: 640,
    currency: "USD",
    source: "fixture",
    fixture: true,
  },
  {
    id: "fixture-esb-bkk-2",
    origin: "ESB",
    destination: "BKK",
    date: "2026-12-24",
    price: 710,
    currency: "USD",
    source: "fixture",
    fixture: true,
  },
  {
    id: "fixture-ist-bkk-1",
    origin: "IST",
    destination: "BKK",
    date: "2026-12-24",
    price: 590,
    currency: "USD",
    source: "fixture",
    fixture: true,
  },
];

const isCalendarDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  if (Number(value.slice(0, 4)) === 0) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const reply = (data, isError = false) => ({
  isError,
  structuredContent: data,
  content: [{ type: "text", text: JSON.stringify(data) }],
});

const server = new McpServer({ name: "trip-fixtures", version: "1.0.0" });

server.registerTool(
  "search_trips",
  {
    description: "Search read-only fixture offers by airport codes and date. Not live prices.",
    inputSchema: {
      origin: z.string().describe("Departure airport code: ESB, IST or BKK"),
      destination: z.string().describe("Arrival airport code: ESB, IST or BKK"),
      date: z.string().describe("Calendar date in YYYY-MM-DD format"),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ origin, destination, date }) => {
    const query = {
      origin: origin.trim().toUpperCase(),
      destination: destination.trim().toUpperCase(),
      date,
    };
    const metadata = { source: "fixture", fixture: true, ...query };

    if (!knownCodes.has(query.origin) || !knownCodes.has(query.destination)) {
      return reply({ ...metadata, error: { code: "UNKNOWN_CITY" } }, true);
    }
    if (!isCalendarDate(date)) {
      return reply({ ...metadata, error: { code: "INVALID_DATE" } }, true);
    }

    const trips = offers.filter(
      (offer) =>
        offer.origin === query.origin &&
        offer.destination === query.destination &&
        offer.date === query.date,
    );
    return reply({ ...metadata, trips });
  },
);

await server.connect(new StdioServerTransport());
```

`ESB` — Анкара, `IST` — Стамбул, `BKK` — Бангкок. Это коды аэропортов; имя ошибки `UNKNOWN_CITY` оставлено как часть учебного контракта. Поиск принимает строки, приводит коды к верхнему регистру и возвращает предложения только для точного совпадения маршрута и даты.

Все цены придуманы для упражнения. Поля `source: "fixture"` и `fixture: true` помечают их и в успешном ответе, и в ошибке. Времени получения данных здесь нет: сервер ничего не запрашивает у поставщика.

Проверка даты не привязана к сегодняшнему дню. Например, `2026-02-30` отклоняется как несуществующая календарная дата, а корректная дата без предложений даёт пустой список. Так упражнение не сломается после 24 декабря.

Сервер отдаёт объект в `structuredContent` и тот же объект как JSON в текстовом `content`. У ошибки инструмента стоит `isError: true`; у выполненного поиска, включая пустой, — `false`. Неверный тип аргумента, например число вместо строки, SDK отклонит до обработчика; четыре сценария ниже проверяют именно строки и бизнес-ответы обработчика.

Запустите сервер отдельно:

```bash
node server.mjs
```

Он останется ждать ввода и не напечатает приглашение. Это нормально: транспорт `stdio` передаёт сообщения через `stdin` и `stdout`, а не через HTTP-порт. Нажмите Ctrl+C перед следующим шагом. Не добавляйте `console.log` в сервер: обычный текст в `stdout` мешает протоколу. Если нужны диагностические сообщения, отправляйте их в `stderr`.

## Проверяем инструмент без Claude и модели

Сохраните второй файл, `smoke.mjs`, рядом с `server.mjs`. Он сам запускает сервер дочерним процессом через официальный SDK-клиент. Каждому вызову инструмента даётся пять секунд; в конце соединение закрывается, в том числе при упавшей проверке.

```javascript
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client({ name: "trip-fixtures-smoke", version: "1.0.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL("./server.mjs", import.meta.url))],
});

const call = async (input, expectedError) => {
  const result = await client.callTool({ name: "search_trips", arguments: input }, undefined, {
    timeout: 5_000,
  });
  assert.equal(result.isError, expectedError);
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, "text");
  const data = JSON.parse(result.content[0].text);
  assert.deepEqual(data, result.structuredContent);
  assert.equal(data.source, "fixture");
  assert.equal(data.fixture, true);
  assert.equal(data.origin, input.origin);
  assert.equal(data.destination, input.destination);
  assert.equal(data.date, input.date);
  return data;
};

try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.ok(tools.some((tool) => tool.name === "search_trips"));
  console.log("PASS tool discovery");

  const success = await call({ origin: "ESB", destination: "BKK", date: "2026-12-24" }, false);
  assert.equal(success.error, undefined);
  assert.deepEqual(success.trips, [
    {
      id: "fixture-esb-bkk-1",
      origin: "ESB",
      destination: "BKK",
      date: "2026-12-24",
      price: 640,
      currency: "USD",
      source: "fixture",
      fixture: true,
    },
    {
      id: "fixture-esb-bkk-2",
      origin: "ESB",
      destination: "BKK",
      date: "2026-12-24",
      price: 710,
      currency: "USD",
      source: "fixture",
      fixture: true,
    },
  ]);
  console.log("PASS success: two fixture trips");

  const unknown = await call({ origin: "XXX", destination: "BKK", date: "2026-12-24" }, true);
  assert.deepEqual(unknown.error, { code: "UNKNOWN_CITY" });
  assert.equal(unknown.trips, undefined);
  console.log("PASS unknown city: UNKNOWN_CITY");

  const invalid = await call({ origin: "ESB", destination: "BKK", date: "2026-02-30" }, true);
  assert.deepEqual(invalid.error, { code: "INVALID_DATE" });
  assert.equal(invalid.trips, undefined);
  console.log("PASS invalid date: INVALID_DATE");

  const empty = await call({ origin: "ESB", destination: "IST", date: "2026-12-24" }, false);
  assert.equal(empty.error, undefined);
  assert.deepEqual(empty.trips, []);
  console.log("PASS empty result: successful search, no trips");
} finally {
  await client.close();
}
```

Запустите проверку из той же папки:

```bash
node smoke.mjs
```

Для этого шага не нужны вход в Claude Code, модель или платный API. Ожидаемый вывод при успешном прохождении:

```text
PASS tool discovery
PASS success: two fixture trips
PASS unknown city: UNKNOWN_CITY
PASS invalid date: INVALID_DATE
PASS empty result: successful search, no trips
```

Проверка сравнивает не только количество маршрутов. Она сверяет идентификаторы, цены, валюту, отметки тестовых данных и совпадение текстового JSON со структурированным ответом. Если появляется `AssertionError`, читайте, какая именно проверка не совпала; не переходите к подключению модели, пока результат не понятен.

Контракт четырёх запросов:

| Запрос                    | Ожидаемый ответ                                    |
| ------------------------- | -------------------------------------------------- |
| `ESB → BKK`, `2026-12-24` | `isError: false`, два предложения за 640 и 710 USD |
| `XXX → BKK`, `2026-12-24` | `isError: true`, `error.code: "UNKNOWN_CITY"`      |
| `ESB → BKK`, `2026-02-30` | `isError: true`, `error.code: "INVALID_DATE"`      |
| `ESB → IST`, `2026-12-24` | `isError: false`, `trips: []`                      |

Пустой список означает, что поиск выполнился, но в данных нет подходящего предложения. Не нужно подменять его ошибкой подключения или придумывать маршрут.

## Подключаем сервер к Claude Code

Оставаясь в `trip-tools`, выполните:

```bash
claude mcp add --transport stdio --scope local trip-fixtures -- "$(node -p 'process.execPath')" "$PWD/server.mjs"
claude mcp get trip-fixtures
claude mcp list
claude
```

Команда сохраняет абсолютные пути к Node.js и серверу. Кавычки сохраняют пути с пробелами. Отдельный `node server.mjs` оставлять запущенным не нужно: Claude Code сам запускает процесс для `stdio`.

`--scope local` привязывает настройку к этому проекту и вашему пользователю. Откройте Claude Code именно из `trip-tools`, иначе настройка другого проекта может быть недоступна. По [документации Claude Code](https://code.claude.com/docs/en/mcp), настройки local и user находятся в `~/.claude.json`, общая настройка проекта — в `.mcp.json`. Область настройки не ограничивает права серверного процесса. Пометка `readOnlyHint` тоже описывает инструмент, а не создаёт песочницу: отсутствие записи и бронирования обеспечивается нашим кодом.

В сессии откройте `/mcp` и проверьте подключение `trip-fixtures`. Затем отправьте запрос:

> Используй search_trips на сервере trip-fixtures: origin=ESB, destination=BKK, date=2026-12-24. Покажи id, price, currency, source и fixture из ответа инструмента. Не ищи реальные рейсы и не бронируй ничего.

Разрешите вызов, если клиент запрашивает подтверждение. Сравните фактический результат инструмента с таблицей, а не только пересказ Claude. Повторите запрос с остальными тремя наборами аргументов. Если модель решает не вызывать инструмент, это не результат проверки сервера: `smoke.mjs` уже позволяет проверить его отдельно.

Когда закончите упражнение, выйдите из сессии и удалите локальную настройку из той же папки:

```bash
claude mcp remove --scope local trip-fixtures
```

## Если пример не запускается

- `node` или `npm` не найдены: установите Node.js 24 и откройте новый терминал. `ERR_MODULE_NOT_FOUND` обычно означает, что зависимости не установлены рядом с файлами; вернитесь в `trip-tools` и выполните команду установки.
- Сервер ждёт после `node server.mjs`: это ожидаемое поведение `stdio`. Остановите его через Ctrl+C и запустите `node smoke.mjs`, который сам создаёт процесс.
- Claude не видит сервер: проверьте текущую папку, local scope и пути через `claude mcp get trip-fixtures`. После переноса папки зарегистрируйте сервер с новым абсолютным путём.
- Ошибка разбора сообщения: уберите обычный вывод в `stdout` сервера. Для диагностических записей используйте `stderr`; `console.log` в отдельном smoke-клиенте протоколу не мешает.
- `UNKNOWN_CITY` или `INVALID_DATE` внутри ответа — ошибка входных данных инструмента, а не обрыв соединения. Ошибка запуска процесса, тайм-аут или закрытый транспорт не дают нормального бизнес-ответа; ищите причину в запуске и соединении.

## Что переносить в своё приложение

В учебном примере транспорт, ответы и завершение соединения видны отдельно от модели. В production-клиенте дополнительно нужны ограничение размеров ответов, подходящие тайм-ауты, отмена запросов, управление жизненным циклом и перевод ошибок в ответ приложения. При вызове через модель также понадобится адаптировать результат инструмента к формату её API. Если данные требуют доступа, отдельно проектируйте аутентификацию и полномочия. Подключение в Claude Code не добавляет эту логику в backend автоматически.

Для реализации клиента сверяйтесь с [официальным SDK ветки v1.x](https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x): пример здесь рассчитан на указанный пакет. Для удалённых серверов существует Streamable HTTP, описанный в [спецификации транспорта](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports); он отличается от прежнего HTTP+SSE. Этот урок HTTP-сервер не реализует.

Упражнение завершено, когда smoke-клиент находит `search_trips`, четыре сценария проходят и вы видите настоящий ответ инструмента в Claude Code. Затем работающий инструмент можно включить в набор расширений: следующий урок — [плагины](/courses/claude-code-guide/07-plugins/).
