# claude-blog runtime and redistribution review

Reviewed source: `AgriciDaniel/claude-blog`, commit
`2500d4c765034864cede2bf215d00ccd4d7d6fb8`, declared version `2.2.0`.
Review date: 2026-10-11. Target: the RU/EN Astro blog at artka.dev.

This is a static integration review, not a claim that every runtime has been
executed or exhaustively security-audited. **No upstream Python, installers,
test suites, hooks, provider setup, browser automation, or sync helper was
executed.** No credentials were read, no provider received article content,
and no personal agent configuration was changed. The only executed Python was
review-authored code reading tracked files, computing hashes, parsing Python
with `ast.parse`, and reporting declarations/call sites. It did not import
upstream modules.

## Inventory and coverage

`vendor/claude-blog/manifest.json` covers every one of the **896 tracked files**,
with path, SHA-256, byte size and disposition. The separate local review inventory
also recorded line counts and static declarations. Their combined line count is
165,275. All **121 Python files**, including tests and Brain source copies,
were parsed without syntax errors. Syntax parsing is not execution or proof of
runtime correctness.

Root grouping: 159 skill files, 20 root helper scripts, 31 test/fixture files,
5 agents, 13 docs, 7 assets, 3 branding files, **620 Brain files**, and 38
other files (installers, manifests, workflow/configuration, licenses, ledger,
reports and lockfiles). The Brain count includes 105 `.raw/sources` copies.
The 32 main skills consist of one orchestrator and 31 subskills.

The local review inventory (not needed to operate the integration) additionally recorded for non-Brain text files headings and risk
term counts. For non-Brain Python files it records imports, every function's
source range, and selected filesystem/network/process call sites. These are
**static coverage**, not a substitute for manual semantic review. For Brain,
the distributable inventory contains **metadata only**, not prose or code.

Manual review concentrated on:

- Full root MIT `LICENSE`, `NOTICE`, project manifests and dependency declarations,
  plugin manifests, workflow configuration, installer/uninstaller behavior.
- Brain's separate license, rights notice, operator entrypoints, CLI dispatch,
  install/uninstall paths, and public-site sanitizer; remaining Brain corpus
  receives static inventory and Python declaration/call-site review only.
- `blog_preflight.py` capability discovery, artifact selection, visual checks,
  review nonce/score verification, URL/asset handling and final status logic.
- `analyze_blog.py` language selection/readability and related heuristic paths;
  `quality_gate.py` selection, score threshold and staged-file behavior.
- `blog_render.py` metadata parsing, native-runtime differences, sanitization,
  PDF backends and network containment; `generate_hero.py` provider ladder,
  credential discovery, network and output boundaries.
- Global MCP setup and optional-provider runners/bootstrap; Google auth,
  Indexing API mutation, NLP content upload, TTS content upload, NotebookLM
  persistent cookies, Chrome acquisition and browser controls.
- Both discourse and FLOW sync implementations, root untrusted-context loader,
  hygiene/TOC helper, chart input/output boundaries, currentness checks,
  source/secret/release consistency tools, and focused score/style/decay logic.
- Tests were statically inventoried and the relevant preflight, nonce,
  analyzer, SSRF, security/release tests inspected. They were **not run**.

A separate focused review covered core skill/agent/reference/template prose
and provider reference/docs; the core findings are appended below. Do not describe this runtime review
as a line-by-line manual read of all 896 files.

## Redistribution blocker: Brain is not under MIT

`brain/LICENSE:1-6` explicitly says `Custom license` and states that until a
final license replaces it, all rights are reserved by Daniel Agrici.
`brain/pyproject.toml:11` and `brain/SKILL.md` corroborate that separate license.
The root MIT license must not be assumed to override this nested notice.
`brain/PUBLISHING_NOTICE.md` additionally distinguishes public reviewed wiki
content from raw captures, ledgers and review records, and says that its
sanitizer is not a license grant or publication authorization.

**Recommendation:** omit all 620 Brain files from the integration PR and any
vendored source snapshot, including `.raw`, examples, wiki, scripts, and site.
Keep only path/hash/size inventory, an upstream link, and a specific deferred
status explaining the rights blocker. A future separately authorized port may
revisit it. An original project evidence/review packet can implement common
workflow concepts without copying Brain code or prose. No need to block the
MIT framework integration on this separate component.

