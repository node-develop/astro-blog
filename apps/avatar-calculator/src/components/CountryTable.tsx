import { useMemo, useState } from "react";
import { computeResult, marketPpp } from "../lib/calc";
import { compact, money, pctText } from "../lib/format";
import { regionName, t, type StringKey } from "../lib/i18n";
import { COUNTRIES, countryName } from "../lib/state";
import type { CalcState, Country, Lang, RegionId } from "../lib/types";
import { Chip } from "./ui";

type SortKey = "name" | "pop" | "inet" | "buy" | "rus" | "firms" | "avatars" | "tam";
const REGIONS: readonly RegionId[] = [
  "cis",
  "europe",
  "namerica",
  "latam",
  "asia",
  "mena",
  "africa",
];

export const CountryTable = ({
  lang,
  state,
  selected,
  onSelect,
}: {
  readonly lang: Lang;
  readonly state: CalcState;
  readonly selected: readonly Country[];
  readonly onSelect: (id: string) => void;
}) => {
  const [q, setQ] = useState("");
  const [reg, setReg] = useState<RegionId | null>(null);
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: "avatars", dir: -1 });
  const [limit, setLimit] = useState(20);
  const [ppp, setPpp] = useState(true);

  const basePpp = marketPpp(selected);
  const rows = useMemo(
    () =>
      COUNTRIES.map((c) => {
        const factor =
          ppp && basePpp > 0 && c.ppp ? Math.min(3, Math.max(0.2, c.ppp / basePpp)) : 1;
        // Overrides typed for the selected market must not leak into other countries.
        const r = computeResult([c], {
          ...state,
          price: state.price * factor,
          overrides: { inet: null, buy: null, rus: null },
        });
        return { c, avatars: r.avatars, tam: r.tam };
      }),
    [state, ppp, basePpp],
  );
  const filtered = rows
    .filter(({ c }) => !reg || c.reg === reg)
    .filter(({ c }) => {
      const nq = q.trim().toLocaleLowerCase();
      return !nq || c.ru.toLocaleLowerCase().includes(nq) || c.en.toLocaleLowerCase().includes(nq);
    });
  const val = (x: (typeof rows)[number], k: SortKey): number | string =>
    k === "name"
      ? countryName(x.c, lang)
      : k === "avatars"
        ? x.avatars
        : k === "tam"
          ? x.tam
          : k === "firms"
            ? x.c.firms
            : k === "buy"
              ? (x.c.buy ?? -1)
              : x.c[k];
  const sorted = filtered.toSorted((a, b) => {
    const va = val(a, sort.k);
    const vb = val(b, sort.k);
    return (
      (typeof va === "string" ? va.localeCompare(String(vb), lang) : va - Number(vb)) * sort.dir
    );
  });
  const maxAv = Math.max(1, ...filtered.map((x) => x.avatars));
  const sel = new Set(selected.map((c) => c.id));

  const cols: readonly { k: SortKey; label: StringKey; cls?: string }[] = [
    { k: "name", label: "countries.col.name" },
    { k: "pop", label: "countries.col.pop", cls: "opt" },
    { k: "inet", label: "countries.col.inet", cls: "opt" },
    { k: "buy", label: "countries.col.buy", cls: "opt" },
    ...(state.lang === "ru"
      ? [{ k: "rus" as const, label: "countries.col.rus" as const, cls: "opt" }]
      : []),
    ...(state.mode === "b2b"
      ? [{ k: "firms" as const, label: "countries.col.firms" as const, cls: "opt" }]
      : []),
    { k: "avatars", label: "countries.col.avatars" },
    { k: "tam", label: "countries.col.tam" },
  ];

  return (
    <section className="countries" aria-labelledby="countries-title">
      <div className="section-head">
        <h2 id="countries-title" className="h2">
          {t(lang, "countries.title")}
        </h2>
        <p className="section-sub">{t(lang, "countries.sub")}</p>
      </div>
      <div className="toolbar">
        <label className="sr-only" htmlFor="country-search">
          {t(lang, "countries.search")}
        </label>
        <input
          id="country-search"
          className="search"
          type="search"
          placeholder={t(lang, "countries.search")}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setLimit(20);
          }}
        />
        <div className="chips" role="group" aria-label={t(lang, "countries.all")}>
          <Chip pressed={reg === null} onClick={() => setReg(null)}>
            {t(lang, "countries.all")}
          </Chip>
          {REGIONS.map((r) => (
            <Chip key={r} pressed={reg === r} onClick={() => setReg(reg === r ? null : r)}>
              {regionName(lang, r, true)}
            </Chip>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={ppp} onChange={(e) => setPpp(e.target.checked)} />
          <span>{t(lang, "countries.ppp")}</span>
        </label>
        <p className="note">
          {t(lang, "countries.shown", { a: Math.min(limit, sorted.length), b: sorted.length })}
        </p>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              {cols.map((c) => (
                <th
                  key={c.k}
                  scope="col"
                  className={c.cls}
                  aria-sort={
                    sort.k === c.k ? (sort.dir === 1 ? "ascending" : "descending") : undefined
                  }
                >
                  <button
                    type="button"
                    className="sortbtn"
                    onClick={() =>
                      setSort(
                        sort.k === c.k
                          ? { k: c.k, dir: sort.dir === 1 ? -1 : 1 }
                          : { k: c.k, dir: c.k === "name" ? 1 : -1 },
                      )
                    }
                  >
                    {t(lang, c.label)}
                    {sort.k === c.k && (
                      <svg viewBox="0 0 10 10" width="9" height="9" aria-hidden="true">
                        <path
                          d={sort.dir === 1 ? "M5 2l4 6H1z" : "M5 8L1 2h8z"}
                          fill="currentColor"
                        />
                      </svg>
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={cols.length} className="tbl__empty">
                  {t(lang, "countries.empty")}
                </td>
              </tr>
            )}
            {sorted.slice(0, limit).map((x) => {
              const on = sel.has(x.c.id);
              return (
                <tr key={x.c.id} className={on ? "tbl__row--on" : undefined}>
                  <td>
                    <button
                      type="button"
                      className="rowbtn"
                      aria-current={on || undefined}
                      aria-label={t(lang, "countries.select", { c: countryName(x.c, lang) })}
                      onClick={() => onSelect(x.c.id)}
                    >
                      {countryName(x.c, lang)}
                    </button>
                  </td>
                  <td className="num opt">{compact(x.c.pop, lang)}</td>
                  <td className="num opt">{pctText(x.c.inet, lang)}</td>
                  <td className={`num opt${x.c.buyS !== "findex" ? "num--est" : ""}`}>
                    {x.c.buy != null ? pctText(x.c.buy, lang) : "0"}
                  </td>
                  {state.lang === "ru" && (
                    <td className={`num opt${x.c.rusE ? "num--est" : ""}`}>
                      {pctText(x.c.rus, lang)}
                    </td>
                  )}
                  {state.mode === "b2b" && (
                    <td className={`num opt${x.c.firmsE ? "num--est" : ""}`}>
                      {compact(x.c.firms, lang)}
                    </td>
                  )}
                  <td className="num">
                    <span className="cellbar">
                      <span className="cellbar__track" aria-hidden="true">
                        <i style={{ width: `${(x.avatars / maxAv) * 100}%` }} />
                      </span>
                      {compact(x.avatars, lang)}
                    </span>
                  </td>
                  <td className="num">{money(x.tam, state.currency, state.rates, lang)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {sorted.length > limit && (
        <button type="button" className="btn btn--secondary" onClick={() => setLimit(limit + 20)}>
          {t(lang, "countries.more")}
        </button>
      )}
      <p className="note">
        {lang === "ru"
          ? "Серые цифры: оценка или среднее по региону."
          : "Grey figures are estimates or regional averages."}
      </p>
    </section>
  );
};
