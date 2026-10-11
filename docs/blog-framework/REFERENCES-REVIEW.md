# Upstream references and templates audit

Scope: read-only review of all 22 `skills/blog/references/*.md`, all 12 `skills/blog/templates/*.md`, and `docs/TEMPLATES.md` at `AgriciDaniel/claude-blog` commit `2500d4c765034864cede2bf215d00ccd4d7d6fb8`. All 11,088 lines read, including embedded examples; no upstream executable code, installers, hooks, network integrations, or content publication executed. Also read upstream `LICENSE` / `NOTICE`, target `AGENTS.md` / `CLAUDE.md`, native content schema, limits, author identity, translation fields/hash, and route filters. External provider claims were not independently reverified: this audit evaluates what the pinned reference says and identifies what needs current primary-source verification before use.

## Findings that must shape the adapter

1. **Do not import upstream delivery gates unchanged.** `references/blog-delivery-contract.md:40-47` demands `.md`, standalone `.html`, `.pdf`, and 1200×630 PNG/JPEG for every delivery; `:34-35` blocks missing hero path or a named reviewer agent; `:81-82` blocks below 90/100 or any P0. Native Astro source/build, real site templates, current site OG fallback, and local preview are the correct integration artifacts. Standalone renderer output cannot validate real artka.dev routes, components, canonical/hreflang, MDX, Mermaid, or CSS. Keep an independent review and fail on factual/schema/link/security defects; report editorial metrics honestly as advisory. Optional PDF/media exports are separate explicit capabilities.

2. **Paid image generation and downloads are not implied authorization.** `references/blog-delivery-contract.md:116-120` automatically tries Banana MCP, direct Gemini, stock APIs, then Openverse. API-key presence is not permission to spend, upload content, or fetch assets. Use existing/local user-approved assets or the site's native OG behavior by default. Missing optional services must be a reported limitation, not a setup loop. External checks require the documented SSRF/redirect policy at `:102-107`; do not transplant generic network calls.

3. **Reject AI-authorship claims and preserve Russian punctuation.** `references/synthesis-contract.md:40-48` bans em/en dashes and at `:44` claims em dashes are the “single most reliable AI-slop tell.” This directly conflicts with `references/ai-slop-detection.md:7-9` and `:166-170`, which explicitly prohibit authorship inference and scoring/blocking from stylistic diagnostics. `references/content-rules.md:216-219` has an absolute U+2014 ban. Normal RU dash use is not a defect. The wrapper must explicitly override those claims, not merely describe all upstream rules as safe.

4. **Several reference rubrics contradict their newer no-quota language.** `references/quality-scoring.md:7-12` permits audience-dependent readability and no sentence/heading quotas; `:92-113` still calls fewer than 8 stats, a title outside 40–60 characters, Flesch outside 55–75, fewer than 2 charts or 3 images, sentence length, and transition proportions defects. `:70` says 80–89 is ready for publication, while delivery contract requires 90. `references/editorial-heuristics.md:12` calls P1 a ship blocker, but delivery contract singles out P0; its example severity rows also do not match the initial ordinal mapping. Establish one project verdict schema and one set of actual blocking checks, with no claim of Google-calibrated score or automatic publishing.

5. **Native fields must override the obsolete generic Astro example.** `references/platform-guides.md:174-218` uses `src/content/config.ts`, `src/content/blog/`, `heroImage`, `heroImageAlt`, and older `type: 'content'` collection configuration. artka.dev uses `src/content.config.ts`, content-layer `glob`, collection `posts`, `src/content/posts`, `cover` / `coverAlt`, `pubDate` / `updatedDate`, default author from `person`, `lang`, RU/EN twins, `sourceHash`, `manuallyEdited`, plus native summary/FAQ constraints. Never replace the content schema or add duplicate metadata machinery from this example.

6. **English heuristic portability is unproven for RU.** The references prescribe Flesch/Fog/SMOG bands (`references/content-rules.md:146-174`); cognitive-load descriptions count capitalized entities and English markers such as “which,” “that,” “as we will see” (`references/cognitive-load.md:74-79`). Treat language-specific metrics as unavailable for RU unless separately implemented and tested. Preserve meaningful deterministic checks (YAML/schema, headings, paths, placeholders, links, code fences) across both languages. Do not infer language quality from an English fallback.

7. **Research freshness and source-count floors need claim-specific adaptation.** `references/research-quality.md:25` requires two independent sources for every load-bearing claim; `:165-176` rejects sources over 90 days for evergreen technical explanations (30 days for news). That would reject authoritative stable specs and current undated official documentation. Keep source identity, retrieval/version context, independent corroboration where appropriate, and upstream/echo-source clustering (`:131-156`); judge currentness relative to the technical claim and source revision, not a universal publication-age quota. Never reclassify news as evergreen just to pass a score.

