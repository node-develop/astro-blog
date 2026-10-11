# Карта возможностей

Все 32 upstream SKILL.md сопоставлены ниже. **Adapted** — выполняемый агентом сценарий с конкретным выходом. **Deferred** — исходный внешний runtime не активирован; доступен указанный brief/экспорт. Локальные механизмы регистрации, hash и schema-check **implemented** отдельными `pnpm blog:*` командами. Полные процедуры — в каждом skill; [машиночитаемая карта](capabilities.json) содержит варианты, зависимости и точные пути.

| Skill | Статус | Выход |
| --- | --- | --- |
| [blog](../../.agents/skills/blog/SKILL.md) | adapted | A scoped plan, capability status, requested draft/report and explicit validation results. |
| [blog-analyze](../../.agents/skills/blog-analyze/SKILL.md) | adapted | docs/blog-framework/work/<slug>/analysis.md, optionally analysis.json or a compact table; bounded batch reports preserve per-file status. |
| [blog-audio](../../.agents/skills/blog-audio/SKILL.md) | deferred | A source-faithful narration/dialogue script, pronunciation notes and optional actual-asset embed proposal. |
| [blog-audit](../../.agents/skills/blog-audit/SKILL.md) | adapted | docs/blog-framework/work/audits/<date>/audit.md and audit.json with unique filenames, per-post findings and proposed actions. |
| [blog-brand](../../.agents/skills/blog-brand/SKILL.md) | adapted | docs/blog-framework/work/brand/BRAND.md and VOICE.md, or the explicit project context locations named in CONTRACT.md; no global agent setting changes. |
| [blog-brief](../../.agents/skills/blog-brief/SKILL.md) | adapted | docs/blog-framework/work/<slug>/brief.md and an evidence packet, prepared for blog-outline/blog-write. |
| [blog-calendar](../../.agents/skills/blog-calendar/SKILL.md) | adapted | docs/blog-framework/work/calendars/<yyyy-mm>-editorial-calendar.md with planned new articles, substantive updates and optional repurposing. |
| [blog-cannibalization](../../.agents/skills/blog-cannibalization/SKILL.md) | adapted | docs/blog-framework/work/audits/<date>/cannibalization.md with locale, intent, evidence and confidence per pair. |
| [blog-chart](../../.agents/skills/blog-chart/SKILL.md) | adapted | A chart specification plus a reviewed local SVG/MDX asset if supported, with data/source and accessibility text. |
| [blog-cluster](../../.agents/skills/blog-cluster/SKILL.md) | adapted | docs/blog-framework/work/cluster-<slug>/cluster-plan.json, cluster-map.html, draft RU/EN pairs in per-post work folders, and cluster-scorecard.md. |
| [blog-decay](../../.agents/skills/blog-decay/SKILL.md) | adapted | docs/blog-framework/work/decay/<date>/decay-report.md or JSON with comparison provenance, observations and proposed actions. |
| [blog-discourse](../../.agents/skills/blog-discourse/SKILL.md) | adapted | docs/blog-framework/work/<slug>/DISCOURSE.md and optional discourse.json; explicit --output must remain in the project work root. |
| [blog-factcheck](../../.agents/skills/blog-factcheck/SKILL.md) | adapted | docs/blog-framework/work/<slug>/factcheck.md and updated evidence.json with claim locations, sources, basis and unresolved issues. |
| [blog-flow](../../.agents/skills/blog-flow/SKILL.md) | adapted | A selected FLOW prompt index or evidence-led action document with attribution and observation/assumption separation. |
| [blog-geo](../../.agents/skills/blog-geo/SKILL.md) | adapted | An evidence/readability/crawlability audit and ranked practical fixes. |
| [blog-google](../../.agents/skills/blog-google/SKILL.md) | deferred | A report from supplied authorized data or a precise data-request plan marked unavailable where access is absent. |
| [blog-image](../../.agents/skills/blog-image/SKILL.md) | deferred | A six-part image brief, real-asset placement/alt proposal and explicit provider status. |
| [blog-locale-audit](../../.agents/skills/blog-locale-audit/SKILL.md) | adapted | Coverage/parity matrix, sourceHash freshness findings and prioritized exact-file fixes. |
| [blog-localize](../../.agents/skills/blog-localize/SKILL.md) | adapted | A localization report and optional revised draft with a sourced change log. |
| [blog-multilingual](../../.agents/skills/blog-multilingual/SKILL.md) | adapted | A matching RU/EN draft pair, evidence register and parity report. |
| [blog-notebooklm](../../.agents/skills/blog-notebooklm/SKILL.md) | deferred | A source-grounded research question plan or verified findings from a supplied export, with source gaps. |
| [blog-outline](../../.agents/skills/blog-outline/SKILL.md) | adapted | outline.md with title candidates, H2/H3 structure, source needs, original contribution and valid internal targets. |
| [blog-persona](../../.agents/skills/blog-persona/SKILL.md) | adapted | docs/blog-framework/work/personas/<name>.json and active-persona.json, unless CONTRACT.md defines an existing project context location. |
| [blog-repurpose](../../.agents/skills/blog-repurpose/SKILL.md) | adapted | docs/blog-framework/work/<slug>/repurposed/<slug>-<channel>.md with draft status and references. |
| [blog-rewrite](../../.agents/skills/blog-rewrite/SKILL.md) | adapted | A draft copy, before/after content diff, evidence changes and review report. |
| [blog-schema](../../.agents/skills/blog-schema/SKILL.md) | adapted | A rendered schema audit and, when authorized, a minimal native-generator correction proposal. |
| [blog-seo-check](../../.agents/skills/blog-seo-check/SKILL.md) | adapted | docs/blog-framework/work/<slug>/seo-check.md with PASS/FAIL/WARN/SKIPPED/NOT-APPLICABLE per check and exact evidence. |
| [blog-strategy](../../.agents/skills/blog-strategy/SKILL.md) | adapted | docs/blog-framework/work/strategy/<date>-strategy.md with a scoped roadmap, cluster build tables and explicit evidence limits. |
| [blog-style](../../.agents/skills/blog-style/SKILL.md) | adapted | A project work-folder voice analysis with quoted examples, sample coverage and proposed profile changes. |
| [blog-taxonomy](../../.agents/skills/blog-taxonomy/SKILL.md) | adapted | docs/blog-framework/work/<slug>/taxonomy.md or docs/blog-framework/work/audits/<date>/taxonomy.md with proposed tag mappings. |
| [blog-translate](../../.agents/skills/blog-translate/SKILL.md) | adapted | A reviewed EN draft with same slug, localized prose/metadata and truthful native translation metadata. |
| [blog-write](../../.agents/skills/blog-write/SKILL.md) | adapted | RU draft, source/evidence register, outline, review notes and EN twin (or explicitly incomplete RU-only draft) under docs/blog-framework/work/<slug>/. |

