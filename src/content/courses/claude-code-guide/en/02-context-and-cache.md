---
title: "Context and prompt caching: what actually gets cheaper"
blurb:
  Distinguish context capacity, conversation history and cached request prefixes. Measure actual cost and preserve
  task state before starting a new session.
pubDate: 2026-04-23
order: 2
locale: en
updatedDate: 2026-09-07
---

Context is the material available to the model in a request. Conversation history is one source of that material. Prompt caching reuses a processed request prefix; it is neither permanent conversational memory nor free execution.

Available context depends on the model, account and provider. The course’s previous fixed 200k assumption and claim that `opusplan` cannot use 1M are obsolete. Consult [model configuration](https://code.claude.com/docs/en/model-config) and inspect your active session.

## Separate cost components

For an API application, calculate ordinary input, cache writes, cache reads and output independently, using the provider’s applicable rates. Save usage for every request. History can grow across turns, so multiplying one short request by the number of turns does not produce an accurate session total.

In Claude Code, `/cost` describes the current session and `/usage` concerns usage limits. Reconcile the actual bill with the billing system. The [cost documentation](https://code.claude.com/docs/en/costs) explains differences between payment arrangements.

## Investigate a cache miss

Check whether the relevant prefix repeated, settings changed or cached material expired. One miss does not establish that caching has permanently stopped. Use request usage records to see what happened next.

Also inspect unnecessary content: database dumps, repeated file output and irrelevant tool descriptions make a conversation harder to work with regardless of pricing. Select excerpts needed for the current decision.

## Exercise: repeat a request

In a test API project, send the same safe task twice with an identical prefix and the documented caching configuration. Save usage and duration. Change part of the prefix and repeat. Label each observation with the model and request time. Do not treat subscription limits as if they were API token charges.

The experiment should report observations rather than a promised percentage saving. Explain which costs it includes and which it excludes.

## Before clearing the conversation

Save the task, decisions, changed files, completed checks and next action. Start a new session when the old context becomes an obstacle. `/clear` should not erase the only record of unfinished work.

Next: [CLAUDE.md](/en/courses/claude-code-guide/03-claude-md/).