The main framework is MIT, copyright 2025-2026 AgriciDaniel. Preserve full
`LICENSE` and `NOTICE`. NOTICE includes methodology attribution for impeccable
(Apache 2.0) and last30days-skill (MIT), and FLOW prompt content is **CC BY 4.0**
with skill code MIT. Preserve FLOW inline credit headers and attribution;
mark changes in adapted materials and retain the original source/pin.

## Verified runtime findings and required adaptation

| Finding | Pinned source evidence | Project consequence |
|---|---|---|
| Russian is silently analyzed as English | `scripts/analyze_blog.py:156-204` defines only `en`/`tr`; `:528-538` maps any unsupported declared language to `en`; `:856-917` runs Flesch/textstat or its English estimate | Never present these numbers as RU readability/quality validation. Use explicit unsupported/advisory states or a separately tested RU implementation. Structural schema/link checks can remain language independent. |
| Visual verification fails open without a browser | `scripts/blog_preflight.py:594-598` returns `_gate_result(..., True, [], warnings)` when neither Playwright nor Patchright imports; `:539-540` documents warn-and-pass | Missing required visual verification must be `not-run`/blocked. `--strict` does not repair this upstream behavior. |
| Image capability assumed without evidence | `scripts/blog_preflight.py:505-510` hard-codes `openverse_assumed_available = True` | Existing local supplied assets are usable; provider connectivity is not established by this gate. Do not silently call Openverse or paid generators. |
| Link behavior differs from delivery prose | `_http_head` at `:934-946` only HEADs, refuses redirects and converts failures to 0; `:1154`, `:1201` require exactly 200 | Some valid redirects/HEAD-rejecting sites fail; offline or inaccessible links must have explicit status. Do not claim 2xx/3xx and HEAD-to-GET support from this helper. |
| OG image identity not checked | `scripts/blog_preflight.py:1168-1174` accepts an HTTP og:image whenever any local hero raster exists | Validate the actual Astro-built OG URL/asset route, not the presence of an unrelated hero file. |
| Review is not bound to article bytes | `_init_review_nonce` at `:212-227` stores draft path, nonce, timestamp and version; Gate 4 `:1290-1380` checks nonce/score/decision but no content digest | A review can remain passing after the article changes. Project review packet should bind final RU+EN source bytes and report stale review on mutation. Separate reviewer identity is also a runtime fact, not something a file alone proves. |
| Renderer is not Astro | `scripts/blog_render.py:268-305` uses a minimal YAML parser/Python Markdown; `:421-436` reads `date`, `author`, `canonical`, `lang`; `:470-485` validates those generic keys | Keep standalone rendering as an optional upstream export concept, not site QA. Use project YAML/schema, real Astro Markdown/MDX/Mermaid/KaTeX and production build/preview. Do not introduce duplicate inline schema into articles. |
| RU TOC would be wrong | `scripts/blog_hygiene.py:34-38` removes non-ASCII text for slugs; `:86-106` relies on those slugs | Use actual Astro heading IDs; do not insert English/manual TOCs blindly. |
| Hygiene modifies every image | `scripts/blog_hygiene.py:41-54` adds lazy loading to all img tags without a loading attribute | Do not apply to native built pages or hero/LCP behavior. Site image components own loading policy. |
| Discourse implementations disagree | root `scripts/discourse_research.py` handles recency; per-skill `skills/blog-discourse/scripts/discourse_research.py:166` calls top-ranked clusters `new_items` without filtering by supplied dates | Prefer original project orchestration with inspected sources/dates, or explicitly selected root semantics. Do not infer recency/consensus from English keyword clusters. Both helpers consume supplied data; neither performs actual web research. |
| English-dependent companion heuristics | `style_learn.py` stopwords/first-person terms, `cognitive_load.py` entities/jargon/forward references, per-skill discourse tokenization | RU voice, cognitive-load and discourse conclusions require editorial review. Do not fabricate expertise to satisfy experience-word regex. |
| Score is advisory | `ai_citation_score.py:480-487` keeps deprecated `overall_probability` alias but explicitly sets `calibrated_probability: False` | No ranking/citation probability or guarantee. Use evidence and reader value, not arbitrary score gaming or AI-authorship claims. |
| Generic gate has incompatible semantics | `quality_gate.py:25-27`, `:49-56`, `:117-137` filters generic title+description/date and score >=70 | Existing content schema/build checks and project verification own acceptance; do not install upstream pre-commit hook or apply its scoring threshold to all RU/EN posts. |

