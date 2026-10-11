---
title: "Draft boundaries: draft and sourceHash in artka.dev"
description: "A training draft for checking the native schema, exclusion from public routes, and translation correspondence."
summary: "The draft flag excludes an article from public routes. sourceHash tracks translatable Russian content; a separate digest binds the review to the exact bytes of both versions."
pubDate: 2026-10-11
tags:
  - astro
  - build-tooling
lang: en
draft: true
manuallyEdited: true
sourceHash: ffe7b307e27fff2df722d9bdf5b3cfafb4c14430b1bf86ddd74ba59d5efd3ff8
---

This training article checks the boundaries of the local editorial workflow. It belongs in test fixtures and is not intended for publication.

## Keeping a draft out of public routes

In the current project, `getStaticPaths` for Russian and English articles selects entries with `draft: false`. The `hiddenFromList` field controls listings, while the direct article route is built separately. A temporary file needs an explicit `draft: true`.

This finding comes from the [Russian article route](https://github.com/node-develop/astro-blog/blob/main/src/pages/blog/%5B...slug%5D.astro) and its [English counterpart](https://github.com/node-develop/astro-blog/blob/main/src/pages/en/blog/%5B...slug%5D.astro). The `e2e-` prefix excludes some test files from translation checks; it does not itself prevent publication.

## What the translation hash tracks

The `contentHash("posts", ruRaw)` function covers the body and translatable frontmatter: title, description, summary, coverAlt, and FAQ. Changing tags or dates does not change this hash. The algorithm is documented in the [hash module](https://github.com/node-develop/astro-blog/blob/main/src/lib/translate/hash.ts).

The following example is a fragment to run from the repository root. Its result depends on the supplied file; updating a hash mechanically cannot replace synchronizing the translation.

```ts
import { contentHash } from "./src/lib/translate/hash";

const sourceHash = contentHash("posts", ruRaw);
```

## Checks that remain separate

A matching sourceHash records which source the translator acknowledged. An editor checks whether the translation preserves its meaning. The editorial package digest covers the exact Russian and English bytes: changing either version invalidates an older review.

A build with `draft: true` checks compilation without showing the article page. Visual review needs a separate local project copy and a real Astro preview. If no browser ran, the report keeps `not-run`.
