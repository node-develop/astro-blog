import { useState } from "react";
import { computeEcon, type EconResult } from "../lib/calc";
import {
  compact,
  currencySymbol,
  fromDisplay,
  money,
  num,
  pctText,
  toDisplay,
  whole,
} from "../lib/format";
import { t } from "../lib/i18n";
import { BENCHMARKS } from "../lib/state";
import type { Benchmark, CalcState, Econ, Lang } from "../lib/types";
import { InfoTip, Segmented, SliderField, StatusChip } from "./ui";

type Update = (fn: (s: CalcState) => CalcState) => void;

const bench = (id: string): Benchmark | undefined =>
  Object.values(BENCHMARKS)
    .flat()
    .find((b) => b.id === id);

const BENCH_IDS = {
  b2c: {
    ru: { cpl: "b2c-cpl-ru-direct", cac: "b2c-app-cac-payer-ru" },
    us: { cpl: "cpl-us-google-all", cac: "b2c-app-cac-payer-us" },
    conv: ["b2c-trial-to-paid", "b2c-install-to-paid-all"],
    churn: ["churn-b2c-apps"],
  },
  b2b: {
    ru: { cpl: "b2b-cpl-ru", cac: "b2b-cac-smb-ru" },
    us: { cpl: "b2b-cpl-us", cac: "b2b-cac-smb-us" },
    conv: ["b2b-lead-to-customer"],
    churn: ["churn-b2b-smb", "churn-b2b-lesson"],
  },
} as const;

