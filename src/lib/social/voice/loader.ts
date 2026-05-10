import type { SocialChannel } from "../types.js";

import profile from "./profile.md?raw";
import xPolicy from "./policy/x.md?raw";
import liPolicy from "./policy/linkedin.md?raw";
import tgPolicy from "./policy/telegram.md?raw";
import examplesJson from "./examples.json" with { type: "json" };
import bannedJson from "./banned-phrases.json" with { type: "json" };

export type VoiceCard = {
  profile: string;
  examples: VoiceExamples;
  banned: BannedPhrases;
  policy: Record<SocialChannel, string>;
};

export type VoiceExamples = {
  x_en: {
    article_excerpt: string;
    ideal_draft: { type: "single" | "thread"; body?: string; parts?: string[] };
  }[];
  li_en: { article_excerpt: string; ideal_draft: { body: string } }[];
  tg_ru: { article_excerpt: string; ideal_draft: { body: string } }[];
};

export type BannedPhrases = {
  en: { phrases: string[]; patterns: [string, string][] };
  ru: { phrases: string[]; patterns: [string, string][] };
};

const card: VoiceCard = {
  profile,
  examples: examplesJson as VoiceExamples,
  banned: bannedJson as BannedPhrases,
  policy: { x_en: xPolicy, li_en: liPolicy, tg_ru: tgPolicy },
};

export const loadVoiceCard = (): Promise<VoiceCard> => Promise.resolve(card);

export const getChannelExamples = async <C extends SocialChannel>(
  channel: C,
): Promise<VoiceExamples[C]> => card.examples[channel];

export const getBannedPhrases = async (): Promise<BannedPhrases> => card.banned;

export const getPolicy = async (channel: SocialChannel): Promise<string> => card.policy[channel];

/** Test-only: no-op kept for backward compatibility with existing tests. */
export const __resetForTest = (): void => {
  // no-op — static imports are always resolved at bundle time; nothing to reset
};