## Варианты и ограничения каждого skill

### blog

/blog <command> [arguments] $blog <command> [arguments]

- Upstream has 32 skills: orchestrator + 31 subskills, 30 advertised commands; update aliases rewrite and blog-chart is internal.
- Aliases: plan→calendar; ideation→strategy; seo→seo-check; aeo/citation→geo; health→audit; notebook/query-notebook→notebooklm; narrate/tts→audio; gsc/psi/pagespeed/crux/cwv→google; topic-cluster/pillar/hub-and-spoke→cluster; international→multilingual; cultural-adaptation→localize; translation-audit→locale-audit; voice-of-customer/social-listening/trend-research→discourse; find-leverage-optimize-win→flow.
- Claude slash commands and Codex $skill syntax are prompt entrypoints, not shell commands; use actual runtime capabilities.

### blog-analyze

/blog analyze [arguments]

- Upstream analyze_blog.py is retained as inert reference, not executed; its en/tr heuristics do not validate Russian.
- Upstream Flesch scores, persona-adjusted scoring, rubric and cognitive-load JSON are not native deterministic features. Mark language-specific or unmeasured values unavailable.
- Variants: local file, public URL, directory; --format markdown|json|table, --batch, --sort score, --rubric, --cognitive-load.
- A 100-point score is an optional, explicitly subjective editorial heuristic, never an AI detector or publication authorization. A source-only audit cannot award native rendered metadata credit.
- Upstream 90+ 'publish as-is' instruction is replaced by the local draft/review/publication boundary.

