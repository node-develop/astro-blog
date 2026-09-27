import countriesJson from "../data/countries.json";
import gallupJson from "../data/gallup.json";
import msAiJson from "../data/ms_ai.json";
import nichesJson from "../data/niches.json";
import type { Benchmark, CalcState, Country, Lang, Niche, AiLadder } from "./types";

const AI_LADDER = gallupJson.ladder as Readonly<Record<string, AiLadder>>;
const MS_SHARE = msAiJson.share as Readonly<
  Record<string, { readonly q2_26: number; readonly h1_25: number | null }>
>;
/** Countries with the Gallup AI ladder attached where the 2026 survey covers them. */
export const COUNTRIES: readonly Country[] = (countriesJson as unknown as readonly Country[]).map(
  (c) => ({
    ...c,
    ai: AI_LADDER[c.id] ?? null,
    aiMs: MS_SHARE[c.id]?.q2_26 ?? null,
    aiMsPrev: MS_SHARE[c.id]?.h1_25 ?? null,
  }),
);
export const GALLUP = gallupJson;
/** Longest free-text niche idea we keep. */
export const IDEA_MAX = 120;
export const MS_AI = msAiJson;
export const NICHES = (nichesJson as unknown as { niches: readonly Niche[] }).niches;
export const BENCHMARKS = (
  nichesJson as unknown as { benchmarks: Readonly<Record<string, readonly Benchmark[]>> }
).benchmarks;
export const COUNTRY_BY_ID: ReadonlyMap<string, Country> = new Map(COUNTRIES.map((c) => [c.id, c]));

/** Fallback exchange rates (open.er-api.com, 27 Sep 2026); refreshed live on load. */
export const FALLBACK_RATES = { rub: 84.3, eur: 0.878 } as const;