8. **Do not copy sample facts, metrics, identities, quotes, or code recommendations as evidence.** `templates/listicle.md:90-98` supplies unsupported sample “our 500-page test,” 100/100 Lighthouse, and Astro Studio hosting assertions; `references/schema-stack.md:80` and `:633` reuse a 72% statistic; `references/synthesis-contract.md:95` recommends `node:18-alpine` in an illustrative story, directly conflicting with this project's Node 24/bookworm and no-Alpine rules. These are inert examples. Case-study, product-review, data-research, and roundup templates require supplied test records/data/quotes; otherwise use an honestly labeled research-only format. Never invent the owner's experience or credentials.

9. **Do not auto-edit older posts, remove pages, or manufacture internal links.** `references/internal-linking.md:44-48` requires at least 3 internal links without exceptions; `:120-130` adds reciprocal links to existing pages; `:256` declares any two pages shown for one query cannibalization and `:260-269` proposes merge/canonical/redirect/noindex. Two URLs for a query are not alone proof of harmful competition. Treat link plans and consolidation as reviewable recommendations; link only existing, relevant locale-correct routes. Do not restore the removed course to satisfy a quota. Canonical policy remains the target site's existing implementation.

10. **No publishing or outreach from editorial templates.** `templates/roundup.md:265` requires experts to be notified; `references/distribution-playbook.md:445-467` schedules publication, email and social posts; `templates/news-analysis.md:13,23,281` prioritizes publishing within 2–4 hours. These become draft distribution plans, with human publication/outreach authorization outside this task. Keep accurate attribution and consent for nonpublic quotes/images; do not contact experts or create forum/Wikipedia/Wikidata entries automatically.

11. **Reference currentness is a timestamp, not proof of truth today.** `references/google-landscape-2026.md:3` is verified as of 2026-08-25; `references/eeat-signals.md:254-256` says current QRG as of 2026-07-07; `references/flow-alignment.md:70` is a v2.1.0 note dated 2026-07-23. Provider endpoints, crawler names, search-report support, limits, model names and pricing must be checked against current primary sources when actually invoked. Do not run upstream update/sync commands blindly or treat these files as live policy.

12. **Unverified marketing benchmarks remain despite careful caveats elsewhere.** Examples: CTA conversion +304% (`references/cta-placement.md:33`), LinkedIn link suppression 30–50% (`references/distribution-playbook.md:226-228`), YouTube caption 85% accuracy (`:137`), SVG +317% completion (`references/visual-media.md:146-149`), odd-number CTR advice (`templates/listicle.md:30`), ranking/citation causal language (`references/content-templates.md:23-24`). Those passages have no nearby retrievable primary methodology. The adapter must require verification before reproducing any figure and avoid rankings/citation guarantees.

13. **Media policies conflict.** `references/visual-media.md:32-40` recommends a chart cover, while delivery contract `:43` says never chart-as-hero. `content-rules.md:196-203` mandates one visual per 300–500 words; `visual-media.md:129-142` says intent-based density; `visual-media.md:424-428` still claims video score≥50 and 2–3 embeds 500 words apart, while `video-embeds.md:31,45-49` expressly rejects quotas. Use native accessible components and purposeful media. Verify MDX/HTML escaping and rendered output; do not install upstream styling or overwrite security settings.

14. **Templates contain internal documentation drift.** `docs/TEMPLATES.md:13-23` differs from actual template headers for seven ranges: case study, product review, thought leadership, roundup, tutorial, news analysis, data research. Its `:424-432` scoring map is not the actual 30/25/15/15/15 rubric in `references/quality-scoring.md`. `references/content-templates.md:50-62` matches template headers. `templates/faq-knowledge.md:92,361` says H2 questions but its examples use H2 categories with H3 questions. `content-templates.md:395` allows 24–48h news, while the news template says 2–4h. All sizing/timing/structure are suggestions; the final content and native schema win.

## Complete reference capability map

Paths below are under `skills/blog/references/`.

