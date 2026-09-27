import { aiActive, avatarsOf, computeResult, countryFunnel, verdictOf } from "./calc";
import type { CalcState, Country, Lang } from "./types";

/**
 * One anonymous record of what someone calculated: niche or own idea,
 * market, settings and the result. No names, contacts or IP; the session id
 * is random per page load and is not stored anywhere in the browser.
 */
export interface SearchRecord {
  readonly v: 1;
  readonly sid: string;
  readonly lang: Lang;
  readonly mode: CalcState["mode"];
  readonly niche: string | null;
  readonly idea: string;
  readonly preset: CalcState["preset"];
  readonly market: readonly string[];
  readonly level: CalcState["level"];
  readonly customPct: number | null;
  readonly pricing: CalcState["pricing"];
  /** USD per month (subscription) or per purchase. */
  readonly priceUsd: number;
  readonly currency: CalcState["currency"];
  readonly share: number;
  readonly ai: CalcState["ai"]["level"] | null;
  readonly avatars: number;
  /** USD per year. */
  readonly tam: number;
  readonly revenue: number;
  readonly verdict: ReturnType<typeof verdictOf>;
  /** Up to five market countries with the most avatars. */
  readonly top: readonly { readonly id: string; readonly avatars: number }[];
}

const round = (v: number, d = 0): number => {
  const k = 10 ** d;
  return Math.round(v * k) / k;
};

/** Worth recording only when there is a niche or an idea to learn from. */
export const shouldLog = (s: CalcState): boolean => s.niche != null || s.idea.trim().length >= 3;

export const buildRecord = (
  s: CalcState,
  countries: readonly Country[],
  lang: Lang,
  sid: string,
): SearchRecord => {
  const r = computeResult(countries, s);
  // Same AI switch as the market funnel, so per-country numbers add up to the total.
  const eff = { ...s, ai: { ...s.ai, enabled: aiActive(countries, s) } };
  const top = countries
    .map((c) => ({ id: c.id, avatars: Math.round(avatarsOf(countryFunnel(c, eff))) }))
    .toSorted((a, b) => b.avatars - a.avatars)
    .slice(0, 5);
  return {
    v: 1,
    sid,
    lang,
    mode: s.mode,
    niche: s.niche,
    idea: s.idea.trim(),
    preset: s.preset,
    market: s.market,
    level: s.level,
    customPct: s.customPct,
    pricing: s.pricing,
    priceUsd: round(s.price, 2),
    currency: s.currency,
    share: s.share,
    ai: eff.ai.enabled ? s.ai.level : null,
    avatars: Math.round(r.avatars),
    tam: Math.round(r.tam),
    revenue: Math.round(r.revenue),
    verdict: verdictOf(r.avatars),
    top,
  };
};

/** The fields that make two records the same search (the session id and result follow from them). */
export const recordKey = (r: SearchRecord): string =>
  JSON.stringify([r.mode, r.niche, r.idea, r.market, r.level, r.customPct, r.pricing, r.priceUsd, r.share, r.ai]);

export const sendRecord = (r: SearchRecord): void => {
  if (navigator.doNotTrack === "1" || ["localhost", "127.0.0.1"].includes(location.hostname)) return;
  // Relative URL: works at the site root and under /avatar-calculator/.
  fetch("./api/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(r),
    keepalive: true,
  }).catch(() => undefined);
};
