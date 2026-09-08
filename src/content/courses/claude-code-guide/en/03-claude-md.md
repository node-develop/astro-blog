---
title: "CLAUDE.md: instructions, imports and memory boundaries"
blurb:
  Maintain repository instructions without confusing them with security settings. Verify commands, inspect
  imports and remove conflicting rules.
pubDate: 2026-04-23
order: 3
locale: en
updatedDate: 2026-09-08
---

If every new conversation starts with the same project explanation, put the stable parts in CLAUDE.md. The file should answer practical questions: where the code lives, how to verify a change and which project constraints matter. Copying the entire documentation into the root file obscures those answers.

The [memory documentation](https://code.claude.com/docs/en/memory) recommends concise instructions. `@path` imports load text rather than creating a free reference store. MEMORY.md startup limits are a separate mechanism and should not be applied to CLAUDE.md.

## Start with a small instruction file

```markdown
# Trip planner

Teaching service: searches itinerary fixtures without bookings.

## Before editing

- Locate the request handler and its relevant test.
- Preserve the existing response format.
- Do not add external integrations to a local validation task.

## Verification

Use commands defined in this repository's package.json and README.
Report the check actually run and its result.
```

Once the project exists, replace the generic verification sentence with its real command. Do not paste `pnpm test` into instructions for a project without that script.

## Where longer explanations belong

Keep common constraints near the root and subsystem details near the relevant code or in a reference document. An occasional procedure can become a skill. Distinguish a reference link from an import of the entire document: their startup context costs differ.

Do not treat conflicting instructions as a reliable last-rule-wins configuration system. Resolve contradictions in their source files.

## Check the instructions against your project

Create an instruction-to-evidence table. A command needs a successful run, a path needs an existing file, and a restriction needs an architectural reason or team agreement.

Remove deleted-library references. Replace “write good tests” with observable behavior. Check whether imported documents duplicate existing rules. Ask the agent to explain how it would handle a small task and compare that explanation with the intended workflow.

## Instructions are not access controls

The file helps a model choose actions. It does not itself isolate secrets or prohibit network operations. Test execution settings and environment restrictions separately using disposable data.

The [12-rule article](/en/blog/claude-md-12-rules/) supplies practical criteria. Next: [skills](/en/courses/claude-code-guide/04-skills/).
