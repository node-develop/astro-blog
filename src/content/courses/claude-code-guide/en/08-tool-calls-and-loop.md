---
title: "Tool calls: the loop, failures and stopping conditions"
blurb:
  Trace tool requests, results and termination. Use bounded pseudocode and failure cases instead of an unbounded
  production example.
pubDate: 2026-04-23
order: 8
locale: en
updatedDate: 2026-09-07
---

A model can propose a tool call. The application must validate arguments, execute it and return the result. Treat this as a protocol: each call has an identifier and its result must refer to that call.

Anthropic’s API uses tool_use and tool_result blocks, documented in the [tool-use guide](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview). Not every response block is text; streaming code must inspect event types before reading a text field.

## Bounded loop

This is pseudocode, not a complete SDK implementation:

```text
while within the step limit and deadline:
    request a model response
    preserve it in history
    if the response completes the task:
        return the result
    if it requests tools:
        validate each name, input and permission
        execute with a timeout
        record success or failure using the original call ID
        return those results to the model
    otherwise:
        handle the stopping reason explicitly
on limit:
    return an incomplete status and preserved state
```

A max_tokens stop is not successful task completion. Repeating indefinitely without checking progress is not recovery.

## Errors belong in the contract

If itinerary search times out, report a timeout rather than an empty result set. Otherwise the agent might claim there are no flights when no search completed.

Distinguish transient failures, invalid input and missing data. Retry only operations that support it. Bookings and publication need protection against duplicate effects: a timeout does not establish that the first request did nothing.

## Parallelism

Independent reads can run together. A write and its verification are dependent. Running every requested tool concurrently is not a universal optimization.

## Exercise

Create a fixture tool returning success, invalid-input errors and timeouts. Check that every result uses the right call ID, history is preserved and the loop stops at its limit. Add unknown-tool and permission-denied cases.

The application should report the task’s real state, avoid uncontrolled duplicate effects and terminate. Only then connect a real API and measure the path to an accepted result.

Next: [subagents](/en/courses/claude-code-guide/09-subagents/).
