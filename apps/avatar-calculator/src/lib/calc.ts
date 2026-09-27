import gallup from "../data/gallup.json";
import msAi from "../data/ms_ai.json";
import type {
  AiLevel,
  CalcState,
  Country,
  Econ,
  FunnelStep,
  LevelId,
  Niche,
  PresetId,
  Pricing,
  RegionId,
} from "./types";

export const LEVELS: readonly LevelId[] = [2, 10, 50, 100, 1000];
export const LEVEL_PCT: Readonly<Record<LevelId, number>> = {
  2: 50,
  10: 10,
  50: 2,
  100: 1,
  1000: 0.1,
};
/** Price tier from the lesson board: 1 to 4 dollar signs. */
export const LEVEL_TIER: Readonly<Record<LevelId, number>> = {
  2: 1,
  10: 2,
  50: 3,
  100: 4,
  1000: 4,
};

export const CIS_IDS: readonly string[] = [
  "RU",
  "BY",
  "KZ",
  "UZ",
  "KG",
  "TJ",
  "AM",
  "AZ",
  "MD",
  "TM",
  "GE",
  "UA",
];

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const pct = (v: number): number => clamp(v, 0, 100) / 100;

export const breadthPct = (s: Pick<CalcState, "level" | "customPct">): number =>
  s.customPct ?? LEVEL_PCT[s.level];

/** The lesson level closest to a percentage, on a log scale. */
export const nearestLevel = (p: number): LevelId =>
  LEVELS.reduce<LevelId>(
    (best, l) =>
      Math.abs(Math.log(p) - Math.log(LEVEL_PCT[l])) <
      Math.abs(Math.log(p) - Math.log(LEVEL_PCT[best]))
        ? l
        : best,
    2,
  );

/** The level the UI talks about. A niche keeps its own lesson level even when it refines the share. */
export const shownLevel = (s: Pick<CalcState, "level" | "customPct" | "niche">): LevelId =>
  s.customPct == null || s.niche != null ? s.level : nearestLevel(s.customPct);

export const ageShare = (c: Country, s: Pick<CalcState, "ages">): number =>
  (s.ages.kids ? c.a0 : 0) + (s.ages.adults ? c.a1 : 0) + (s.ages.seniors ? c.a2 : 0);

/** Online-buying rate for the country in the chosen basis, % of adults. */
export const buyRate = (c: Country, s: Pick<CalcState, "buyBasis" | "overrides">): number => {
  if (s.overrides.buy != null) return s.overrides.buy;
  const base = c.buy ?? 0;
  return s.buyBasis === "pay" ? (c.pay ?? base) : base;
};

export const inetRate = (c: Country, s: Pick<CalcState, "overrides">): number =>
  s.overrides.inet ?? c.inet;

/** Median of the 37 Gallup countries; fills in for a country with no data inside a mixed market. */
export const AI_MEDIAN: Readonly<Record<AiLevel, number>> = gallup.medians.computed;

/** Microsoft share times these ratios gives a Gallup-like share (median over the countries both cover). */
export const MS_RATIO: Readonly<Record<AiLevel, number>> = msAi.calibration.ratio;

export type AiSource = "gallup" | "ms";

/**
 * Share of adults who use AI at a level. Gallup's survey where it exists,
 * otherwise Microsoft's usage share scaled onto Gallup's ladder (an estimate,
 * capped by the country's internet share). Null when neither source has it.
 */
export const aiShareOf = (
  c: Country,
  level: AiLevel,
): { readonly value: number; readonly src: AiSource } | null => {
  const l = c.ai;
  if (l) {
    const value = level === "daily" ? l.d : level === "weekly" ? l.d + l.w : l.d + l.w + l.m;
    return { value, src: "gallup" };
  }
  if (c.aiMs == null) return null;
  return { value: Math.min(c.aiMs * MS_RATIO[level], c.inet, 100), src: "ms" };
};

export const aiRate = (c: Country, s: Pick<CalcState, "ai" | "overrides">): number =>
  s.overrides.ai ?? aiShareOf(c, s.ai.level)?.value ?? AI_MEDIAN[s.ai.level];

/** The AI step only applies to B2C and only when some market country has data. */
export const aiActive = (countries: readonly Country[], s: CalcState): boolean =>
  s.mode === "b2c" && s.ai.enabled && countries.some((c) => c.ai != null || c.aiMs != null);

export const langRate = (c: Country, s: Pick<CalcState, "lang" | "overrides">): number =>
  s.lang === "local" ? 100 : (s.overrides.rus ?? c.rus);

/**
 * One country's funnel. B2C walks people down from population to avatars;
 * B2B starts from the count of businesses.
 *
 * Buyers: Findex reports the share of ALL adults who bought online, so the
 * rate among people already online is buy / internet (capped at 100%).
 */