## Side effects: keep upstream runtime inert by default

| Surface | Actual effect if invoked | Integration status |
|---|---|---|
| `install.sh`, `install.ps1` | Clone mutable `main` by default if not local; copy/overwrite global `~/.claude/skills`, agents and scripts; `install.sh:234` runs default-interpreter `pip3 install -r requirements.txt` | Do not run; project-local wrappers and vendored inert references only. |
| Root uninstallers | Remove global skill/agent/helper paths. Windows `uninstall.ps1:31-42` deletes all `blog-*` matching directories/agents | Do not run; unrelated personal skills could be affected. |
| Audio/Google/NotebookLM `run.py` | Automatically invoke `setup_environment.py` when environment is absent/stale; create local .venv and install packages | No automatic dispatch to these wrappers, including a nominal provider dry-run if it enters the runner first. |
| NotebookLM setup/browser | `setup_environment.py:85-94` downloads Chrome; browser uses persistent cookies/profile in skill `data/browser_state`; `config.py` includes optional sandbox-disable env flag and browser anti-automation switches | Deferred explicit service/runtime authorization; no browser installation, login, cookie access or environment/security change in this PR. |
| `setup_image_mcp.py` | Global settings default; `:59-69` falls back to global even when project discovery fails; persists API key in global mode; installs `npx -y @ycse/nanobanana-mcp@1.1.1` command | Do not run. Its pinned preview-model incompatibility warning is itself a reason not to claim ready image service. User-supplied local images and editorial briefs remain supported. |
| Google auth | Reads/writes shared `~/.config/claude-seo/google-api.json` and `oauth-token.json`; can open OAuth listener/browser and refresh tokens | Reuse available authorized connectors or explicitly supplied exports in future. Do not inspect existing secrets or overwrite SEO credentials. |
| Google Indexing API | `indexing_notify.py:178` calls `urlNotifications().publish`; default URL action is `URL_UPDATED`; `--action URL_DELETED` supported | Deferred mutation, not a read-only audit. Its warning about supported page types is advisory only. Ordinary blog publication should use existing site mechanisms. |
| Google NLP | `nlp_analyze.py:92-109` POSTs content to `language.googleapis.com` using an API key | Deferred content upload and potential billing. |
| Gemini audio | `generate_audio.py:309`, `:330` send complete prepared text via `client.models.generate_content`; supports chunking and FFmpeg conversion | Deferred provider generation; narration scripts/SSML-like planning can be prepared locally. Pricing/model names are snapshot data, not verified current pricing. |
| Hero generation | Tries Gemini with env key, then Unsplash/Pexels/Pixabay, then unauthenticated Openverse; writes raster/credit files | Deferred online generation/download unless specifically requested and approved within available service policy. Existing local assets require no new service. |
| FLOW sync (two different scripts) | Fetches GitHub content, may obtain `GITHUB_TOKEN`/`gh auth token`, writes prompts/locks; root has drift review gate; per-skill implementation differs | Use pinned checked-in FLOW data. Update manually at reviewed commit with hashes and attribution; never auto-sync on article generation. |
| Upstream CI/hooks | CI installs Python packages, global Claude CLI, optional environments; pre-commit invokes generic Python quality score | Do not copy as active project workflows/hooks. Native pnpm CI should validate our adapters. |
| Brain installer/site | Global agent roots and Gemini loader, recursive deletion of target; site sanitizer recursively removes output before writing | Entire component excluded for rights; no runtime activation. |

The root renderer and preflight include useful SSRF protections (public address
resolution/pinning for link/image requests; blocked external resources during
local rendering). These are not a reason to execute the whole integration, nor
proof that every helper has identical protections. The helper families differ.

## Dependencies, explicitly not installed

Main package requires Python >=3.11. Core declared deps are textstat
`>=0.7.3,<1.0.0` and BeautifulSoup `>=4.12,<5`. Root `requirements.lock` pins
textstat 0.7.13, beautifulsoup4 4.14.3 and transitives. Root installer does not
use that hash lock.

