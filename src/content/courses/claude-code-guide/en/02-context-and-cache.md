---
title: "Context and prompt caching: what actually gets cheaper"
blurb:
  Distinguish context capacity, conversation history and cached request prefixes. Measure actual cost and preserve
  task state before starting a new session.
pubDate: 2026-04-23
order: 2
locale: en
updatedDate: 2026-09-08
---

Context is the material available to the model in a request. Conversation history is one source of that material. Prompt caching reuses a processed request prefix; it is neither permanent conversational memory nor free execution.

Use `/context` to inspect context consumption in Claude Code. Available capacity depends on the model and access conditions; check [model configuration](https://code.claude.com/docs/en/model-config) rather than relying on a remembered fixed limit.

## Separate cost components

For an API application, calculate ordinary input, cache writes, cache reads and output independently, using the provider’s applicable rates. Save usage for every request. History can grow across turns, so multiplying one short request by the number of turns does not produce an accurate session total.

Current Claude Code combines session information and plan limits in `/usage`; `/cost` is an alias, as the [commands reference](https://code.claude.com/docs/en/commands) explains. The client-side dollar figure is an estimate rather than an authoritative bill. Reconcile the actual bill with the billing system. The [cost documentation](https://code.claude.com/docs/en/costs) explains differences between payment arrangements.

## Investigate a cache miss

Check whether the relevant prefix repeated, settings changed or cached material expired. One miss does not establish that caching has permanently stopped. Use request usage records to see what happened next.

Also inspect unnecessary content: database dumps, repeated file output and irrelevant tool descriptions make a conversation harder to work with regardless of pricing. Select excerpts needed for the current decision.

## Exercise: repeat a request

Imagine a long set of trip-planning instructions followed by different cities and dates. That repeated beginning is the prefix. In a test API project, enable caching using the [Anthropic caching guide](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) and send the same task twice with that prefix. The prefix must meet the chosen model’s minimum cacheable length: a short greeting is not a useful test. Save the response’s `usage` token counters, including cache reads and writes, and request duration. Change part of the prefix and repeat. Label each observation with the model and request time. Do not treat subscription limits as if they were API token charges.

The experiment should report observations rather than a promised percentage saving. Explain which costs it includes and which it excludes.

## Before clearing the conversation

Save the task, decisions, changed files, completed checks and next action. Start a new session when the old context becomes an obstacle. `/clear` should not erase the only record of unfinished work.

Next: [CLAUDE.md](/en/courses/claude-code-guide/03-claude-md/).
