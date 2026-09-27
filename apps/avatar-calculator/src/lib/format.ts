import type { Currency, Lang } from "./types";

const locale = (lang: Lang): string => (lang === "ru" ? "ru-RU" : "en-US");

const UNITS: Readonly<Record<Lang, readonly [number, string][]>> = {
  ru: [
    [1e9, " млрд"],
    [1e6, " млн"],
    [1e3, " тыс."],
  ],
  en: [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ],
};

/** 12,3 млн / 12.3M. Below a thousand the number is shown whole. */
export const compact = (n: number, lang: Lang, minCompact = 1e4): string => {
  if (!Number.isFinite(n)) return "∞";
  const a = Math.abs(n);
  const unit = a >= minCompact ? UNITS[lang].find(([v]) => a >= v) : undefined;
  if (unit) {
    const [v, suffix] = unit;
    const x = n / v;
    const digits = Math.abs(x) >= 100 ? 0 : 1;
    return (
      new Intl.NumberFormat(locale(lang), { maximumFractionDigits: digits }).format(x) + suffix
    );
  }
  return new Intl.NumberFormat(locale(lang), { maximumFractionDigits: a < 10 ? 1 : 0 }).format(n);
};

export const whole = (n: number, lang: Lang): string =>
  Number.isFinite(n)
    ? new Intl.NumberFormat(locale(lang), { maximumFractionDigits: 0 }).format(n)
    : "∞";

export const num = (n: number, lang: Lang, digits = 1): string =>
  new Intl.NumberFormat(locale(lang), { maximumFractionDigits: digits }).format(n);

export const pctText = (n: number, lang: Lang): string => {
  const digits = n < 1 ? 2 : n < 10 ? 1 : 0;
  return `${new Intl.NumberFormat(locale(lang), { maximumFractionDigits: digits }).format(n)}%`;
};

const SYMBOL: Readonly<Record<Currency, string>> = { usd: "$", rub: "₽", eur: "€" };
export const currencySymbol = (c: Currency): string => SYMBOL[c];

/** Money from USD into the display currency: `$1,2 млн`, `98 тыс. ₽`. */
export const money = (
  usd: number,
  cur: Currency,
  rates: { readonly rub: number; readonly eur: number },
  lang: Lang,
): string => {
  const v = cur === "usd" ? usd : cur === "rub" ? usd * rates.rub : usd * rates.eur;
  const body = compact(v, lang, 1e4);
  if (cur === "usd") return `$${body}`;
  return lang === "ru" ? `${body} ${SYMBOL[cur]}` : `${SYMBOL[cur]}${body}`;
};

export const toDisplay = (
  usd: number,
  cur: Currency,
  rates: { readonly rub: number; readonly eur: number },
): number => (cur === "usd" ? usd : cur === "rub" ? usd * rates.rub : usd * rates.eur);

export const fromDisplay = (
  v: number,
  cur: Currency,
  rates: { readonly rub: number; readonly eur: number },
): number => (cur === "usd" ? v : cur === "rub" ? v / rates.rub : v / rates.eur);

/** Accepts both `,` and `.` as the decimal separator; ignores spaces. */
export const parseNum = (raw: string): number | null => {
  const clean = raw.replace(/\s/g, "").replace(",", ".");
  if (clean === "" || clean === "-") return null;
  const v = Number(clean);
  return Number.isFinite(v) ? v : null;
};

/** Russian plural: 1 клиент, 2 клиента, 5 клиентов. */
export const plural = (n: number, one: string, few: string, many: string): string => {
  const a = Math.floor(Math.abs(n)) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
};