export const countryFunnel = (c: Country, s: CalcState): readonly FunnelStep[] => {
  const lang = pct(langRate(c, s));
  const breadth = pct(breadthPct(s));
  if (s.mode === "b2b") {
    const firms = s.b2bBase === "all" ? c.firms : c.emp;
    const online = firms * pct(s.b2bOnline);
    const spoken = online * lang;
    return [
      { key: "firms", value: firms },
      { key: "b2bOnline", value: online },
      { key: "lang", value: spoken },
      { key: "avatars", value: spoken * breadth },
    ];
  }
  const inet = inetRate(c, s);
  const online = c.pop * pct(inet);
  const aged = online * pct(ageShare(c, s));
  // Gallup reports AI users as a share of all adults; among people already
  // online that is ai / internet (capped at 100%).
  const withAi = s.ai.enabled ? aged * clamp(inet > 0 ? aiRate(c, s) / inet : 0, 0, 1) : aged;
  const buyers = withAi * clamp(inet > 0 ? buyRate(c, s) / inet : 0, 0, 1);
  const payers = buyers * pct(s.soft);
  const spoken = payers * lang;
  return [
    { key: "pop", value: c.pop },
    { key: "online", value: online },
    { key: "age", value: aged },
    ...(s.ai.enabled ? [{ key: "ai" as const, value: withAi }] : []),
    { key: "buy", value: buyers },
    { key: "soft", value: payers },
    { key: "lang", value: spoken },
    { key: "avatars", value: spoken * breadth },
  ];
};

/** Sum the funnels of every country in the market, step by step. */
export const marketFunnel = (
  countries: readonly Country[],
  s: CalcState,
): readonly FunnelStep[] => {
  const on = aiActive(countries, s);
  const eff = on === s.ai.enabled ? s : { ...s, ai: { ...s.ai, enabled: on } };
  const per = countries.map((c) => countryFunnel(c, eff));
  const first = per[0];
  if (!first) return [];
  return first.map((step, i) => ({
    key: step.key,
    value: per.reduce((sum, f) => sum + (f[i]?.value ?? 0), 0),
  }));
};

export const avatarsOf = (funnel: readonly FunnelStep[]): number =>
  funnel[funnel.length - 1]?.value ?? 0;

export const annualCheck = (price: number, pricing: Pricing): number =>
  pricing === "subscription" ? price * 12 : price;

export interface Result {
  readonly funnel: readonly FunnelStep[];
  readonly avatars: number;
  /** Everyone above the breadth filter: the audience the level is a share of. */
  readonly audience: number;
  readonly check: number;
  readonly tam: number;
  readonly clients: number;
  readonly revenue: number;
}

export const computeResult = (countries: readonly Country[], s: CalcState): Result => {
  const funnel = marketFunnel(countries, s);
  const avatars = avatarsOf(funnel);
  const audience = funnel[funnel.length - 2]?.value ?? 0;
  const check = annualCheck(s.price, s.pricing);
  const tam = avatars * check;
  const clients = avatars * pct(s.share);
  return { funnel, avatars, audience, check, tam, clients, revenue: clients * check };
};

export type VerdictId = "critical" | "small" | "workable" | "large" | "mass";
export const verdictOf = (avatars: number): VerdictId =>
  avatars < 10_000
    ? "critical"
    : avatars < 100_000
      ? "small"
      : avatars < 1_000_000
        ? "workable"
        : avatars < 10_000_000
          ? "large"
          : "mass";
export const VERDICT_ORDER: readonly VerdictId[] = [
  "critical",
  "small",
  "workable",
  "large",
  "mass",
];

/* ── Customer economics ─────────────────────────────────────────────── */

export interface EconResult {
  readonly cac: number;
  readonly ltv: number;
  readonly ltvCac: number;
  /** Months until a customer repays their CAC. Infinity when never. */
  readonly payback: number;
  readonly newPerMonth: number;
  readonly clientsPerYear: number;
  readonly months: readonly {
    readonly m: number;
    readonly clients: number;
    readonly revenue: number;
    readonly cumRevenue: number;
    readonly cumSpend: number;
  }[];
  /** First month when cumulative revenue covers cumulative spend, or null. */
  readonly breakEven: number | null;
}

/** Cost of one paying customer. Zero or negative inputs mean "cannot compute": Infinity. */
export const effectiveCac = (e: Econ): number => {
  const v = e.cacMode === "cac" ? e.cac : e.conv > 0 ? e.cpl / (e.conv / 100) : Infinity;
  return v > 0 ? v : Infinity;
};

/**
 * Months until one customer's payments cover their CAC, with churn. Revenue
 * from a customer after n months is price × (1 - (1-c)^n) / c; solve for n.
 */
export const paybackMonths = (cac: number, price: number, churn: number, sub: boolean): number => {
  if (!Number.isFinite(cac) || price <= 0) return Infinity;
  if (!sub) return price >= cac ? 0 : Infinity;
  if (churn <= 0) return cac / price;
  const k = (cac * churn) / price;
  return k >= 1 ? Infinity : Math.log(1 - k) / Math.log(1 - churn);
};

