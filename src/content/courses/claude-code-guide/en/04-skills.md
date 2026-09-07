---
title: "Skills: a repeatable procedure in SKILL.md"
blurb:
  Create a small API-contract review skill. Separate procedural instructions from tool permissions and verify
  that invocation works.
pubDate: 2026-04-23
order: 4
locale: en
updatedDate: 2026-09-07
---

A skill fits a repeated procedure: reviewing a contract, preparing a PR description or investigating a recurring error. Start with something you can perform manually. Otherwise SKILL.md becomes a wish list without an observable outcome.

## Example: review an API contract

Create `.claude/skills/review-contract/SKILL.md`:

```markdown
---
name: review-contract
description: Reviews API contract changes against source and tests.
disable-model-invocation: true
---

Review the requested endpoint contract.

1. Locate the input schema, handler and response definition.
2. Compare required fields, error statuses and authorization.
3. Find tests for valid and invalid requests.
4. Return discrepancies with file references.
5. Distinguish reading a test from executing it.
```

Invoke `/review-contract` and describe the endpoint. Begin with a local fixture where the schema requires a date but the handler accepts an empty string. The expected result is that discrepancy, not generic validation advice.

## Configuration boundaries

The [skills reference](https://code.claude.com/docs/en/skills) documents supported fields. `disable-model-invocation` reserves invocation for the user. `allowed-tools` pre-approves tools; it does not make them the only available tools or create a sandbox. `context: fork` changes conversational context, not filesystem isolation.

Verify fields against the installed version rather than choosing plausible names. Claude Code skills and packages for other clients can support different configuration.

## Improve from observed failures

If the agent cannot locate a schema, add its actual path. Move lengthy references into separate files with a clear condition for reading them. Document a bundled script’s inputs, outputs and local verification.

Run that script manually on test data first. Then check that the skill supplies the same arguments and handles failure correctly.

## Acceptance criterion

The skill identifies the prepared discrepancy, cites evidence and leaves files unchanged unless asked to fix them. Repeat with a correct contract: finding no issue must also be a valid result.

Next: [hooks](/en/courses/claude-code-guide/05-hooks/).
