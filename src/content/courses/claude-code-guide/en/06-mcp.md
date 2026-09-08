---
title: "MCP: connect a tool and verify its contract"
blurb:
  Check MCP transport, scope, tools, inputs and errors step by step. Separate development configuration from
  the production application.
pubDate: 2026-04-23
order: 6
locale: en
updatedDate: 2026-09-08
---

If itinerary search already exists, MCP provides a way to expose it to an assistant. MCP defines the exchange for tools and data. A successful connection does not prove that a tool returns correct prices, validates input or has appropriate access.

## Connect a local fixture server

Prepare and test an MCP server that only reads itinerary fixtures. Assume its built entry point is `/absolute/path/trip-tools/server.mjs`; replace this placeholder.

```bash
claude mcp add --transport stdio --scope local trip-fixtures -- node /absolute/path/trip-tools/server.mjs
claude mcp get trip-fixtures
claude mcp list
```

Open `/mcp` in the session and inspect the available tools. The [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp) distinguishes local/user configuration in `~/.claude.json` from project configuration in `.mcp.json`. The local scope makes a setting specific to the current project and user; it is not a restriction on the tool’s own permissions.

For remote servers, use the documented HTTP transport. Streamable HTTP supports server messages and differs from legacy HTTP+SSE. Consult the [MCP transport specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).

## Define the fixture contract

A search_trips tool can accept origin, destination and date. Return an option ID, data source, retrieval time, price and currency. Mark fixture prices explicitly.

Test valid input, an unknown city, an invalid date and no results. An empty result must not become an invented offer. Bound large responses and provide a separate detail lookup.

## Verify the SDK separately

Do not mix Python and TypeScript client examples. Start from the [official TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk), pin a version and test the connection without an LLM first.

Your production backend still needs client lifecycle management, connection cleanup, timeouts and conversion from MCP responses to the model API’s format. Claude Code does not implement those parts of your application automatically.

## Acceptance criterion

The server starts reproducibly, exposes the expected tool, rejects invalid input and performs no bookings. Add model-driven tool selection only after those checks pass.

Next: [plugins](/en/courses/claude-code-guide/07-plugins/).
