import { breadthPct, computeEcon, computeResult, shownLevel } from "../lib/calc";
import { compact, money, num, pctText } from "../lib/format";
import { levelText, regionName, t } from "../lib/i18n";
import { COUNTRY_BY_ID, NICHES, countryName, nicheName } from "../lib/state";
import type { CalcState, Country, Lang } from "../lib/types";

export interface Scenario {
  readonly id: string;
  readonly state: CalcState;
}

const marketLabel = (s: CalcState, lang: Lang): string => {
  if (s.preset) return regionName(lang, s.preset, true);
  const names = s.market
    .map((id) => COUNTRY_BY_ID.get(id))
    .filter((c): c is Country => !!c)
    .map((c) => countryName(c, lang));
  return names.length > 2
    ? `${names.slice(0, 2).join(", ")} +${names.length - 2}`
    : names.join(", ");
};

const summarize = (s: CalcState, lang: Lang) => {
  const cs = s.market.map((id) => COUNTRY_BY_ID.get(id)).filter((c): c is Country => !!c);
  const r = computeResult(cs, s);
  const e = computeEcon(s.econ, s.price, s.pricing, r.avatars);
  const niche = NICHES.find((n) => n.id === s.niche);
  return {
    market: marketLabel(s, lang),
    mode: s.mode.toUpperCase(),
    breadth: `${levelText(lang, shownLevel(s)).name}, ${pctText(breadthPct(s), lang)}`,
    niche: niche ? nicheName(niche, lang) : t(lang, "scen.none"),
    avatars: r.avatars,
    check: r.check,
    tam: r.tam,
    revenue: r.revenue,
    ltvCac: e.ltvCac,
  };
};

export const Scenarios = ({
  lang,
  scenarios,
  current,
  onOpen,
  onDelete,
  onSave,
}: {
  readonly lang: Lang;
  readonly scenarios: readonly Scenario[];
  readonly current: CalcState;
  readonly onOpen: (s: Scenario) => void;
  readonly onDelete: (id: string) => void;
  readonly onSave: () => void;
}) => {
  const rows = scenarios.map((sc) => ({ sc, sum: summarize(sc.state, lang) }));
  const a = rows[0]?.sum;
  const same = (s: CalcState) => JSON.stringify(s) === JSON.stringify(current);
  const moneyOf = (s: CalcState, usd: number) => money(usd, current.currency, current.rates, lang);
  const delta = (v: number, base: number | undefined) => {
    if (base == null || base === 0 || v === base) return null;
    const d = ((v - base) / base) * 100;
    return t(lang, "scen.delta", {
      sign: t(lang, d > 0 ? "scen.plus" : "scen.minus"),
      p: pctText(Math.abs(d), lang),
    });
  };
  const ROWS: readonly {
    key: keyof ReturnType<typeof summarize>;
    label: Parameters<typeof t>[1];
    kind: "text" | "num" | "money" | "x";
  }[] = [
    { key: "market", label: "scen.row.market", kind: "text" },
    { key: "mode", label: "scen.row.mode", kind: "text" },
    { key: "breadth", label: "scen.row.breadth", kind: "text" },
    { key: "niche", label: "scen.row.niche", kind: "text" },
    { key: "avatars", label: "scen.row.avatars", kind: "num" },
    { key: "check", label: "scen.row.check", kind: "money" },
    { key: "tam", label: "scen.row.tam", kind: "money" },
    { key: "revenue", label: "scen.row.revenue", kind: "money" },
    { key: "ltvCac", label: "scen.row.ltvCac", kind: "x" },
  ];

  return (
    <section className="scen" aria-labelledby="scen-title">
      <div className="section-head">
        <h2 id="scen-title" className="h2">
          {t(lang, "scen.title")}
        </h2>
        <p className="section-sub">{t(lang, "scen.sub")}</p>
      </div>
      {rows.length === 0 ? (
        <div className="empty">
          <p>{t(lang, "scen.empty")}</p>
          <button type="button" className="btn btn--secondary" onClick={onSave}>
            {t(lang, "result.save")}
          </button>
        </div>
      ) : (
        <div className="scen__wrap">
          <table className="scen__tbl">
            <thead>
              <tr>
                <td />
                {rows.map(({ sc }, i) => (
                  <th
                    key={sc.id}
                    scope="col"
                    className={same(sc.state) ? "scen__col--now" : undefined}
                  >
                    <span className="scen__letter">{"ABC"[i]}</span>
                    {same(sc.state) && <span className="scen__now">{t(lang, "scen.current")}</span>}
                    <span className="scen__acts">
                      <button
                        type="button"
                        className="textbtn textbtn--sm"
                        onClick={() => onOpen(sc)}
                      >
                        {t(lang, "scen.open")}
                      </button>
                      <button
                        type="button"
                        className="textbtn textbtn--sm"
                        onClick={() => onDelete(sc.id)}
                      >
                        {t(lang, "scen.delete")}
                      </button>
                    </span>
                  </th>
                ))}
                {rows.length < 3 && (
                  <td className="scen__add" rowSpan={ROWS.length + 1}>
                    <button type="button" className="textbtn" onClick={onSave}>
                      {lang === "ru" ? "Сохранить текущий расчет" : "Save the current setup"}
                    </button>
                  </td>
                )}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.key}>
                  <th scope="row" className="label">
                    {t(lang, row.label)}
                  </th>
                  {rows.map(({ sc, sum }, i) => {
                    const v = sum[row.key];
                    const text =
                      row.kind === "text"
                        ? String(v)
                        : row.kind === "num"
                          ? compact(Number(v), lang)
                          : row.kind === "money"
                            ? moneyOf(sc.state, Number(v))
                            : num(Number(v), lang);
                    const d =
                      i > 0 && row.kind !== "text" && a
                        ? delta(Number(v), Number(a[row.key]))
                        : null;
                    return (
                      <td key={sc.id} className={same(sc.state) ? "scen__col--now" : undefined}>
                        <span className="scen__val">{text}</span>
                        {d && <span className="scen__delta">{d}</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length >= 3 && <p className="note">{t(lang, "scen.full")}</p>}
        </div>
      )}
    </section>
  );
};