export const Economy = ({
  lang,
  state,
  update,
  avatars,
  ruMarket,
}: {
  readonly lang: Lang;
  readonly state: CalcState;
  readonly update: Update;
  readonly avatars: number;
  readonly ruMarket: boolean;
}) => {
  const e = state.econ;
  const cur = state.currency;
  const sym = currencySymbol(cur);
  // Rubles read best as whole numbers; dollars and euros keep cents.
  const disp = (usd: number) => {
    const v = toDisplay(usd, cur, state.rates);
    return cur === "rub" ? Math.round(v) : Math.round(v * 100) / 100;
  };
  const setE = (patch: Partial<Econ>) => update((s) => ({ ...s, econ: { ...s.econ, ...patch } }));
  const setMoney = (k: "cac" | "cpl" | "budget") => (v: number) =>
    update((s) => ({ ...s, econ: { ...s.econ, [k]: fromDisplay(v, cur, s.rates) } }));
  const r = computeEcon(e, state.price, state.pricing, avatars);
  const m = (usd: number) => money(usd, cur, state.rates, lang);
  const sub = state.pricing === "subscription";

  const ids = BENCH_IDS[state.mode];
  const place = ruMarket ? ids.ru : ids.us;
  const hint = (id: string | undefined) => {
    const b = id ? bench(id) : undefined;
    if (!b) return null;
    const unit = b.unit.startsWith("%") ? "%" : ` ${b.unit}`;
    return `${lang === "ru" ? b.label_ru : b.label_en}: ${num(b.low, lang)}-${num(b.high, lang)}${unit}`;
  };
  const toUsd = (b: Benchmark | undefined) =>
    b ? (b.unit === "₽" ? b.default / state.rates.rub : b.default) : undefined;

  const applyBench = () => {
    const cpl = toUsd(bench(place.cpl));
    const cac = toUsd(bench(place.cac));
    const conv = bench(ids.conv[0])?.default;
    const churn = bench(ids.churn[0])?.default;
    setE({
      ...(cpl != null ? { cpl } : {}),
      ...(cac != null ? { cac } : {}),
      ...(conv != null ? { conv } : {}),
      ...(churn != null ? { churn } : {}),
    });
  };

  // Fixed ceilings (from benchmarks) so the track does not move while dragging;
  // a typed value above the ceiling stretches it.
  const ceil = (id: string | undefined, fallbackUsd: number, current: number) => {
    const b = id ? bench(id) : undefined;
    const usd = b ? (b.unit === "₽" ? b.high / state.rates.rub : b.high) * 2 : fallbackUsd;
    return Math.max(Math.ceil(disp(usd)), Math.ceil(disp(current)));
  };
  const ltvTone = r.ltvCac < 1 ? "danger" : r.ltvCac < 3 ? "warning" : "success";
  const ltvWord =
    r.ltvCac < 1 ? "econ.ltvCac.bad" : r.ltvCac < 3 ? "econ.ltvCac.thin" : "econ.ltvCac.good";

  return (
    <div className="econ">
      <div className="econ__inputs">
        <div className="econ__row">
          <Segmented
            label={t(lang, "econ.cacMode")}
            value={e.cacMode}
            options={[
              { value: "cpl", label: t(lang, "econ.cacMode.cpl") },
              { value: "cac", label: t(lang, "econ.cacMode.cac") },
            ]}
            onChange={(v) => setE({ cacMode: v })}
          />
          <button type="button" className="textbtn textbtn--sm" onClick={applyBench}>
            {lang === "ru" ? "Подставить ориентиры рынка" : "Use market benchmarks"}
          </button>
        </div>
        {e.cacMode === "cpl" ? (
          <>
            <SliderField
              label={t(lang, "econ.cpl")}
              value={disp(e.cpl)}
              min={0}
              max={ceil(place.cpl, 300, e.cpl)}
              step={cur === "rub" ? 10 : 0.5}
              suffix={sym}
              hint={hint(place.cpl)}
              onChange={setMoney("cpl")}
            />
            <SliderField
              label={t(lang, "econ.conv")}
              value={e.conv}
              min={0}
              max={60}
              step={0.5}
              suffix="%"
              hint={ids.conv.map(hint).filter(Boolean).join(". ")}
              error={t(lang, "err.pct")}
              onChange={(v) => setE({ conv: Math.min(100, v) })}
            />
            <p className="econ__cac">
              {Number.isFinite(r.cac)
                ? t(lang, "econ.cacIs", { v: m(r.cac) })
                : lang === "ru"
                  ? "CAC не посчитать: цена заявки и конверсия должны быть больше нуля"
                  : "Cannot compute CAC: lead cost and conversion must be above zero"}
            </p>
          </>
        ) : (
          <SliderField
            warning={
              Number.isFinite(r.cac)
                ? null
                : lang === "ru"
                  ? "CAC должен быть больше нуля"
                  : "CAC must be above zero"
            }
            label={t(lang, "econ.cac")}
            value={disp(e.cac)}
            min={0}
            max={ceil(place.cac, 2000, e.cac)}
            step={cur === "rub" ? 100 : 1}
            suffix={sym}
            hint={hint(place.cac)}
            onChange={setMoney("cac")}
          />
        )}
        <SliderField
          label={t(lang, "econ.churn")}
          value={e.churn}
          min={0}
          max={30}
          step={0.5}
          suffix="%"
          disabled={!sub}
          hint={sub ? ids.churn.map(hint).filter(Boolean).join(". ") : t(lang, "econ.churnOff")}
          warning={sub && e.churn === 0 ? t(lang, "econ.warn.churn0") : null}
          onChange={(v) => setE({ churn: Math.min(100, v) })}
        />
        <SliderField
          label={t(lang, "econ.budget")}
          value={disp(e.budget)}
          min={0}
          max={ceil(undefined, 25_000, e.budget)}
          step={cur === "rub" ? 1000 : 50}
          suffix={sym}
          warning={r.newPerMonth > 0 && r.newPerMonth < 1 ? t(lang, "econ.warn.tiny") : null}
          onChange={setMoney("budget")}
        />
      </div>

      <div className="tiles">
        <div className="tile">
          <p className="label">
            {t(lang, "econ.ltv")}
            <InfoTip
              label={t(lang, "econ.ltv")}
              text={
                lang === "ru"
                  ? "Сколько денег приносит клиент за все время: цена в месяц, деленная на отток."
                  : "What a customer brings over their lifetime: monthly price divided by churn."
              }
            />
          </p>
          <p className="tile__val">{m(r.ltv)}</p>
        </div>
        <div className="tile">
          <p className="label">
            {t(lang, "econ.ltvCac")}
            <InfoTip
              label={t(lang, "econ.ltvCac")}
              text={
                lang === "ru"
                  ? "Во сколько раз клиент приносит больше, чем стоит его привлечение. Нормально от 3."
                  : "How many times a customer returns their acquisition cost. 3 or more is healthy."
              }
            />
          </p>
          <p className="tile__val">{num(r.ltvCac, lang)}</p>
          <StatusChip tone={ltvTone}>{t(lang, ltvWord)}</StatusChip>
          {r.ltvCac > 10 && (
            <p className="field__msg field__msg--warn">{t(lang, "econ.warn.tooGood")}</p>
          )}
        </div>
        <div className="tile">
          <p className="label">{t(lang, "econ.payback")}</p>
          <p className="tile__val">
            {Number.isFinite(r.payback)
              ? t(lang, "econ.months", { n: num(r.payback, lang) })
              : t(lang, "econ.never")}
          </p>
        </div>
        <div className="tile">
          <p className="label">{t(lang, "econ.perYear")}</p>
          <p className="tile__val">{compact(r.clientsPerYear, lang)}</p>
          <p className="tile__note">
            {t(lang, "econ.perYearNote", {
              p: avatars > 0 ? pctText((r.clientsPerYear / avatars) * 100, lang) : "0%",
            })}
          </p>
        </div>
      </div>

      <RevenueChart lang={lang} state={state} update={update} r={r} />
    </div>
  );
};