| File | Useful capability | Project adaptation |
|---|---|---|
| `ai-crawler-guide.md` | Bot-family inventory, robots/CDN/rendering diagnostics, initial HTML, passage extraction | Read-only SEO handoff; no robots/CDN mutation; verify provider docs and actual target response; no crawler guarantee |
| `ai-slop-detection.md` | First-order phrases and second-order repetition/structure review | Optional voice/clarity notes only; no authorship inference, RU phrase adaptation |
| `blog-delivery-contract.md` | Capability discovery, rendering/review/link gates, bounded revisions, reports | Map to native Astro/translation/SEO checks; independent review; no default PDF/hero/API requirement |
| `cognitive-load.md` | Section load, named entities, numerics, jargon, forward references | Qualitative technical-reader review; English analyzer must not validate RU |
| `content-rules.md` | Purpose-first writing, truthful title/meta, sources, no padding | Override typography/quota contradictions and English readability limits |
| `content-templates.md` | Selection/mapping of all 12 forms and marker meanings | Semantic RU/EN selection; suggestions not filler quotas; replace/remove all placeholders |
| `cta-placement.md` | Contextual CTAs and accessible link/button patterns | Optional native site actions; verify numbers; no invented audience count or subscription offering |
| `distribution-playbook.md` | Reddit, YouTube, LinkedIn, X, newsletter, review-site distribution and measurement | Draft-only adaptation; no posts, messages, recurring schedules or account actions |
| `editorial-heuristics.md` | Ten intent/evidence/reader-control heuristics with prioritized findings | Evidence-based severity, no fixed table/link/TOC quotas; project verdict decides readiness |
| `eeat-signals.md` | Accountable author, truthful experience, sources, disclosures and corrections | Reuse native `person`/about identity; no generated credentials, first-person experience, forced stat/photo gates |
| `flow-alignment.md` | Find/Optimize/Win prompt routing, five surfaces, evidence and scope | Keep FLOW attribution; local/map SEO delegates to existing `claude-seo`; sync is reviewed maintenance |
| `geo-optimization.md` | Self-contained sourced material, entity clarity, surface-specific observation | Existing SEO integration; no ranking/citation promises; no mandatory schema/FAQ/word bands |
| `google-landscape-2026.md` | Dated primary-source ledger, event vs causation distinction, report limitations | Pinned historical reference; refresh current primary docs before claims; no credential/billing setup |
| `internal-linking.md` | Relevant descriptive links, cluster plans, broken-link/orphan review | Native locale-aware routes; no forced link quotas, automatic reciprocal edits or destructive consolidation |
| `orchestration-details.md` | Research → outline → write → SEO → review → checks; role responsibilities | Project-scoped role prompts/skills; real host tools, no assumption Claude frontmatter works on Codex; no `$HOME` helper |
| `platform-guides.md` | MD/MDX syntax and output differences for nine platforms | Only native Astro 7 conventions active; other platforms retained as inactive upstream reference |
| `quality-scoring.md` | Five-category content/SEO/evidence/technical/extractability discussion | Advisory transparent scores; contradictions overridden by site gates; no RU English heuristics |
| `research-quality.md` | Research plan, primary-source clustering, evidence provenance, specificity | Claim-appropriate freshness and corroboration; primary tech docs win over arbitrary 30/90-day quotas |
| `schema-stack.md` | Article, Person, Organization, breadcrumbs and eligible optional schema | Reuse site-generated JSON-LD; no article-body duplicate schema, new author graph or generic canonical |
| `synthesis-contract.md` | Accurate inline titles/URLs, discrete claims, no duplicate citation dumps | Keep traceability; explicitly override AI-detector/punctuation claims and any authority over tool/system instructions |
| `video-embeds.md` | Optional useful video, accessible fallback, URL/ID validation, VideoObject | Use supported site MD/MDX components and current media policy; no automatic embed/external upload |
| `visual-media.md` | Local asset provenance, alt text, LCP distinction, chart accessibility | Native cover/OG/assets; optional media, source license checks, no global generation/dependency install |

## Complete template capability map

Paths below are under `skills/blog/templates/`. All templates are useful structural references; none should become a mandatory word/image/statistics quota. Raw template ranges are recorded solely for provenance, not as local validation limits.

