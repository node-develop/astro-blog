export type Lang = "ru" | "en";
export type RegionId = "cis" | "europe" | "namerica" | "latam" | "asia" | "mena" | "africa";
export type PresetId = RegionId | "world";
export type Mode = "b2c" | "b2b";
export type LevelId = 2 | 10 | 50 | 100 | 1000;
export type BuyBasis = "buy" | "pay";
export type ProductLang = "ru" | "local";
export type Pricing = "subscription" | "one-off";
export type Currency = "usd" | "rub" | "eur";
export type CacMode = "cac" | "cpl";

export interface Country {
  readonly id: string;
  readonly ru: string;
  readonly en: string;
  readonly reg: RegionId;
  readonly pop: number;
  readonly popY: number;
  /** Age groups, % of population: 0-14, 15-64, 65+. */
  readonly a0: number;
  readonly a1: number;
  readonly a2: number;
  readonly ageY: number;
  /** Internet users, % of population. */
  readonly inet: number;
  readonly inetY: number;
  /** Bought something online in the past year, % of adults 15+. */
  readonly buy: number | null;
  readonly buyY: number | null;
  /** Where `buy` comes from: Findex survey, a researched estimate, or the regional median. */
  readonly buyS: "findex" | "est" | "region";
  /** Paid an online merchant digitally, % of adults 15+ (Findex fin27a). */
  readonly pay: number | null;
  readonly payY: number | null;
  /** `pay` was estimated as buy × the median pay/buy ratio (Findex 2021 skipped the question). */
  readonly payE: boolean;
  readonly card: number | null;
  readonly gdp: number | null;
  readonly ppp: number | null;
  /** Speaks Russian fluently, % of population. */
  readonly rus: number;
  readonly rusE: boolean;
  readonly firms: number;
  readonly emp: number;
  readonly firmsE: boolean;
  readonly firmsY: number | null;
}

export interface Niche {
  readonly id: string;
  readonly name_ru: string;
  readonly name_en: string;
  readonly level: LevelId;
  readonly segment_share_pct: number;
  readonly model: Mode;
  readonly pricing: "subscription" | "one-off" | "transaction";
  readonly price_ru_rub_month: number;
  readonly price_us_usd_month: number;
  readonly example_products: readonly string[];
  readonly anomaly: string | null;
  readonly note_ru: string;
}

export interface Benchmark {
  readonly id: string;
  readonly label_ru: string;
  readonly label_en: string;
  readonly low: number;
  readonly high: number;
  readonly default: number;
  readonly unit: string;
  readonly region: string;
  readonly src: string;
}

export interface Ages {
  readonly kids: boolean;
  readonly adults: boolean;
  readonly seniors: boolean;
}

/** Values the user typed over the country data. `null` means "use the data". */
export interface Overrides {
  readonly inet: number | null;
  readonly buy: number | null;
  readonly rus: number | null;
}

export interface Econ {
  readonly cacMode: CacMode;
  /** USD per paying customer. */
  readonly cac: number;
  /** USD per lead. */
  readonly cpl: number;
  /** Lead to paid, %. */
  readonly conv: number;
  /** Monthly churn, %. */
  readonly churn: number;
  /** Marketing budget, USD per month. */
  readonly budget: number;
  readonly horizon: 12 | 24;
  readonly view: "month" | "cum";
}

export interface CalcState {
  readonly market: readonly string[];
  readonly preset: PresetId | null;
  readonly mode: Mode;
  readonly ages: Ages;
  readonly buyBasis: BuyBasis;
  /** Share of online buyers who pay for software, %. */
  readonly soft: number;
  readonly lang: ProductLang;
  readonly overrides: Overrides;
  readonly b2bBase: "all" | "employer";
  /** B2B: share of businesses that sell online or have a sales team, %. */
  readonly b2bOnline: number;
  readonly level: LevelId;
  /** A custom breadth, %. Wins over the level when set. */
  readonly customPct: number | null;
  readonly niche: string | null;
  readonly pricing: Pricing;
  /** Price per month (subscription) or per purchase (one-off), USD. */
  readonly price: number;
  /** Share of the market you can win, %. */
  readonly share: number;
  readonly currency: Currency;
  readonly rates: { readonly rub: number; readonly eur: number };
  readonly econ: Econ;
}

export interface FunnelStep {
  readonly key:
    "pop" | "online" | "age" | "buy" | "soft" | "lang" | "firms" | "b2bOnline" | "avatars";
  readonly value: number;
}
