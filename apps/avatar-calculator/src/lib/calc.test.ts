import { describe, expect, it } from "vitest";
import {
  aiShareOf,
  applyNiche,
  MS_RATIO,
  computeEcon,
  computeResult,
  countryFunnel,
  nearestLevel,
  paybackMonths,
  presetMembers,
  rankIdeas,
  verdictOf,
} from "./calc";
import {
  COUNTRIES,
  COUNTRY_BY_ID,
  DEFAULT_STATE,
  NICHES,
  decodeState,
  encodeState,
  sanitize,
} from "./state";
import type { CalcState, Country } from "./types";

const country: Country = {
  id: "XX",
  ru: "Тест",
  en: "Test",
  reg: "europe",
  pop: 50_000_000,
  popY: 2025,
  a0: 18.5,
  a1: 64,
  a2: 17.5,
  ageY: 2025,
  inet: 100,
  inetY: 2024,
  buy: 50,
  buyY: 2024,
  buyS: "findex",
  pay: 40,
  payY: 2024,
  payE: false,
  card: 80,
  gdp: 20_000,
  ppp: 40_000,
  rus: 10,
  rusE: false,
  firms: 500_000,
  emp: 150_000,
  firmsE: false,
  firmsY: 2024,
};
const s = (over: Partial<CalcState> = {}): CalcState => ({
  ...DEFAULT_STATE,
  market: ["XX"],
  ...over,
});

describe("countryFunnel", () => {
  it("walks the lesson example: 50M online, working age, half buy online", () => {
    const f = countryFunnel(
      country,
      s({
        lang: "local",
        soft: 100,
        ages: { kids: false, adults: true, seniors: false },
        level: 2,
      }),
    );
    const v = Object.fromEntries(f.map((x) => [x.key, x.value]));
    expect(v.online).toBe(50_000_000);
    expect(v.age).toBeCloseTo(32_000_000);
    expect(v.buy).toBeCloseTo(16_000_000);
    expect(v.avatars).toBeCloseTo(8_000_000);
  });

  it("applies software share, Russian speakers and a custom breadth", () => {
    const f = countryFunnel(
      country,
      s({
        soft: 60,
        lang: "ru",
        customPct: 1,
        ages: { kids: false, adults: true, seniors: false },
      }),
    );
    expect(f.at(-1)?.value).toBeCloseTo(16_000_000 * 0.6 * 0.1 * 0.01);
  });

  it("uses the stricter paid-online basis and user overrides", () => {
    const base = s({
      lang: "local",
      soft: 100,
      level: 2,
      ages: { kids: false, adults: true, seniors: false },
    });
    const pay = countryFunnel(country, { ...base, buyBasis: "pay" }).at(-1)?.value ?? 0;
    const over =
      countryFunnel(country, { ...base, overrides: { inet: null, buy: 25, rus: null, ai: null } }).at(-1)
        ?.value ?? 0;
    expect(pay).toBeCloseTo(32_000_000 * 0.4 * 0.5);
    expect(over).toBeCloseTo(32_000_000 * 0.25 * 0.5);
  });

  it("starts B2B from businesses", () => {
    const f = countryFunnel(country, s({ mode: "b2b", b2bOnline: 40, lang: "local", level: 100 }));
    expect(f[0]?.value).toBe(500_000);
    expect(f.at(-1)?.value).toBeCloseTo(500_000 * 0.4 * 0.01);
  });
});

describe("AI users step (Gallup and Microsoft)", () => {
  const withLadder: Country = { ...country, inet: 80, ai: { d: 20, w: 20, m: 10, an: 30, na: 20 } };
  const base = s({ lang: "local", soft: 100, level: 2, ages: { kids: false, adults: true, seniors: false } });

  it("keeps only AI users among people online, at the chosen frequency", () => {
    const off = countryFunnel(withLadder, base);
    const weekly = countryFunnel(withLadder, { ...base, ai: { enabled: true, level: "weekly" } });
    const aged = off.find((x) => x.key === "age")?.value ?? 0;
    expect(off.some((x) => x.key === "ai")).toBe(false);
    expect(weekly.find((x) => x.key === "ai")?.value).toBeCloseTo(aged * (40 / 80));
    const daily = countryFunnel(withLadder, { ...base, ai: { enabled: true, level: "daily" } });
    expect(daily.at(-1)!.value).toBeLessThan(weekly.at(-1)!.value);
  });

  it("uses Microsoft's share, rescaled and capped by internet, where Gallup has no ladder", () => {
    const msOnly = { ...withLadder, ai: null, aiMs: 20 };
    const a = aiShareOf(msOnly, "weekly");
    expect(a?.src).toBe("ms");
    expect(a?.value).toBeCloseTo(20 * MS_RATIO.weekly);
    expect(aiShareOf({ ...msOnly, aiMs: 90 }, "ever")?.value).toBe(80);
    expect(aiShareOf(withLadder, "weekly")).toEqual({ value: 40, src: "gallup" });
  });

  it("skips the step when no market country has data, else fills gaps with the median", () => {
    const bare = { ...withLadder, ai: null, aiMs: null };
    const on = { ...base, ai: { enabled: true, level: "ever" as const } };
    expect(aiShareOf(bare, "ever")).toBeNull();
    expect(computeResult([bare], on).funnel.some((x) => x.key === "ai")).toBe(false);
    const mixed = computeResult([bare, withLadder], on).funnel;
    const alone = computeResult([withLadder], on).funnel;
    const aged = (f: typeof mixed) => f.find((x) => x.key === "age")?.value ?? 0;
    const ai = (f: typeof mixed) => f.find((x) => x.key === "ai")?.value ?? 0;
    expect(ai(mixed) - ai(alone)).toBeCloseTo((aged(mixed) - aged(alone)) * (43.2 / 80));
    const typed = countryFunnel(bare, { ...on, overrides: { inet: null, buy: null, rus: null, ai: 8 } });
    expect(typed.find((x) => x.key === "ai")?.value).toBeCloseTo(aged(alone) * 0.1);
  });

  it("attaches Gallup and Microsoft data to real countries", () => {
    const ru = COUNTRY_BY_ID.get("RU")!;
    expect(ru.ai?.d).toBe(20.8);
    expect(ru.aiMs).toBe(9.9);
    const de = COUNTRY_BY_ID.get("DE")!;
    expect(de.ai).toBeNull();
    expect(aiShareOf(de, "weekly")?.src).toBe("ms");
  });
});