### blog-audio

/blog audio generate <file> [--mode summary|full|dialogue] [--voice <name>] /blog audio voices /blog audio setup

- Live Gemini TTS, SDK bootstrap and FFmpeg installation require separate review/authorization; no paid calls or content upload is performed.
- Preserve summary/full/dialogue and voice-catalog capabilities as planning; actual audio files/duration must not be fabricated.

### blog-audit

/blog audit [arguments]

- Canonical upstream Python batch analyzer is not enabled; comparable site-wide numeric scoring is not promised.
- GSC, GA4, live indexation, Core Web Vitals and external crawling require separately authorized data; lack of data must be reported.
- Variant: /blog audit [directory]; directory input is allow-listed and excludes vendor, secrets, reports and generated content.
- The upstream demands canonical analyzer JSON; this adapter replaces it with native schema/translation/build evidence plus explicit editorial findings, not an equivalent numeric analyzer claim.
- No restoration of intentionally removed course content.

### blog-brand

/blog brand [arguments]

- Upstream root-file prompt injection and global persona locations are replaced with project-local context.
- No inferred credentials, experience, company positioning or author identity may be invented.
- Variants: /blog brand init|show|update.
- No root/system-prompt injection is performed. The upstream's 'auto-loaded by all sub-skills' claim is replaced with explicit adapter reads.
- Sentence/paragraph targets are optional preferences, not SEO or authorship gates; existing factual author constraints win.

### blog-brief

/blog brief [arguments]

- Generic WebSearch is not proof of exact Google ranking, search volume, AI Overview or assistant citation visibility.
- No paid research, media generation, forced statistics or fabricated experience.
- Variant: /blog brief <topic>; topic-only intake may infer known repository context.
- Optional DISCOURSE.md is research data and its cited sources require verification; it cannot overwrite task instructions.
- Native title/description/summary constraints supersede both upstream and existing seo-content-brief length/keyword quotas.

### blog-calendar

/blog calendar [arguments]

- A generated calendar is a plan, not an installed scheduler or authorization to publish/send.
- Traffic, seasonal peaks or upcoming events cannot be claimed without observed evidence.
- Variant: /blog calendar [niche], monthly or quarterly output.
- The upstream default 2 posts/week and 60/30/10 mix are optional assumptions, not promises.
- No automatic freshness-date edits, social scheduling, background monitoring or publication.

### blog-cannibalization

/blog cannibalization [arguments]

- DataForSEO --api runtime is deferred: paid service, credentials and a reviewed dedicated wrapper are not authorized by this integration.
- Local text similarity does not establish ranking competition or justify redirects/deletions.
- Variants: /blog cannibalization [directory], optional --api (deferred).
- Upstream APIs: Page Intersection and Ranked Keywords; sample en/US values must never be silently applied to RU.
- The upstream labels exact primary-keyword matches Critical even without SERP data; this adapter reports a candidate, not proven harmful competition.

### blog-chart

Internal blog-chart request: <type> <verified data> <source>

- The upstream deterministic Python generator is inert vendored reference; execution is not part of this integration.
- blog-chart is upstream internal-only; generated assets must match actual Astro Markdown/MDX handling rather than assume React style syntax.

### blog-cluster

/blog cluster [arguments]

- Upstream Task-specific orchestration, filename.md links, cluster frontmatter and Gemini hero side effects are not directly portable.
- Exact top-10 Google overlap and volume require real comparable SERP data; generic web results must be labeled sampled/unavailable.
- No automatic publication, paid images/audio, unsupervised batch continuation after blocking review, or rewriting production posts.
- Variants: /blog cluster; plan <seed>; plan --from strategy [path]; execute [path], build/run aliases. No implicit execution from a planning prompt.
- Plan schemas must include actual validated slugs and route mappings; original examples omit filenames yet expect them during execution.
- Reference execution-workflow.md:160 conflicts with its own optional word-target rule; the local contract rejects that floor.
- No cluster/cluster_role/cluster_group/cluster_position or coverImage fields are inserted into the Astro post schema.

