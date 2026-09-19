---
title: "JSON-LD @graph in Astro: connect entities and verify the HTML"
description:
  "How artka.dev assembles JSON-LD: stable entity IDs, canonical URLs, safe serialization and checks
  against published HTML. No indexing guarantees."
pubDate: 2026-05-02
tags:
  - seo
  - astro
  - schema-org
draft: false
cover: /og-default.png
coverAlt: artka.dev — technical blog
summary:
  "How artka.dev assembles JSON-LD: stable entity IDs, canonical URLs, safe serialization and checks against
  published HTML. No indexing guarantees."
keywords:
  - JSON-LD
  - Schema.org
  - Astro
  - "@graph"
  - structured data
  - LLM citation
lang: en
sourceHash: bb14be88e39576b22a94953c2948ea8ff854d46388c230e7e85579e1ecd4e3b3
manuallyEdited: false
updatedDate: 2026-09-07
---

An article has an author, a website and its own address. When separate components generate those facts, they can disagree: two author URLs, or an update date that differs from the visible page. A shared JSON-LD graph makes these inconsistencies easier to find.

Using `@graph` does not guarantee indexing, rich results or AI citations. Multiple correct JSON-LD blocks are also valid. A single graph is a maintenance choice here.

## The repository approach

On artka.dev the author and website data live in a shared layer, the `src/lib/seo` directory. Each page adds its entities and references shared ones through stable `@id` values. Updating the author profile then has one source. The site source code is not published, so the fragments below are shortened; my GitHub profile is [node-develop](https://github.com/node-develop).

This shortened example illustrates relationships; it is not a complete Google Article template:

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Person",
      "@id": "https://artka.dev/#person",
      "name": "Artyom Kashuta"
    },
    {
      "@type": "WebSite",
      "@id": "https://artka.dev/#website",
      "url": "https://artka.dev/",
      "name": "artka.dev"
    },
    {
      "@type": "WebPage",
      "@id": "https://artka.dev/en/blog/json-ld-graph-astro/#webpage",
      "url": "https://artka.dev/en/blog/json-ld-graph-astro/",
      "isPartOf": { "@id": "https://artka.dev/#website" }
    },
    {
      "@type": "BlogPosting",
      "@id": "https://artka.dev/en/blog/json-ld-graph-astro/#article",
      "headline": "JSON-LD @graph in Astro",
      "author": { "@id": "https://artka.dev/#person" },
      "mainEntityOfPage": {
        "@id": "https://artka.dev/en/blog/json-ld-graph-astro/#webpage"
      }
    }
  ]
}
```

The page URL in the graph, canonical tag, sitemap and internal links should identify the same URL version. This site uses trailing slashes. English articles have their own `/en/` addresses; hreflang connects translations without replacing their canonical URLs with Russian originals.

## Check data before publication

Use the same content record for visible text and structured data. Otherwise an editor can update the headline while the graph continues to publish an older value.

Check that the headline matches, publication dates remain intact, and modification dates reflect substantive edits. Images should be accessible at absolute URLs and represent the page. Author identity should agree across languages. Entity references should resolve to the intended nodes. Draft text, secrets and content absent from the page must not leak into metadata.

Serializing JSON inside HTML also requires protecting against a `</script>` string ending the element prematurely. This repository uses `safeJsonLd`. Concatenating untrusted frontmatter into a `set:html` string is not an equivalent implementation.

## Inspect the server response

Find `application/ld+json` in the published page source and parse it as JSON. Use Schema Markup Validator for vocabulary checks and Rich Results Test for Google-supported formats. Valid JSON, correct Schema.org data and eligibility for a search feature are separate checks.

This repository includes `pnpm verify:seo-build`, run after `pnpm build`. A production request additionally checks redirects, public URLs and image access that a local build cannot establish.

## What markup cannot do

[Google’s structured-data introduction](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data) describes understanding content and eligibility for supported search appearances; display is not guaranteed. Markup cannot compensate for inaccurate writing.

A correction to the previous version: Google stopped displaying FAQ rich results on May 7, 2026, as recorded in its [documentation updates](https://developers.google.com/search/updates). Useful questions can remain for readers, without promising a search benefit.

The next check is whether crawlers can access the page itself. See [robots.txt and indexing](/en/blog/robots-txt-ai-crawlers-2026/).
