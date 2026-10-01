---
title: "MCP: connect a tool and verify its contract"
blurb: Build a local MCP server for fixture itinerary search. Test four cases without a model, then connect the tool to Claude Code.
pubDate: 2026-04-23
order: 6
locale: en
updatedDate: 2026-10-01
---

To give Claude Code access to your itinerary search, expose that search as an MCP tool. In this lesson you will create a small server, check its responses with a separate client and connect it to Claude Code. The server reads just three fixture offers: it needs no API keys, live prices or booking capability.

MCP is a protocol for exchanging tools and data between an application and a server. A successful connection confirms that they can communicate. It does not prove that search validates a date or distinguishes an empty result from an error. We will check those conditions without a model first.

## Prepare a separate directory

You need Node.js 24 and npm. For the last step, you also need Claude Code installed and signed in. The commands assume Bash or Zsh, for example on macOS or Linux. Create a fresh directory next to your exercise project, not inside a directory containing secrets:

```bash
mkdir trip-tools && cd trip-tools
npm init -y
npm install --save-exact @modelcontextprotocol/sdk@1.31.0 zod@4.6.5
```

The command pins the two direct dependencies. Keep the generated `package-lock.json` if you move the exercise: it also locks transitive dependencies, and `npm ci` uses it for repeat installation. The `.mjs` extension lets us use ES modules without configuring TypeScript or building anything.

After installation, the server and smoke client make no network requests. The later Claude Code session uses a model, but the tool itself stays local.

## Create the three-offer fixture server

Save this entire block as `server.mjs` inside `trip-tools`:

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

`ESB` is Ankara, `IST` is Istanbul and `BKK` is Bangkok. These are airport codes; the error name `UNKNOWN_CITY` is retained as part of the exercise contract. Search takes strings, uppercases airport codes and returns offers only for an exact route and date match.

All prices are invented teaching data. `source: "fixture"` and `fixture: true` identify them in both successful responses and errors. There is no retrieval timestamp: the server does not query a supplier.

Date validation does not depend on the current day. For example, `2026-02-30` is rejected because it is not a real calendar date, while a valid date with no offers returns an empty list. The exercise will therefore still work after December 24.

The server returns an object in `structuredContent` and the same object as JSON in text `content`. A tool error sets `isError: true`; a completed search, including an empty one, sets it to `false`. The SDK rejects an incorrect argument type, such as a number instead of a string, before the handler runs. The four cases below test string inputs and the handler's business responses.

Start the server on its own:

```bash
node server.mjs
```

It waits for input without printing a prompt. This is normal: `stdio` exchanges messages over `stdin` and `stdout`, not an HTTP port. Press Ctrl+C before continuing. Do not add `console.log` to the server: ordinary text on `stdout` interferes with the protocol. Send diagnostic messages to `stderr` instead.

## Test the tool without Claude or a model

Save the second file, `smoke.mjs`, next to `server.mjs`. It starts the server as a child process through the official SDK client. Each tool call has a five-second timeout, and the connection is closed at the end even if an assertion fails.

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

Run the check from the same directory:

```bash
node smoke.mjs
```

This step needs no Claude Code login, model or paid API. Expected output when every check passes:

```text
PASS tool discovery
PASS success: two fixture trips
PASS unknown city: UNKNOWN_CITY
PASS invalid date: INVALID_DATE
PASS empty result: successful search, no trips
```

The test checks more than the number of offers. It compares IDs, prices, currency, fixture markers and equality between the JSON text and structured response. If you see an `AssertionError`, inspect which check differs. Do not move to the model integration until the result is understood.

The four-request contract:

| Request                   | Expected response                               |
| ------------------------- | ----------------------------------------------- |
| `ESB → BKK`, `2026-12-24` | `isError: false`, two offers at 640 and 710 USD |
| `XXX → BKK`, `2026-12-24` | `isError: true`, `error.code: "UNKNOWN_CITY"`   |
| `ESB → BKK`, `2026-02-30` | `isError: true`, `error.code: "INVALID_DATE"`   |
| `ESB → IST`, `2026-12-24` | `isError: false`, `trips: []`                   |

An empty list means search completed but the data contains no matching offer. It is neither a connection failure nor a reason to invent an itinerary.

## Connect the server to Claude Code

Stay in `trip-tools` and run:

```bash
claude mcp add --transport stdio --scope local trip-fixtures -- "$(node -p 'process.execPath')" "$PWD/server.mjs"
claude mcp get trip-fixtures
claude mcp list
claude
```

This records absolute paths to Node.js and the server. Quoting preserves paths containing spaces. You do not need to leave `node server.mjs` running: Claude Code launches the process for `stdio` itself.

`--scope local` associates the setting with this project and your user. Open Claude Code from `trip-tools`; a setting from another project may not be available. The [Claude Code documentation](https://code.claude.com/docs/en/mcp) places local and user settings in `~/.claude.json`, and shared project settings in `.mcp.json`. Configuration scope does not restrict the server process's permissions. `readOnlyHint` also describes the tool rather than creating a sandbox: our code ensures that it does not write or book anything.

Inside the session, open `/mcp` and check the `trip-fixtures` connection. Then send this request:

> Use search_trips on the trip-fixtures server with origin=ESB, destination=BKK, date=2026-12-24. Show id, price, currency, source and fixture from the tool response. Do not search for real flights or book anything.

Approve the call if the client requests permission. Compare the actual tool result with the table, not just Claude's paraphrase. Repeat with the other three argument sets. If the model chooses not to call the tool, that is not a server test result: `smoke.mjs` already checks the server independently.

When finished, exit the session and remove the local configuration from the same directory:

```bash
claude mcp remove --scope local trip-fixtures
```

## If the example does not run

- `node` or `npm` not found: install Node.js 24 and open a new terminal. `ERR_MODULE_NOT_FOUND` usually means dependencies were not installed next to the files; return to `trip-tools` and run the installation command.
- The server waits after `node server.mjs`: this is expected for `stdio`. Stop it with Ctrl+C and run `node smoke.mjs`, which launches its own process.
- Claude cannot see the server: check the current directory, local scope and paths with `claude mcp get trip-fixtures`. Register a new absolute path after moving the directory.
- Message parsing error: remove ordinary output from the server's `stdout`. Use `stderr` for diagnostics; `console.log` in the separate smoke client does not interfere with the protocol.
- `UNKNOWN_CITY` or `INVALID_DATE` in a response is a tool input error, not a broken connection. A process startup failure, timeout or closed transport does not yield a normal business response; investigate startup and connection handling.

## What belongs in your application

The exercise makes transport, results and connection cleanup visible separately from the model. A production client also needs response-size limits, appropriate timeouts, request cancellation, lifecycle management and conversion of errors into application responses. For model-driven calls, it also needs to adapt tool results to the model API's format. If data requires access controls, design authentication and authorization separately. Configuring MCP in Claude Code does not add this logic to your backend automatically.

Consult the [official v1.x SDK](https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x) when implementing a client: this example targets the pinned package. Remote servers can use Streamable HTTP, described in the [transport specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports); it differs from legacy HTTP+SSE. This lesson does not implement an HTTP server.

The exercise is complete when the smoke client discovers `search_trips`, all four cases pass and you inspect a real tool result in Claude Code. A working tool can then join a reusable set of extensions: next, [plugins](/en/courses/claude-code-guide/07-plugins/).