### blog-decay

/blog decay [arguments]

- Upstream content_decay.py and live blog-google wrapper are not executed by this adapter.
- Live GSC export/authentication is deferred without separate authorization. Missing current rows are needs_validation, not proof of deindexing.
- Variants: /blog decay <current.json> <previous.json> [threshold] [metric]; upstream CLI --threshold, --metric clicks|impressions, --format markdown|json, --output are conceptual inputs, not advertised local executables.
- If no reviewed comparison runtime is available, deliver an input-validation/report plan and explicitly defer numeric analysis; do not ask a model to replace deterministic code.
- The 20/40/60% warning bands are heuristics, not causes or publication decisions.

### blog-discourse

/blog discourse [arguments]

- No upstream discourse_research.py execution or equivalent algorithmic clustering/engagement score is claimed.
- Search snippets are incomplete; no unseen engagement values, dates, consensus, contrarian opinion or novelty may be inferred as measured fact.
- Variants: /blog discourse <topic>; --days 30|90; --input results.json; --output path.md; --format markdown|json; --decomposition questions.txt.
- Preserve attribution to Matt Van Horn / last30days-skill v3.2.1 (MIT) present upstream.
- No overwrite of root DISCOURSE.md, scheduled monitoring, social interaction, external uploads or provider credentials.

### blog-factcheck

/blog factcheck [arguments]

- Unreachable/paywalled/dynamic content is unverified, not proof a claim is false.
- Upstream numerical confidence is qualitative shorthand, not calibrated probability. A vague source cannot validate a more precise number.
- Variants: /blog factcheck [file]; can be requested as the deep-verification pass during analyze/rewrite.
- The upstream 43% vs 'nearly half' 0.8 example and unreachable=0.0 mapping are replaced by explicit uncertainty/precision handling.
- Source reputation alone is insufficient; the inspected source must support the particular claim.

### blog-flow

/blog flow /blog flow find [topic|url] /blog flow optimize [url] /blog flow win [url] /blog flow prompts /blog flow sync [--ref <sha>] [--allow-drift]

- Live sync and --allow-drift execution are deferred to reviewed dependency updates.
- 30 prompt files: Find 5, Leverage 1, Optimize 21, Win 3; most Find/Optimize bodies are identical generic stage instructions.
- The legacy ai-detector filename now contains evidence-based quality review explicitly prohibiting authorship claims.
- Retain every source license header and label local adaptations.

### blog-geo

/blog geo <file> Aliases: aeo, citation

- Uncalibrated upstream ai_citation_score.py is not a Russian predictor or a publication gate.
- Do not automatically change robots policy or add llms.txt/schema/FAQ solely for AI ranking promises.

### blog-google

/blog google setup /blog google pagespeed <url> /blog google crux <url> /blog google crux-history <url> /blog google gsc <property> /blog google inspect <url> /blog google index <url> /blog google ga4 [property] /blog google nlp <url-or-text> /blog google youtube <query> /blog google keywords <seed> /blog google report <type> /blog google quotas

- All 13 upstream API command runtimes require separately reviewed dependency/provider configuration and any needed user authorization.
- No billing, persistent credential changes, live Ads/NLP calls or Indexing API submission is enabled.
- Keep upstream report templates as inert references. Feature availability/quotas and model/API versions are snapshots and must be verified before real use.
- Export/report planning is adapted and usable; live provider execution is deferred.

### blog-image

/blog image generate <idea> /blog image edit <path> <instructions> /blog image setup

- Upstream pins @ycse/nanobanana-mcp@1.1.1 whose own docs say aliases use retired preview IDs.
- Gemini generation may require billing; no provider setup, account or global configuration is included.
- No blanket safety-filter rephrasing or safeguards bypass; no automatic images to meet a quota.
- Image planning and approved existing-asset placement are adapted; provider execution is deferred.

### blog-locale-audit

/blog locale-audit <directory> [--html]

- No age-only refresh gate, missing standalone hreflang critical, localized-slug mandate or language-independent Flesch score.