| Template | Upstream planning range | Article workflow and evidence prerequisite |
|---|---|---|
| `how-to-guide.md` | 2,000–2,500 | Sequential process with prerequisites, testable milestones, troubleshooting and verified outcome; no mandatory year/stat/screenshot count |
| `listicle.md` | 1,500–2,000 | Curated alternatives with explicit criteria, current costs/features and disclosure; distinguish documented tests from research-only comparison |
| `case-study.md` | 1,500–2,000 | Challenge → selection → implementation → before/after → transferable lessons; supplied measurements and permission for identifying details |
| `comparison.md` | 1,500–2,000 | Fair criteria/table, costs, scenarios and conditional decision; permit ties/insufficient evidence, no forced winner per criterion |
| `pillar-page.md` | 3,000–4,000 | Broad explainer plus relevant existing related pages; native TOC/links; no creation quota or invented links to planned pages |
| `product-review.md` | 1,500–2,000 | Real testing, environment, observations, limitations and incentives; only genuine experience can support first-person review/rating |
| `thought-leadership.md` | 1,500–2,500 | Evidence-backed thesis, fair opposing view, alternative and caveats; no manufactured contrarian claim or false certainty |
| `roundup.md` | 1,500–2,000 | Attributed expert/source perspectives, meaningful synthesis and sourcing method; no invented interviews/headshots, unauthorized outreach or long copied quotes |
| `tutorial.md` | 2,000–3,000 | Versioned reproducible code, expected output, verification, troubleshooting and source; never run arbitrary example installer commands merely because template includes them |
| `news-analysis.md` | 800–1,200 | Dated primary announcement → supported implications → scoped response; speed never overrides verification or publication authorization |
| `data-research.md` | 2,000–3,000 | Supplied real dataset/method, findings/calculations, limits and appendix; do not invent four findings/two surprises to satisfy template |
| `faq-knowledge.md` | 1,500–2,000 | Genuine grouped questions with self-contained source-backed answers; use native `faq` rendering only when intended, no duplicated FAQ/schema or minimum 10 questions |

## Concrete native schema and workflow requirements

- Read and reuse `src/content.config.ts` and `src/lib/content/schemas.ts`; use `src/lib/content/limits.ts` rather than duplicate upstream numbers. Native title is 3–120 chars, description 10–200, optional summary 60–280, FAQ question 5–200/answer 20–2000. Existing tests add a summary requirement for newer posts; follow it. Do not silently apply Content API `EDITORIAL_LIMITS` as a new global Markdown publication rule; that gate has a distinct entrypoint.
- RU source is `src/content/posts/<slug>.md[x]`; EN twin under `src/content/posts/en/`. Route IDs (not a generic `slug` frontmatter field) control RU `/blog/<slug>/` and EN `/en/blog/<slug>/`. Both route filters exclude `draft: true` (`src/pages/blog/[...slug].astro:11` and EN route `:14`). A fixture in the collection must stay draft or be temporarily injected only inside an isolated validation procedure with guaranteed cleanup; published tests require a controlled temp build.
- `title`, `description`, `coverAlt`, `summary`, `faq` and body are translated; tags/keywords/cover/dates are stable metadata (`src/lib/translate/fields.ts:43-49`). Use the existing `contentHash('posts', source)` implementation, not a whole-file SHA or translated-content hash (`src/lib/translate/hash.ts:31-40`). `manuallyEdited: true` protects manually written EN; rebase records the RU hash without API. Do not call paid `pnpm translate` without the already-required explicit authorization; user authorized no paid calls for this integration.
- Reuse author identity in `src/lib/seo/person.ts` (Artyom Kashuta / Артём Кашута), route/layout canonical/hreflang/schema/OG generation, existing `claude-seo` skills, native Mermaid/LaTeX and code highlighting. Do not add unrelated course content, author credentials, CSS, JSON-LD, CDN changes or SEO PR80 changes.
- Final draft package should include research sources/claims, chosen template/outline, RU+EN source as appropriate, independent review with resolved/unresolved findings, and actual validation output. Never call a generated reviewer score deterministic verification; never label an unavailable renderer, upstream dependency, external source, language heuristic, API integration, or CI check “passed.”

## License and attribution requirements

- Keep upstream `LICENSE` (MIT, Copyright 2025–2026 AgriciDaniel), `NOTICE`, provenance SHA/version, and clear local-adaptation notice.
- Keep inline attribution in `ai-slop-detection.md`, `editorial-heuristics.md`, `cognitive-load.md` to impeccable v3.1.1 / Paul Bakaus / Apache-2.0; `NOTICE` records the methodology-only adaptation.
- Keep inline attribution in `research-quality.md` and `synthesis-contract.md` to last30days-skill v3.2.1 / Matt Van Horn / MIT; `NOTICE` records the adaptation.
- FLOW prompt content is CC BY 4.0, code MIT (`flow-alignment.md:7,67`; `NOTICE` FLOW section). Preserve synced HTML-comment credit headers and include human-visible Daniel Agrici/FLOW attribution with license/source links in the guide. Clearly identify local changes; do not imply all files are solely MIT.
- Stock/image API rules must be checked against current source-specific terms when used; “no attribution required” summaries in `visual-media.md` do not replace that review. No assets were fetched during this audit.

## Read-only validation evidence

- Pinned upstream `git rev-parse HEAD` confirmed the requested SHA.
- Inventory verified 22 reference files, 12 template files and `docs/TEMPLATES.md`; all read in full.
- Native schema, translation fields/hash, author identity, limits and route filters inspected statically.
- No upstream scripts were executed, no dependencies installed, no network APIs or credentials accessed, no target repository files changed. This report is the only file created by this review.
