/** Model, deadline and prompt of the article critic. Call site: ./article-critic.ts (CLAUDE.md, Judgment-only). */
import editorialRules from "./editorial-rules.md?raw";

export const ARTICLE_CRITIC_MODEL = "claude-sonnet-5";
/** Whole-request budget for the model call; past it the request fails with 504. */
export const ARTICLE_CRITIC_DEADLINE_MS = 120_000;
export const ARTICLE_CRITIC_MAX_TOKENS = 3000;
/** Longer bodies are cut before the call; the critic is told it read an excerpt. */
export const ARTICLE_CRITIC_BODY_CHARS = 60_000;
export const ARTICLE_CRITIC_TOOL = "emit_review";

export const ARTICLE_CRITIC_SYSTEM = `You are an EDITORIAL CRITIC of a personal engineering blog. Read-only: you annotate, you DO NOT rewrite.

Judge the article against the editorial rules below. Emit zero or more notes with the ${ARTICLE_CRITIC_TOOL} tool:
- severity "block": the article must not be published as is. Use it ONLY for: a key claim that its sources do not support; invented personal experience, numbers or quotes; code presented as working that cannot work; a conclusion stronger than the evidence.
- severity "warn": style and polish: filler, repetition, abstract promises, vague wording.

Every note needs a "quote" (a passage copied verbatim from the article, at most 300 characters) and a "reason" (one or two sentences: what is wrong and what would fix it). Do not report formatting or length: those are checked by code. If the article is fine, emit an empty list.

<EDITORIAL-RULES>
${editorialRules}
</EDITORIAL-RULES>`;
