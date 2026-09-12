# Latest publications and deployment gate — 2026-09-12

## Findings and fixes

Public post lists sorted by `posts_meta.pinned` and then `posts_meta.order`.
The publishing API assigns new rows order `2_000_000_000`, so recently published
articles appeared after older content. Homepages take the first four list entries.

Public lists now sort by publication date descending, with the article ID as a
stable tie-breaker. Pins, editorial order and revision dates do not move an older
article above a newer one. Visibility and draft filters are unchanged. The existing
homepage layout remains; no separate pinned section was added. Archives, their
pagination, related posts and previous/next links share the same chronology.

CI and Docker publishing previously ran independently on `main`. Docker publishing
now calls the reusable CI workflow from the same commit and requires that job to
succeed before building/pushing an image or invoking the Dokploy webhook. Both the
validation and PostgreSQL integration jobs must pass. This also gates manually
started and tag-triggered image builds. Pull requests still run CI independently.
The existing dependency-audit step remains advisory.

Both new API documents failed the repository's Markdown formatting check. The
serializer now formats the final document with Prettier before enqueueing it for
publication. Prettier is a production dependency because the API uses it at runtime.
The two existing Mailu documents received formatting-only changes, preserving their
publication dates and API revision markers.

## SEO and Google Search Console

Checked the Russian and English versions of `custom-domain-email-mailu-dokploy`:

- Both canonical article URLs return HTTP 200 and permit indexing.
- Each has one H1, a description, a self-referencing canonical URL and reciprocal
  RU/EN language alternates, including `x-default`.
- BlogPosting JSON-LD includes the correct publication date, author, publisher and
  image. The image returns HTTP 200 with an image content type.
- Both URLs appear in their locale sitemap with `lastmod` of 2026-09-12, and in
  JSON/RSS feeds. The robots file permits article crawling.
- Search Console initially reported both URLs as unknown to Google, with no prior
  crawl. This is not a finding that their content has low quality.
- Live URL tests passed for both languages: available to Google and indexable.
  Breadcrumb structured data had one valid item and no errors for each URL.
- Indexing requests for both URLs were accepted into the priority crawl queue.
- The sitemap index had previously been processed successfully on September 7
  with 68 discovered pages. Resubmission of the updated index was accepted.
- The separate validation of 11 older URLs started September 11 remains pending;
  it was not restarted.

These checks establish technical discoverability, not guaranteed indexing or
ranking. Google decides whether and when to index a page. See
[Google's recrawl guidance](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl).

## Regression coverage

Tests cover new API articles outranking old pinned posts, deterministic date ties,
unchanged draft/locale filtering, the actual built RU/EN homepages, archive first
pages and subsequent page fragments, CI prerequisites, and generated Markdown
passing the same Prettier configuration as CI. Existing content API contract and
integration tests cover the asynchronous serializer's publication path.
