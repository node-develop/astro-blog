---
title: "Models and cost: choose by accepted outcomes"
blurb:
  Compare models on completed tasks, account for total usage and bound a print-mode API run without invented
  budget variables.
pubDate: 2026-04-23
order: 11
locale: en
updatedDate: 2026-09-07
---

Start model selection with tasks and acceptance criteria. A lower token rate does not necessarily mean a cheaper accepted fix: retries and manual corrections also consume time.

## Record the setup

Save the exact model ID, provider, settings, starting commit and request. Claude Code aliases can change and should not be copied blindly into another provider’s API code.

Consult [model configuration](https://code.claude.com/docs/en/model-config) for available settings and your provider’s current pricing and billing records for cost. The old course table was an April snapshot, not a permanent price list.

## Build your comparison

For date validation, regression diagnosis and a contract change, record whether the change was accepted, attempts, manual repair time and total usage. Leave cells empty until the experiment runs. Repeat tasks and retain failures rather than reporting only successes.

Measure the cost of completing the task, including helpers and retries. Distinguish API charges from time spent waiting and reviewing.

## Bound a print-mode run

The documented print-mode flag is:

```bash
claude -p --max-budget-usd 1.00 "Explain the README without editing files"
```

Check version support and scope in the [CLI reference](https://code.claude.com/docs/en/cli-reference). This concerns API spending in that mode, not the entire account or infrastructure bill. The previous article’s unsupported session/daily budget environment variables have been removed.

## Diagnose spending before switching models

Identify expensive tasks, then inspect iteration counts, tool-output volume, repeated failures and helper activity. A model switch cannot repair an infinite loop or a missing stopping condition.

Subscription billing and API usage differ. `/cost` is not a cross-session report for yesterday. See the [cost documentation](https://code.claude.com/docs/en/costs).

Next: [project blueprint](/en/courses/claude-code-guide/12-travel-agent-blueprint/).