export const DEFAULT_STATE: CalcState = {
  market: ["RU"],
  preset: null,
  mode: "b2c",
  ages: { kids: false, adults: true, seniors: true },
  buyBasis: "buy",
  soft: 60,
  lang: "local",
  overrides: { inet: null, buy: null, rus: null, ai: null },
  b2bBase: "all",
  b2bOnline: 40,
  level: 10,
  customPct: null,
  niche: null,
  idea: "",
  pricing: "subscription",
  price: 490 / FALLBACK_RATES.rub,
  share: 2,
  currency: "rub",
  rates: FALLBACK_RATES,
  econ: {
    cacMode: "cpl",
    cac: 5000 / FALLBACK_RATES.rub,
    cpl: 250 / FALLBACK_RATES.rub,
    conv: 5,
    churn: 8,
    budget: 150_000 / FALLBACK_RATES.rub,
    horizon: 12,
    view: "month",
  },
  ai: { enabled: false, level: "weekly" },
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/**
 * Merge an untrusted object (URL or storage) over the defaults, keeping only
 * known keys with the right primitive types. Anything else is dropped.
 */
export const sanitize = (raw: unknown): CalcState => {
  if (!isObj(raw)) return DEFAULT_STATE;
  const pick = <T>(key: string, base: T): T => {
    const v = raw[key];
    if (base === null) return (v ?? null) as T;
    if (Array.isArray(base)) {
      return (
        Array.isArray(v) ? v.filter((x) => typeof x === "string" && COUNTRY_BY_ID.has(x)) : base
      ) as T;
    }
    if (isObj(base)) {
      if (!isObj(v)) return base;
      return Object.fromEntries(
        Object.entries(base).map(([k, b]) => {
          const x = v[k];
          const ok = b === null ? x === null || typeof x === "number" : typeof x === typeof b;
          return [k, ok ? x : b];
        }),
      ) as T;
    }
    return (typeof v === typeof base ? v : base) as T;
  };
  const merged: CalcState = {
    market: pick("market", DEFAULT_STATE.market),
    preset: pick("preset", DEFAULT_STATE.preset),
    mode: pick("mode", DEFAULT_STATE.mode),
    ages: pick("ages", DEFAULT_STATE.ages),
    buyBasis: pick("buyBasis", DEFAULT_STATE.buyBasis),
    soft: pick("soft", DEFAULT_STATE.soft),
    lang: pick("lang", DEFAULT_STATE.lang),
    overrides: pick("overrides", DEFAULT_STATE.overrides),
    b2bBase: pick("b2bBase", DEFAULT_STATE.b2bBase),
    b2bOnline: pick("b2bOnline", DEFAULT_STATE.b2bOnline),
    level: pick("level", DEFAULT_STATE.level),
    customPct: pick("customPct", DEFAULT_STATE.customPct),
    niche: pick("niche", DEFAULT_STATE.niche),
    idea: pick("idea", DEFAULT_STATE.idea),
    pricing: pick("pricing", DEFAULT_STATE.pricing),
    price: pick("price", DEFAULT_STATE.price),
    share: pick("share", DEFAULT_STATE.share),
    currency: pick("currency", DEFAULT_STATE.currency),
    rates: pick("rates", DEFAULT_STATE.rates),
    econ: pick("econ", DEFAULT_STATE.econ),
    ai: pick("ai", DEFAULT_STATE.ai),
  };
  const enumOk = <T extends string | number>(v: T, allowed: readonly T[], d: T): T =>
    allowed.includes(v) ? v : d;
  const num = (v: number, lo: number, hi: number, d: number): number =>
    Number.isFinite(v) && v >= lo && v <= hi ? v : d;
  const e = merged.econ;
  const de = DEFAULT_STATE.econ;
  return {
    ...merged,
    market: merged.market.length ? [...new Set(merged.market)] : DEFAULT_STATE.market,
    mode: enumOk(merged.mode, ["b2c", "b2b"], "b2c"),
    level: enumOk(merged.level, [2, 10, 50, 100, 1000], 10),
    lang: enumOk(merged.lang, ["ru", "local"], "local"),
    pricing: enumOk(merged.pricing, ["subscription", "one-off"], "subscription"),
    currency: enumOk(merged.currency, ["usd", "rub", "eur"], "rub"),
    buyBasis: enumOk(merged.buyBasis, ["buy", "pay"], "buy"),
    b2bBase: enumOk(merged.b2bBase, ["all", "employer"], "all"),
    preset:
      merged.preset &&
      ["cis", "europe", "namerica", "latam", "asia", "mena", "africa", "world"].includes(
        merged.preset,
      )
        ? merged.preset
        : null,
    niche:
      typeof merged.niche === "string" && NICHES.some((n) => n.id === merged.niche)
        ? merged.niche
        : null,
    idea: typeof merged.idea === "string" ? merged.idea.slice(0, IDEA_MAX) : "",
    customPct:
      typeof merged.customPct === "number" && merged.customPct > 0 && merged.customPct <= 100
        ? merged.customPct
        : null,
    soft: num(merged.soft, 0, 100, DEFAULT_STATE.soft),
    b2bOnline: num(merged.b2bOnline, 0, 100, DEFAULT_STATE.b2bOnline),
    price: num(merged.price, 0, 1e9, DEFAULT_STATE.price),
    share: num(merged.share, 0, 100, DEFAULT_STATE.share),
    overrides: {
      inet: merged.overrides.inet == null ? null : num(merged.overrides.inet, 0, 100, 0) || null,
      buy: merged.overrides.buy == null ? null : num(merged.overrides.buy, 0, 100, 0) || null,
      rus: merged.overrides.rus == null ? null : num(merged.overrides.rus, 0, 100, 0) || null,
      ai: merged.overrides.ai == null ? null : num(merged.overrides.ai, 0, 100, 0) || null,
    },
    rates: {
      rub: num(merged.rates.rub, 1e-6, 1e6, FALLBACK_RATES.rub),
      eur: num(merged.rates.eur, 1e-6, 1e6, FALLBACK_RATES.eur),
    },
    econ: {
      cacMode: enumOk(e.cacMode, ["cac", "cpl"], de.cacMode),
      cac: num(e.cac, 0, 1e9, de.cac),
      cpl: num(e.cpl, 0, 1e9, de.cpl),
      conv: num(e.conv, 0, 100, de.conv),
      churn: num(e.churn, 0, 100, de.churn),
      budget: num(e.budget, 0, 1e10, de.budget),
      horizon: enumOk(e.horizon, [12, 24], 12),
      view: enumOk(e.view, ["month", "cum"], "month"),
    },
    ai: {
      enabled: merged.ai.enabled === true,
      level: enumOk(merged.ai.level, ["ever", "weekly", "daily"], "weekly"),
    },
  };
};

const toB64 = (s: string): string =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const fromB64 = (s: string): string =>
  new TextDecoder().decode(
    Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)),
  );

export const encodeState = (s: CalcState): string => toB64(JSON.stringify(s));

export const decodeState = (param: string | null): CalcState | null => {
  if (!param) return null;
  try {
    return sanitize(JSON.parse(fromB64(param)));
  } catch {
    return null;
  }
};

export const readStore = <T>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};

export const writeStore = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be blocked (private mode); the tool still works without it.
  }
};

export const initialLang = (): Lang => {
  const q = new URLSearchParams(location.search).get("lang");
  if (q === "en" || q === "ru") return q;
  if (location.pathname.startsWith("/en/")) return "en";
  const stored = readStore<string | null>("avatar-calc-lang", null);
  return stored === "en" ? "en" : "ru";
};

export const countryName = (c: Country, lang: Lang): string => (lang === "ru" ? c.ru : c.en);
export const nicheName = (n: Niche, lang: Lang): string => (lang === "ru" ? n.name_ru : n.name_en);