export const computeEcon = (
  e: Econ,
  price: number,
  pricing: Pricing,
  avatars: number,
): EconResult => {
  const cac = effectiveCac(e);
  const churn = clamp(e.churn, 0, 100) / 100;
  const sub = pricing === "subscription";
  const ltv = sub ? (churn > 0 ? price / churn : price * 120) : price;
  const ltvCac = Number.isFinite(cac) ? ltv / cac : 0;
  const payback = paybackMonths(cac, price, churn, sub);
  const rawNew = Number.isFinite(cac) ? Math.max(0, e.budget) / cac : 0;

  const months = Array.from({ length: e.horizon }).reduce<EconResult["months"]>((acc) => {
    const prev = acc[acc.length - 1];
    const acquired = acc.length * rawNew;
    // Never acquire more customers than there are avatars in the market.
    const newNow = Math.max(0, Math.min(rawNew, avatars - acquired));
    const clients = sub ? (prev?.clients ?? 0) * (1 - churn) + newNow : newNow;
    const revenue = clients * price;
    // Once the market runs out, you stop buying traffic for it.
    const spend = rawNew > 0 ? e.budget * (newNow / rawNew) : 0;
    return [
      ...acc,
      {
        m: acc.length + 1,
        clients,
        revenue,
        cumRevenue: (prev?.cumRevenue ?? 0) + revenue,
        cumSpend: (prev?.cumSpend ?? 0) + spend,
      },
    ];
  }, []);
  const be = months.find((x) => x.cumSpend > 0 && x.cumRevenue >= x.cumSpend);
  return {
    cac,
    ltv,
    ltvCac,
    payback,
    newPerMonth: rawNew,
    clientsPerYear: Math.min(rawNew * 12, avatars),
    months,
    breakEven: be ? be.m : null,
  };
};

/* ── Markets ────────────────────────────────────────────────────────── */

export const PRESETS: readonly PresetId[] = [
  "cis",
  "europe",
  "namerica",
  "latam",
  "asia",
  "mena",
  "africa",
  "world",
];

export const presetMembers = (all: readonly Country[], p: PresetId): readonly string[] =>
  p === "world"
    ? all.map((c) => c.id)
    : all.filter((c) => c.reg === (p as RegionId)).map((c) => c.id);

/** PPP-weighted income of a market, for scaling prices between countries. */
export const marketPpp = (countries: readonly Country[]): number => {
  const withPpp = countries.filter((c) => c.ppp != null);
  const pop = withPpp.reduce((s, c) => s + c.pop, 0);
  return pop > 0 ? withPpp.reduce((s, c) => s + (c.ppp ?? 0) * c.pop, 0) / pop : 0;
};

export const US_PPP = 90_000;

/**
 * A niche's monthly price in USD for a market. Russian-speaking CIS markets use
 * the Russian ruble price; other markets scale the US price by income (PPP),
 * clamped so poor markets do not drop to zero and rich ones do not exceed the US.
 */
export const nichePriceUsd = (
  n: Niche,
  countries: readonly Country[],
  rubPerUsd: number,
): number => {
  const cisOnly = countries.length > 0 && countries.every((c) => CIS_IDS.includes(c.id));
  if (cisOnly && rubPerUsd > 0) return n.price_ru_rub_month / rubPerUsd;
  const factor = clamp(marketPpp(countries) / US_PPP, 0.2, 1);
  return n.price_us_usd_month * factor;
};

export const applyNiche = (s: CalcState, n: Niche, countries: readonly Country[]): CalcState => ({
  ...s,
  niche: n.id,
  mode: n.model,
  level: n.level,
  customPct: n.segment_share_pct === LEVEL_PCT[n.level] ? null : n.segment_share_pct,
  pricing: n.pricing === "one-off" ? "one-off" : "subscription",
  // Library prices are per month; a one-off price was stored spread over 12 months.
  price:
    Math.round(
      nichePriceUsd(n, countries, s.rates.rub) * (n.pricing === "one-off" ? 12 : 1) * 100,
    ) / 100,
});

export interface Idea {
  readonly niche: Niche;
  readonly avatars: number;
  readonly price: number;
  readonly tam: number;
  readonly revenue: number;
}

/** Rank the niche library for the current market by the revenue you could win. */
export const rankIdeas = (
  niches: readonly Niche[],
  countries: readonly Country[],
  s: CalcState,
): readonly Idea[] =>
  niches
    .map((n) => {
      const ns = applyNiche(s, n, countries);
      const r = computeResult(countries, ns);
      return { niche: n, avatars: r.avatars, price: ns.price, tam: r.tam, revenue: r.revenue };
    })
    .toSorted((a, b) => b.revenue - a.revenue);
