---
title: "Plugins: package and validate reusable tools"
blurb: Build a minimal plugin with one skill, validate it locally and document dependencies before distribution.
pubDate: 2026-04-23
order: 7
locale: en
updatedDate: 2026-09-08
---

Copying a skill into several projects soon leaves you with several different versions. A plugin packages working skills, hooks or agents so they can be reused together. Start with one skill you already know how to test.

## Minimal layout

```text
trip-toolkit/
  .claude-plugin/plugin.json
  skills/review-contract/SKILL.md
```

Manifest:

```json
{
  "name": "trip-toolkit",
  "version": "0.1.0",
  "description": "Contract review exercises for the trip planner"
}
```

Use the procedure from the [skills lesson](/en/courses/claude-code-guide/04-skills/) as SKILL.md. From the parent directory:

```bash
claude plugin validate ./trip-toolkit
claude --plugin-dir ./trip-toolkit
```

Validation checks the package structure; `--plugin-dir` loads it for the session. Invoke its skill as `/trip-toolkit:review-contract` and supply the API endpoint. Plugin skills use the package name as a prefix. Directory conventions and commands are documented in the [plugin guide](https://code.claude.com/docs/en/plugins) and [reference](https://code.claude.com/docs/en/plugins-reference).

## Verify behavior

Confirm the plugin loads, exposes the skill and reviews the prepared fixture. Repeat from a different working directory to detect accidental path dependencies.

A hooks/hooks.json file needs its outer hooks field. Reference bundled scripts through documented plugin-root variables with correct quoting. Do not assume recipients have your globally installed packages.

## Document the installation

The README should name the purpose, tested client version, dependencies, installed components and side effects. Include a test request and expected result. Describe required environment variables without publishing their secret values.

Version behavioral changes and call out new tools or access requirements in the changelog.

## Exercise

Move the package into a fresh temporary directory and follow its README. Every missing step is a documentation defect. A local plugin is sufficient until installation is reproducible; a marketplace is not required for this exercise.

Next: [tool calls](/en/courses/claude-code-guide/08-tool-calls-and-loop/).
