---
title: "robots.txt for Google and AI bots: access, training and indexing"
description:
  Separate Google Search indexing, model training and user-triggered fetching. Current crawler names,
  an access policy example and practical checks on artka.dev.
pubDate: 2026-05-01
tags:
  - seo
  - ai-crawlers
draft: false
cover: /og-default.png
coverAlt: artka.dev — technical blog
summary:
  Separate Google Search indexing, model training and user-triggered fetching. Current crawler names, an
  access policy example and practical checks on artka.dev.
keywords:
  - robots.txt
  - AI crawlers
  - GPTBot
  - ClaudeBot
  - PerplexityBot
  - Google-Extended
  - llms.txt
  - SEO 2026
lang: en
sourceHash: 22c36a7e207880c7816a0f7b0c7209194a6458a4906f88f8c0da5da95541d8ca
manuallyEdited: false
updatedDate: 2026-09-07
---

When an article is not indexed, start with Googlebot access and the server response. Allowing GPTBot or publishing llms.txt does not explain Google’s indexing decision.

Public articles on artka.dev are crawlable. `/admin/` and `/api/` are disallowed. Internal search pages remain crawlable but return noindex. These are separate decisions with different purposes.

## Separate three questions

| Goal                              | What to inspect                                               |
| --------------------------------- | ------------------------------------------------------------- |
| Appear in Google Search           | Googlebot, HTTP status, noindex, canonical and useful content |
| Control model-training collection | Rules for the relevant training crawler                       |
| Serve a user-triggered fetch      | The service’s documented fetch behavior                       |

[OpenAI](https://developers.openai.com/api/docs/bots) distinguishes GPTBot for training and OAI-SearchBot for search. ChatGPT-User acts on user requests, where robots.txt may not apply. One bot’s setting should not be treated as a setting for every service.

[Anthropic’s documentation](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler) lists ClaudeBot, Claude-SearchBot and Claude-User. This revision replaces the older Claude-Web and anthropic-ai names used in the article.

Google-Extended is also not a Google Search indexing switch. Check the token’s purpose in [Google’s crawler documentation](https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers).

## A simple access policy

A site allowing all bots to fetch public content could start with:

```text
User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/

Sitemap: https://artka.dev/sitemap-index.xml
```

The live policy is in [robots.txt](/robots.txt). Its named groups repeat the private-route restrictions. Review each specific group in full rather than assuming it inherits restrictions from the wildcard group.

The file is public and should not reveal secret URLs or tokens. It also cannot protect data from clients that ignore it. A private API needs authentication.

## Let Google read noindex

Google must fetch a page to see its HTML noindex directive. Blocking crawling can prevent that. This is why internal search remains crawlable while being excluded through noindex. [Google documents the distinction](https://developers.google.com/search/docs/crawling-indexing/block-indexing).

Check an article with GET, not just HEAD:

```bash
curl -sS -D /tmp/article-headers.txt \
  https://artka.dev/en/blog/robots-txt-ai-crawlers-2026/ \
  -o /tmp/article.html
```

Inspect the HTTP status and any X-Robots-Tag. The HTML should contain the article, its own canonical URL and no unintended noindex. Follow redirects to their final destination: an initial 301 can still end at a 404.

Changing curl’s User-Agent only tests the response to that string. It does not prove access for a real Googlebot request, because a CDN may also inspect its network origin. Search Console’s live URL test helps investigate that separately.

## What llms.txt contributes

This site’s [llms.txt](/llms.txt) is an additional content directory for clients that choose to use it. It does not replace HTML, sitemaps or links. [Google clarified](https://developers.google.com/search/updates) that llms.txt is not required for Google Search and does not affect visibility or rankings.

With only eight indexed pages, correct URLs, accessible content and substantive improvements deserve priority. Adding crawler names is useful only when it implements a specific access policy.

After fixing a page, URL Inspection can request another crawl. That is not an indexing guarantee. [Google’s recrawl guidance](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl) also explains that repeated requests do not make crawling faster.