const RevenueChart = ({
  lang,
  state,
  update,
  r,
}: {
  readonly lang: Lang;
  readonly state: CalcState;
  readonly update: Update;
  readonly r: EconResult;
}) => {
  const [table, setTable] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const e = state.econ;
  const m = (usd: number) => money(usd, state.currency, state.rates, lang);
  const W = 640;
  const H = 240;
  const P = { l: 64, r: 88, t: 16, b: 32 };
  const iw = W - P.l - P.r;
  const ih = H - P.t - P.b;
  const cum = e.view === "cum";
  const months = r.months;
  const top = Math.max(
    1,
    ...months.map((x) => (cum ? Math.max(x.cumRevenue, x.cumSpend) : x.revenue)),
  );
  const niceTop = (() => {
    const p = 10 ** Math.floor(Math.log10(top));
    const f = top / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  })();
  const y = (v: number) => P.t + ih - (v / niceTop) * ih;
  const band = iw / Math.max(1, months.length);
  const x = (i: number) => P.l + band * i + band / 2;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => k * niceTop);
  const every = months.length > 12 ? 3 : 1;
  const line = (f: (i: number) => number) =>
    months.map((_, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(f(i)).toFixed(1)}`).join("");
  const be = r.breakEven;
  const last = months[months.length - 1];
  const hov = hover != null ? months[hover] : undefined;
  const caption = last
    ? t(lang, "econ.caption", {
        m: last.m,
        rev: m(cum ? last.cumRevenue : last.revenue),
        c: whole(last.clients, lang),
      }) +
      " " +
      (be ? t(lang, "econ.breakEven", { m: be }) : t(lang, "econ.noBreakEven", { m: e.horizon }))
    : "";

  return (
    <figure className="chart">
      <div className="chart__head">
        <h3 className="h3">{t(lang, "econ.chart")}</h3>
        <div className="chart__ctrls">
          <Segmented
            label={lang === "ru" ? "Период" : "Period"}
            value={e.horizon}
            options={[
              { value: 12, label: t(lang, "econ.h12") },
              { value: 24, label: t(lang, "econ.h24") },
            ]}
            onChange={(v) => update((s) => ({ ...s, econ: { ...s.econ, horizon: v } }))}
          />
          <Segmented
            label={lang === "ru" ? "Вид графика" : "Chart view"}
            value={e.view}
            options={[
              { value: "month", label: t(lang, "econ.monthly") },
              { value: "cum", label: t(lang, "econ.cum") },
            ]}
            onChange={(v) => update((s) => ({ ...s, econ: { ...s.econ, view: v } }))}
          />
        </div>
      </div>
      <div className="chart__plot">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-labelledby="chart-cap"
          preserveAspectRatio="xMidYMid meet"
        >
          {ticks.map((v) => (
            <g key={v}>
              <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} className="chart__grid" />
              <text x={P.l - 8} y={y(v) + 4} textAnchor="end" className="chart__tick">
                {m(v)}
              </text>
            </g>
          ))}
          {!cum &&
            months.map((mo, i) => (
              <rect
                key={mo.m}
                x={x(i) - band * 0.3}
                width={band * 0.6}
                y={y(mo.revenue)}
                height={Math.max(0, P.t + ih - y(mo.revenue))}
                className={`chart__bar${hover === i ? "chart__bar--hover" : ""}`}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <title>
                  {t(lang, "econ.caption", {
                    m: mo.m,
                    rev: m(mo.revenue),
                    c: whole(mo.clients, lang),
                  })}
                </title>
              </rect>
            ))}
          {cum && (
            <>
              <path d={line((i) => months[i]?.cumSpend ?? 0)} className="chart__spend" />
              <path d={line((i) => months[i]?.cumRevenue ?? 0)} className="chart__rev" />
              {last && (
                <>
                  <text
                    x={x(months.length - 1) + 8}
                    y={y(last.cumRevenue) + 4}
                    className="chart__lbl chart__lbl--rev"
                  >
                    {t(lang, "econ.revLabel")}
                  </text>
                  <text
                    x={x(months.length - 1) + 8}
                    y={
                      y(last.cumSpend) +
                      (Math.abs(y(last.cumSpend) - y(last.cumRevenue)) < 14 ? 16 : 4)
                    }
                    className="chart__lbl"
                  >
                    {t(lang, "econ.spendLabel")}
                  </text>
                </>
              )}
              {be && (
                <line x1={x(be - 1)} x2={x(be - 1)} y1={P.t} y2={P.t + ih} className="chart__be" />
              )}
            </>
          )}
          <line x1={P.l} x2={W - P.r} y1={P.t + ih} y2={P.t + ih} className="chart__base" />
          {months.map((mo, i) =>
            i % every === every - 1 || every === 1 ? (
              <text key={mo.m} x={x(i)} y={H - 10} textAnchor="middle" className="chart__tick">
                {mo.m}
              </text>
            ) : null,
          )}
        </svg>
        {hov && !cum && (
          <p className="chart__tip" aria-hidden="true">
            {t(lang, "econ.caption", {
              m: hov.m,
              rev: m(hov.revenue),
              c: whole(hov.clients, lang),
            })}
          </p>
        )}
      </div>
      <div className="chart__foot">
        {cum &&
          (be ? (
            <span className="inkchip">{t(lang, "econ.breakEven", { m: be })}</span>
          ) : (
            <StatusChip tone="warning">{t(lang, "econ.noBreakEven", { m: e.horizon })}</StatusChip>
          ))}
        <span className="note">{t(lang, "econ.month")}</span>
      </div>
      <figcaption id="chart-cap" className="note">
        {caption}
      </figcaption>
      <button
        type="button"
        className="textbtn textbtn--sm"
        aria-expanded={table}
        onClick={() => setTable(!table)}
      >
        {table ? t(lang, "econ.tableHide") : t(lang, "econ.table")}
      </button>
      {table && (
        <div className="tbl-wrap">
          <table className="tbl tbl--compact">
            <thead>
              <tr>
                <th scope="col">{t(lang, "econ.col.m")}</th>
                <th scope="col">{t(lang, "econ.col.clients")}</th>
                <th scope="col">{t(lang, "econ.col.rev")}</th>
                <th scope="col">{t(lang, "econ.col.cumRev")}</th>
                <th scope="col">{t(lang, "econ.col.cumSpend")}</th>
              </tr>
            </thead>
            <tbody>
              {months.map((mo) => (
                <tr key={mo.m}>
                  <td>{mo.m}</td>
                  <td className="num">{whole(mo.clients, lang)}</td>
                  <td className="num">{m(mo.revenue)}</td>
                  <td className="num">{m(mo.cumRevenue)}</td>
                  <td className="num">{m(mo.cumSpend)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </figure>
  );
};