describe("computeResult", () => {
  it("multiplies avatars by the annual check and your share", () => {
    const r = computeResult(
      [country],
      s({
        lang: "local",
        soft: 100,
        level: 2,
        price: 10,
        share: 2,
        ages: { kids: false, adults: true, seniors: false },
      }),
    );
    expect(r.check).toBe(120);
    expect(r.tam).toBeCloseTo(8_000_000 * 120);
    expect(r.revenue).toBeCloseTo(8_000_000 * 0.02 * 120);
  });

  it("sums a multi-country market", () => {
    const cis = presetMembers(COUNTRIES, "cis")
      .map((id) => COUNTRY_BY_ID.get(id))
      .filter((c): c is Country => !!c);
    const one = computeResult(cis.slice(0, 1), DEFAULT_STATE).avatars;
    const all = computeResult(cis, DEFAULT_STATE).avatars;
    expect(cis.length).toBe(12);
    expect(all).toBeGreaterThan(one);
  });
});

describe("computeEcon", () => {
  const econ = {
    ...DEFAULT_STATE.econ,
    cacMode: "cpl" as const,
    cpl: 6,
    conv: 4,
    churn: 5,
    budget: 3000,
  };

  it("derives CAC from lead cost and conversion", () => {
    const e = computeEcon(econ, 39, "subscription", 1e9);
    expect(e.cac).toBeCloseTo(150);
    expect(e.ltv).toBeCloseTo(780);
    expect(e.ltvCac).toBeCloseTo(5.2);
    expect(e.newPerMonth).toBeCloseTo(20);
  });

  it("finds the month marketing pays back", () => {
    const e = computeEcon(econ, 39, "subscription", 1e9);
    expect(e.breakEven).toBe(8);
  });

  it("never acquires more customers than avatars and stops spending once they run out", () => {
    const e = computeEcon(econ, 39, "subscription", 50);
    expect(e.months.at(-1)?.clients ?? 0).toBeLessThanOrEqual(50);
    expect(e.months.at(-1)?.cumSpend).toBeCloseTo(50 * 150);
  });

  it("counts churn in payback: a customer who leaves too fast never pays back", () => {
    expect(paybackMonths(5000, 490, 0.2, true)).toBe(Infinity);
    expect(paybackMonths(150, 39, 0, true)).toBeCloseTo(150 / 39);
    expect(paybackMonths(150, 39, 0.05, true)).toBeGreaterThan(150 / 39);
  });
});

describe("levels, verdicts, ideas and URL state", () => {
  it("maps percentages to lesson levels", () => {
    expect(nearestLevel(30)).toBe(2);
    expect(nearestLevel(0.2)).toBe(1000);
    expect(nearestLevel(1.5)).toBe(50);
  });

  it("grades avatar counts", () => {
    expect(verdictOf(9_999)).toBe("critical");
    expect(verdictOf(250_000)).toBe("workable");
    expect(verdictOf(20_000_000)).toBe("mass");
  });

  it("applies a niche and ranks ideas", () => {
    const vpn = NICHES.find((n) => n.id === "vpn");
    expect(vpn).toBeDefined();
    const ru = [COUNTRY_BY_ID.get("RU")].filter((c): c is Country => !!c);
    const applied = applyNiche(DEFAULT_STATE, vpn!, ru);
    expect(applied.level).toBe(2);
    expect(applied.price).toBeCloseTo(290 / DEFAULT_STATE.rates.rub, 1);
    const oneOff = NICHES.find((n) => n.pricing === "one-off");
    expect(oneOff).toBeDefined();
    const bought = applyNiche(DEFAULT_STATE, oneOff!, ru);
    expect(bought.pricing).toBe("one-off");
    expect(bought.price).toBeCloseTo(
      (oneOff!.price_ru_rub_month * 12) / DEFAULT_STATE.rates.rub,
      0,
    );
    const ideas = rankIdeas(NICHES, ru, DEFAULT_STATE);
    expect(ideas).toHaveLength(NICHES.length);
    expect(ideas[0]!.revenue).toBeGreaterThanOrEqual(ideas.at(-1)!.revenue);
  });

  it("round-trips state through the share link and drops junk", () => {
    const st = { ...DEFAULT_STATE, market: ["KZ", "UZ"], level: 1000 as const, price: 42 };
    expect(decodeState(encodeState(st))).toEqual(st);
    expect(sanitize({ market: ["??"], level: 7, price: "x" })).toEqual(DEFAULT_STATE);
    const hostile = sanitize({
      market: ["RU", "RU"],
      econ: { horizon: 200000, view: "x" },
      rates: { rub: 0, eur: -1 },
      share: -5,
    });
    expect(hostile.market).toEqual(["RU"]);
    expect(hostile.econ.horizon).toBe(12);
    expect(hostile.econ.view).toBe("month");
    expect(hostile.rates).toEqual(DEFAULT_STATE.rates);
    expect(hostile.share).toBe(DEFAULT_STATE.share);
  });
});
