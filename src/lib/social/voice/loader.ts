import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { SocialChannel } from "../types.js";

const HERE = dirname(fileURLToPath(import.meta.url));

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

let memo: Promise<VoiceCard> | null = null;

const POLICY_FILE: Record<SocialChannel, string> = {
  x_en: "policy/x.md",
  li_en: "policy/linkedin.md",
  tg_ru: "policy/telegram.md",
};

const load = async (): Promise<VoiceCard> => {
  const [profile, examplesRaw, bannedRaw, x, li, tg] = await Promise.all([
    readFile(join(HERE, "profile.md"), "utf8"),
    readFile(join(HERE, "examples.json"), "utf8"),
    readFile(join(HERE, "banned-phrases.json"), "utf8"),
    readFile(join(HERE, POLICY_FILE.x_en), "utf8"),
    readFile(join(HERE, POLICY_FILE.li_en), "utf8"),
    readFile(join(HERE, POLICY_FILE.tg_ru), "utf8"),
  ]);
  return {
    profile,
    examples: JSON.parse(examplesRaw) as VoiceExamples,
    banned: JSON.parse(bannedRaw) as BannedPhrases,
    policy: { x_en: x, li_en: li, tg_ru: tg },
  };
};

export const loadVoiceCard = (): Promise<VoiceCard> => {
  if (!memo) memo = load();
  return memo;
};

export const getChannelExamples = async <C extends SocialChannel>(
  channel: C,
): Promise<VoiceExamples[C]> => {
  const { examples } = await loadVoiceCard();
  return examples[channel];
};

export const getBannedPhrases = async (): Promise<BannedPhrases> => {
  const { banned } = await loadVoiceCard();
  return banned;
};

export const getPolicy = async (channel: SocialChannel): Promise<string> => {
  const { policy } = await loadVoiceCard();
  return policy[channel];
};

/** Test-only: clear memo. NOT exported through public index. */
export const __resetForTest = (): void => {
  memo = null;
};
