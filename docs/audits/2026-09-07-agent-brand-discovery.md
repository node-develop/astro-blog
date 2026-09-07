# Agent brand discovery follow-up

## Findings and changes

The supplied Ora evidence searched for `Claude Code, LLM`, which describes topics, not the publication's brand. A web search for `"artka.dev"` on 2026-09-07 returned the contact page and homepage among the first results. This is evidence of brand discoverability in that search provider, not a guarantee of Google ranking or a new Ora result.

Both homepage titles now start with `artka.dev — Artyom Kashuta`; descriptions identify the personal technical blog. Existing `WebSite.name`, `Organization.name`, `og:site_name`, the visible masthead, canonical domain and author links already use the correct identity and remain intact. The visible page design is unchanged.

Both LLM digests now explicitly identify the site name, canonical homepage, author and editorial contact. In `llms.txt`, explanatory guidance and attribution precede the H2 file-list sections, as required by the published format. Existing retrieval links and content remain available.

## Organization address decision

The existing Organization node represents the publication, links its founder to the Person node, and includes a ContactPoint with `a@artka.dev`, contactType and the contact-page URL. The public contact page and humans.txt describe a remote personal publication; no public postal address is documented. A postal address or telephone number must not be inferred from a private residence, timezone or employer.

The address audit item therefore remains unresolved pending an owner-supplied public correspondence/business address. Once supplied, publish the same address on both contact pages and add `address: { "@type": "PostalAddress", ... }` to `buildOrganizationNode`, using actual street/locality/postal code/country fields. Add schema and rendered-output assertions. Do not publish a placeholder, empty PostalAddress or claim an unrelated business listing.

Google's Organization guidance has no universal required properties; use applicable, accurate properties. An audit's recommended address score is not proof that this personal publication needs a physical business location.

## Remaining external work

- Rerun Ora with the actual brand `artka.dev`; retain before/after evidence.
- In Google Search Console, inspect the canonical homepage after deployment and request indexing if appropriate. Search engines choose indexing and ranking; a code change cannot guarantee a top position.
- Keep owned GitHub, LinkedIn and X profiles consistent with `artka.dev`, Artyom Kashuta and `https://artka.dev/`. Profile editing requires access to the respective accounts. Keep personal profiles associated with Person, rather than falsely treating them as separate Organization accounts.
- Earn relevant editorial mentions linking directly to the canonical domain. Outreach and third-party publication require separate action; do not create fictitious press mentions or listings.
- If a public address is supplied, use it consistently wherever the publication is legitimately listed.

## Protocol references

- [Google site names](https://developers.google.com/search/docs/appearance/site-names)
- [Google Organization structured data](https://developers.google.com/search/docs/appearance/structured-data/organization)
- [Schema.org PostalAddress](https://schema.org/PostalAddress)
- [llms.txt format](https://llmstxt.org/#format)

## Verification

Regression tests cover brand-first HTML/social metadata, canonical URLs, linked WebSite/Organization identity, editorial contact, digest identity and the Markdown syntax tree of llms.txt. The release verification also checks sitemap-listed pages, their advertised Markdown alternates, feeds, sitemaps, robots.txt, humans.txt, the web manifest and public API discovery endpoints. Full release results are recorded with the deployment artifacts.