### blog-localize

/blog localize <file> --locale ru|en /blog localize <file> <locale>

- Upstream has DACH, Francophone, Hispanic, Japanese and custom profiles but no RU-specific profile; its legal/CTA stereotype maps are not factual substitution rules.
- Currency conversions require dated evidence and the original amount.

### blog-multilingual

/blog multilingual <topic> --languages en [--source ru] [--no-localize] [--format md|mdx]

- Additional locales and generic multilingual/* output do not integrate with the native schema/routes.
- The upstream --source en default is replaced with RU; source-language reversal requires a separately designed project workflow.
- No separate hreflang-tags.html/sitemap.xml or translator comments are injected.

### blog-notebooklm

/blog notebooklm <question> /blog notebooklm ask <question> /blog notebooklm discover <url> /blog notebooklm library list|add|search|remove /blog notebooklm setup|status|cleanup

- Upstream installs Patchright Chrome, uses automation concealment and persistent Google cookies; no public API adapter is provided.
- No upload, credential access, account switching or browser-state cleanup is authorized by framework use.
- Underlying-source research/export analysis is adapted; all live notebook operations are deferred.
- Upstream internal silent fallbacks are replaced with honest unavailable statuses.

### blog-outline

/blog outline <topic>

- Search snippets alone do not establish claims, search volume or AI-surface visibility.

### blog-persona

/blog persona [arguments]

- English Flesch/contraction/passive-voice values do not validate Russian and are not implemented as native hard gates.
- Upstream scorer ignores the active persona’s readability band; do not promise score changes or objective personality extraction.
- Variants: /blog persona create|list|use|show [persona-name].
- No writes under vendor/claude-blog/upstream or ~/.claude/skills.
- Tone dimensions are not an authorship classifier; the persona cannot override factual identity or claim support.

### blog-repurpose

/blog repurpose [arguments]

- Output is copy/script only; publishing, scheduling, messaging, account access and paid video/audio generation are deferred without explicit separate authorization.
- Platform limits and rules change and must be checked before delivery if exact compliance is claimed.
- Variant: /blog repurpose <file>; direct channel request skips selection. Supports X/Premium, LinkedIn feed/article/newsletter, Threads, Bluesky, Mastodon, TikTok/Reels/Shorts, Instagram carousel, YouTube, Reddit, Discord, Slack, email, podcast/interview drafts.
- Upstream platform limits and 150 words/minute are provisional checks/estimates, not guarantees for Russian.
- Do not reuse upstream LinkedIn/Reddit autobiographical opening examples as the author’s actual experience.

### blog-rewrite

/blog rewrite <file> /blog update <file>

- Upstream score-improvement and 90-point delivery gate are not evidence of quality; factual/regression findings block, advisory quota changes do not.
- Do not add generic frontmatter, forced em-dash removal, first-person markers, charts/videos or fabricated experience.

### blog-schema

/blog schema <file>

- Native schema generator owns canonical/hreflang/JSON-LD; generic {siteUrl}/blog/{slug}, /author/, logo paths and frontmatter names are examples only.
- Current Google feature eligibility needs official verification; valid schema.org markup is not a ranking guarantee.

### blog-seo-check

/blog seo-check [arguments]

- Source Markdown does not contain all layout-generated metadata; do not fail it for absent raw canonical/schema/H1 fields.
- Live PageSpeed/GSC/auth checks are optional and deferred without specific authorized tools/data. No upstream preflight or Google wrappers run.
- Variants: /blog seo-check <file-path> or an explicitly supplied public URL; optional upstream live-performance sequence is deferred.
- Native routes already emit schema/H1/canonical; standalone blog_render.py output is not website QA.
- Correct sponsored/ugc rel handling is taken from the native site/current standards, not the older agent rule that always says nofollow.

### blog-strategy

/blog strategy [arguments]

- Search results cannot inspect assistant answer citations; unobserved AI surfaces remain unavailable.
- Provider APIs, accounts, monitoring, external profile creation and paid tools are not authorized by a strategy prompt.
- Variant: /blog strategy <niche>; plan may consume an existing local DISCOURSE.md only as source data.
- The upstream 80+ quality target, 8–12 spokes and 30-day freshness metric are planning heuristics and must not override local evidence/schema gates.
- Optional local-pack work maps to existing seo-local only when actually relevant; no new service claims.

### blog-style

/blog style learn <paths>

- Upstream style_learn.py inherits an EN/TR analyzer; it is not a Russian voice validator.
- --format markdown|json and --output are upstream helper options, not runnable local helper promises.

### blog-taxonomy

/blog taxonomy [arguments]

- CMS sync to WordPress, Shopify, Ghost, Strapi and Sanity is deferred: this site uses Astro Markdown/MDX and no CMS credentials are authorized.
- Astro post schema has tags/keywords, no mandatory category field; upstream categories and thin-tag thresholds do not apply as hard requirements.
- Variants: /blog taxonomy suggest <file>; audit [directory]; sync <cms> (deferred for WordPress, Shopify, Ghost, Strapi, Sanity).
- No exactly-one-category rule, automatic archive noindex, deletion or remote CMS sync.
- The upstream API examples are retained as inert reference only, including their authentication and version requirements.

### blog-translate

/blog translate <ru-file> --to en /blog translate <file> <target-lang>

- Upstream localized slugs, translatedFrom/translatedDate metadata and EN default source do not match this project.
- Executable code and inline code remain unchanged unless the user separately requests a code change.
- SourceHash excludes some nontranslatable fields; separately compare tags, dates, cover, keywords and draft status as native workflow requires.

### blog-write

/blog write <topic> /blog write <topic> --format md|mdx /blog write <topic> --brief <path> /blog write --type <template> <topic> /blog write <topic> --words <planning-estimate>

- Do not use generic coverImage/ogImage/date/lastUpdated frontmatter or standalone blog_render.py/PDF as Astro QA.
- --words is advisory; --format must remain Markdown/MDX supported by this repository.
- No mandatory paid hero, stock download, community footer, video embeds, duplicated H1 or extra JSON-LD.

## Другие upstream-компоненты

| Компонент | Статус и использование |
| --- | --- |
| 5 agents | Adapted: .claude/agents/blog-*.md; Codex uses portable role briefs, not Claude registrations |
| 22 core references и auxiliary refs | Сохранены полностью, read-only; применяются только через CONTRACT и native schema |
| 12 templates | Adapted: [выбор структуры](TEMPLATES.md), все оригиналы сохранены; квоты не блокируют |
| 30 FLOW prompts, включая Leverage | Сохранены с CC BY attribution; find/optimize/win/prompts — локальный prompt workflow; sync только отдельное reviewed обновление |
| Python helpers, render/preflight, locks | Сохранены как .upstream для аудита. Не запускаются; замена schema/hash/native Astro — implemented, английские метрики RU unavailable |
| Install/uninstall, .mcp example, upstream CI/hooks | Deferred, не активированы: глобальные записи, установка, credentials и network. Native CI проверяет наш integration |
| HTML/PDF export | Standalone upstream renderer не портирован. Native Astro preview поддержан; PDF только отдельная задача с отдельной проверкой |
| Другие CMS (WordPress, Ghost, Hugo…) | Reference-only; artka.dev использует Astro и не выдаёт generic CMS adapters за реализованные |
| Brain / Obsidian product (620 files) | Deferred/excluded: отдельная custom license reserves all rights; только inventory metadata и ссылка на upstream |

## Основные aliases

`update → rewrite`, `plan → calendar`, `ideation → strategy`, `seo → seo-check`, `aeo/citation → geo`, `health → audit`, `notebook/query-notebook → notebooklm`, `narrate/tts → audio`, `gsc/psi/pagespeed/crux/cwv → google`, `topic-cluster/pillar/hub-and-spoke → cluster`, `international → multilingual`, `cultural-adaptation → localize`, `translation-audit → locale-audit`, `voice-of-customer/social-listening/trend-research → discourse`, `find-leverage-optimize-win → flow`.

`blog-chart` upstream internal-only; здесь доступен также явно, для подготовленного реального набора данных. Во всех средах это prompt entrypoint, не вызов Python generator.