- Optional advanced NLP: lxml, jsonschema, spaCy (+ external language model),
  sentence-transformers (+ model downloads), scikit-learn,
  language-tool-python (+ Java). They are not required for project adapters.
- Optional presentation: Patchright 1.61.2/browser or Playwright, WeasyPrint,
  python-markdown, Pillow, google-genai, requests. Root WeasyPrint range differs
  from Google report helper's own venv range; do not merge environments blindly.
- Audio lock: google-genai 2.14.0 plus its HTTP/auth/crypto dependencies;
  optional local FFmpeg for MP3.
- Google lock: API client, OAuth/auth, GA4 Data, Google Ads 31.4.0,
  requests 2.34.2, matplotlib/numpy, WeasyPrint 68.1 and transitives.
  Read-only GSC/GA4 still requires an authorized account; Keyword Planner
  requires Ads developer credentials/account; NLP may require billing.
- NotebookLM lock: Patchright 1.61.2, python-dotenv 1.2.2, greenlet/pyee.
  The browser download is a separate trust boundary not covered by pip hashes.
- Image MCP config references npm package `@ycse/nanobanana-mcp@1.1.1`.

Local functions that are conceptually portable without providers include
structural content checks, accessibility/chart generation from supplied data,
export-based decay comparison, source-register normalization, and editorial
planning. Implement these in the site's already-installed Node/TypeScript
environment when practical; do not add a second Python runtime merely for a
score or generic frontmatter parser.

## Acceptance recommendations for the project implementation

1. Pin root provenance and per-file hashes; maintain a complete capability map
   with implemented/adapted/deferred statuses. All 32 skills must be discoverable
   through project conventions, with provider blockers explicit at entrypoint.
2. Skill precedence must state that project schema/CLAUDE/AGENTS and current
   task authorization override upstream generic examples/quotas/tool syntax.
   No inherited global installation, upload, publication, API or credential setup.
3. Bind each review to both actual final article bytes and the source/claim
   packet when that packet changes. Record independent review status honestly;
   a local file cannot cryptographically prove a different model reviewed it.
4. Check RU/EN schema, translation hash and metadata parity using existing
   project utilities. Keep factual/source review separate from grammar signals.
5. Dry-run native Astro rendering with an unlisted fixture; require explicit
   results for source checks, native build/SEO output, visual/mobile/assets, and
   any external links. No required check should become passed because a tool
   is missing. `not-run` is distinct from success.
6. Preserve existing SEO skill ownership of technical audits; schema/canonical,
   sitemap, robots and site routes are generated by the site's implementation.
7. Update only through reviewed immutable upstream diff, license recheck,
   inventory/hash regeneration and regression checks. Do not run sync/install
   helpers or silently bring in the restricted Brain subtree.

Remaining limitations: no upstream runtime test result is asserted; provider
availability and current pricing/model support are not verified; Brain has no
redistribution permission; static review is not an exhaustive vulnerability
assessment. The main framework can still be fully mapped and productively
adapted for local editorial workflows under these explicit boundaries.


## Core skill/reference review


1. **Instruction-level contradictions require explicit overrides.** Writing requests 8–12 current statistics, 3–5 inline images, 2–4 charts and 2–3 videos (`skills/blog-write/SKILL.md:97-126`), but writer/reference revisions elsewhere explicitly reject density quotas. It also repeats an unsupported CTA +266% claim at `:186`. No numerical example becomes article evidence. Retain purpose-first structure, source discipline and bounded revision; remove forced quotas, fake experience and source-age floors.

2. **Framework scores conflict and are not calibrated.** `docs/COMMANDS.md:212` describes six categories, but current skills use five weighted 30/25/15/15/15. `docs/ARCHITECTURE.md:346` says delivery threshold 70 while write/rewrite require 90 (`skills/blog-rewrite/SKILL.md:350`). The template reviewer documents remaining old penalty tables and AI-authorship claims. Establish a single local pass/fail contract based on evidence/schema/code/translation/link/rendered defects; optional editorial scores never prove authorship or search outcomes.

3. **Native Astro must replace standalone renderer QA.** Upstream demands standalone markdown/HTML/PDF/hero and promotes helper invocation from global directories. It cannot validate artka.dev's own components, routes, generated metadata, MDX or CSS. Use real Astro build/preview with bounded temporary fixtures and truthful not-run outputs. Existing auto-OG behavior means a paid hero is not a prerequisite to draft writing.

4. **RU metrics and locale format are unsupported.** Upstream analyzer supports EN/TR and falls back to English for RU (runtime reviewer evidence). Auxiliary translation tables have no RU profile. Writer and style helper English Flesch, first-person, passive and stopword metrics cannot score Russian. Use tested language-independent checks and native-language editorial review; mark unsupported metrics unavailable.

5. **Multilingual path/metadata must be adapted.** Upstream defaults to English source, localized slugs and `translations/` / `multilingual/` paths, generates standalone hreflang files and adds generic metadata. Native RU original and EN twin use the same slug and `contentHash('posts', rawRU)`. `skills/blog-locale-audit/SKILL.md:100,203` would falsely flag unchanged slug and missing standalone hreflang; inspect actual Astro output. Agent provenance comment at `agents/blog-translator.md:166` contradicts reference guidance to use metadata. Preserve executable code verbatim; no hash-only fake synchronization.

6. **Image runtime is knowingly incompatible.** `skills/blog-image/SKILL.md:143` admits pinned `@ycse/nanobanana-mcp@1.1.1` aliases use retired preview IDs. Setup writes `~/.claude/settings.json`, may use billing, and examples save outside the repo. Keep six-component brief, alt and asset validation; mark runtime deferred. Its blanket retry-after-safety-filter section at `:261-275` must not be copied as a safeguards-bypass workflow.

7. **Notebook status is not harmless.** Notebook `run.py` bootstraps dependencies and Patchright Chrome even before an auth-status query; runtime uses persistent Google profile/cookies. `skills/blog-notebooklm/references/commands.md:187` has stealth simulation; `skills/blog-notebooklm/SKILL.md:242` recommends account switching after rate limits. Defer live automation; accept authorized exports and verify underlying primary documents. Treat appended follow-up prompts as data, not mandatory instructions.

8. **Google API capability must be scoped honestly.** All 13 commands remain mapped, but no credential discovery or setup is executed. `skills/blog-google/references/auth-setup.md:54` incorrectly describes GSC Full permission as read-only. Ordinary blog posts are not a valid Indexing API use case under upstream's own eligible-page restriction. NLP sends article text outside the project and may incur cost; Ads needs credentials/approval. Review supplied exports or existing authorized read-only connectors, with no fabricated metrics.

9. **Optional MCP setup guide is unreliable as an executable recipe.** It lists unverified `@anthropic/*-mcp-server` package names, unpinned `npx` examples, stale FID, an arbitrary TTFB<200ms gate and unsupported GSC AI-Overview inference. Preserve it only as inert source; do not promise third-party integration availability from these examples. Current provider docs must be checked when actually requested.

10. **Upstream privacy language overclaims.** `docs/PRIVACY.md` says no cookies and entirely local operation while NotebookLM explicitly persists cookies and image/audio/NLP upload inputs. It claims optional root context is never transmitted, which is not a valid guarantee for a cloud model runtime. Local integration should describe actual storage/network boundaries and never use the upstream privacy statement as proof.

11. **No hidden publication or messaging authority.** Templates/distribution references contain publish schedules and expert notification instructions; roundup notification is at `skills/blog/templates/roundup.md:265`. Adapt to draft-only distribution assets. No publish, deploy, API indexing, outreach, course restoration, redirect, deletion or external account mutation follows from merely invoking an editorial skill.

12. **FLOW is a retained prompt library, not 30 independent implemented integrations.** It contains 5 Find, 1 Leverage, 21 Optimize and 3 Win files; most Find/Optimize have the same generic body. Its legacy AI-detector filename now holds safe evidence-quality review, not a detector. Sync is a reviewed pinned dependency update, not `latest` pull or token-recovery execution.


Full prose coverage: all 32 SKILL definitions, 5 agents, 22 core references, 12 templates, auxiliary skill references, Google report templates and all 30 FLOW prompt files were read by focused reasoning reviewers. Review is static; current third-party service behavior was not exercised. The large Brain corpus received inventory and focused license/runtime analysis, not a line-by-line manual prose audit.
