import { breadthPct, buyRate, inetRate, langRate, shownLevel } from "../lib/calc";
import { compact, pctText } from "../lib/format";
import { levelText, t, type StringKey } from "../lib/i18n";
import type { CalcState, Country, FunnelStep, Lang } from "../lib/types";
import { Chip, InfoTip, NumberField, Segmented, StatusChip } from "./ui";
import { cx } from "../lib/cx";

type Update = (fn: (s: CalcState) => CalcState) => void;

const weighted = (
  cs: readonly Country[],
  w: (c: Country) => number,
  v: (c: Country) => number,
): number => {
  const total = cs.reduce((s, c) => s + w(c), 0);
  return total > 0 ? cs.reduce((s, c) => s + w(c) * v(c), 0) / total : 0;
};

const yearSpan = (ys: readonly (number | null)[]): string => {
  const v = ys.filter((y): y is number => y != null);
  if (!v.length) return "";
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  return lo === hi ? String(lo) : `${lo}-${hi}`;
};

const LABEL: Readonly<Record<FunnelStep["key"], StringKey>> = {
  pop: "funnel.pop",
  online: "funnel.online",
  age: "funnel.age",
  buy: "funnel.buy",
  soft: "funnel.soft",
  lang: "funnel.lang",
  firms: "funnel.firms",
  b2bOnline: "funnel.b2bOnline",
  avatars: "funnel.avatars",
};
const TIP: Partial<Record<FunnelStep["key"], StringKey>> = {
  pop: "tip.pop",
  online: "tip.online",
  age: "tip.age",
  buy: "tip.buy",
  soft: "tip.soft",
  lang: "tip.lang",
  firms: "tip.firms",
  b2bOnline: "tip.b2bOnline",
};

export const Funnel = ({
  lang,
  state,
  update,
  countries,
  funnel,
  onFocusBreadth,
}: {
  readonly lang: Lang;
  readonly state: CalcState;
  readonly update: Update;
  readonly countries: readonly Country[];
  readonly funnel: readonly FunnelStep[];
  readonly onFocusBreadth: () => void;
}) => {
  const max = funnel[0]?.value ?? 0;
  const single = countries.length === 1;
  const o = state.overrides;
  const setOverride = (k: keyof CalcState["overrides"], v: number | null) =>
    update((s) => ({ ...s, overrides: { ...s.overrides, [k]: v } }));
  const lvlName = levelText(lang, shownLevel(state)).name.toLocaleLowerCase(lang);

  const inetAvg = weighted(
    countries,
    (c) => c.pop,
    (c) => inetRate(c, { overrides: { ...o, inet: null } }),
  );
  const buyAvg = weighted(
    countries,
    (c) => c.pop,
    (c) => buyRate(c, { buyBasis: state.buyBasis, overrides: { ...o, buy: null } }),
  );
  const rusAvg = weighted(
    countries,
    (c) => c.pop,
    (c) => langRate(c, { lang: "ru", overrides: { ...o, rus: null } }),
  );
  const anyEst = (f: (c: Country) => boolean) => countries.some(f);

  const edited = (k: keyof CalcState["overrides"]) =>
    o[k] != null ? (
      <>
        <StatusChip tone="info">{t(lang, "funnel.edited")}</StatusChip>
        <button type="button" className="textbtn textbtn--sm" onClick={() => setOverride(k, null)}>
          {t(lang, "funnel.restore")}
        </button>
      </>
    ) : null;

  const control = (key: FunnelStep["key"]) => {
    switch (key) {
      case "pop":
        return {
          meta: (
            <span>{t(lang, "funnel.src.wb", { y: yearSpan(countries.map((c) => c.popY)) })}</span>
          ),
        };
      case "online":
        return {
          ctrl: (
            <NumberField
              label={t(lang, "funnel.online")}
              hideLabel
              compact
              value={o.inet ?? inetAvg}
              min={0}
              max={100}
              suffix="%"
              error={t(lang, "err.pct")}
              onChange={(v) => setOverride("inet", v)}
            />
          ),
          meta: (
            <>
              <span>
                {t(lang, "funnel.src.wb", { y: yearSpan(countries.map((c) => c.inetY)) })}
              </span>
              {!single && o.inet == null && <span>{t(lang, "funnel.mixed")}</span>}
              {edited("inet")}
            </>
          ),
        };
      case "age": {
        const a = state.ages;
        const count = Number(a.kids) + Number(a.adults) + Number(a.seniors);
        const toggle = (k: keyof CalcState["ages"]) => {
          if (a[k] && count === 1) return;
          update((s) => ({ ...s, ages: { ...s.ages, [k]: !s.ages[k] } }));
        };
        return {
          ctrl: (
            <div className="chips" role="group" aria-label={t(lang, "funnel.age")}>
              <Chip pressed={a.kids} onClick={() => toggle("kids")}>
                0-14
              </Chip>
              <Chip pressed={a.adults} onClick={() => toggle("adults")}>
                15-64
              </Chip>
              <Chip pressed={a.seniors} onClick={() => toggle("seniors")}>
                65+
              </Chip>
            </div>
          ),
          meta: (
            <>
              <span>{t(lang, "funnel.src.wb", { y: yearSpan(countries.map((c) => c.ageY)) })}</span>
              {count === 1 && <span>{t(lang, "funnel.ageKeep")}</span>}
            </>
          ),
        };
      }
      case "buy":
        return {
          ctrl: (
            <div className="ctrl-row">
              <Segmented
                label={t(lang, "funnel.buy")}
                value={state.buyBasis}
                options={[
                  { value: "buy", label: t(lang, "funnel.buyBasis.buy") },
                  { value: "pay", label: t(lang, "funnel.buyBasis.pay") },
                ]}
                onChange={(v) => update((s) => ({ ...s, buyBasis: v }))}
              />
              <NumberField
                label={t(lang, "funnel.buy")}
                hideLabel
                compact
                value={o.buy ?? buyAvg}
                min={0}
                max={100}
                suffix="%"
                error={t(lang, "err.pct")}
                onChange={(v) => setOverride("buy", v)}
              />
            </div>
          ),
          meta: (
            <>
              <span>
                {t(lang, "funnel.src.findex", {
                  y: yearSpan(
                    countries.map((c) => (state.buyBasis === "pay" ? (c.payY ?? c.buyY) : c.buyY)),
                  ),
                })}
              </span>
              {o.buy == null &&
                anyEst((c) => c.buyS === "est" || (state.buyBasis === "pay" && c.payE)) && (
                  <StatusChip tone="warning">{t(lang, "funnel.est")}</StatusChip>
                )}
              {o.buy == null && anyEst((c) => c.buyS === "region") && (
                <StatusChip tone="warning">{t(lang, "funnel.region")}</StatusChip>
              )}
              {edited("buy")}
            </>
          ),
        };
      case "soft":
        return {
          ctrl: (
            <NumberField
              label={t(lang, "funnel.soft")}
              hideLabel
              compact
              value={state.soft}
              min={0}
              max={100}
              suffix="%"
              error={t(lang, "err.pct")}
              onChange={(v) => update((s) => ({ ...s, soft: v }))}
            />
          ),
          meta: <StatusChip tone="warning">{t(lang, "funnel.src.lesson")}</StatusChip>,
        };
      case "lang":
        return {
          ctrl: (
            <div className="ctrl-row">
              <Segmented
                label={t(lang, "funnel.lang")}
                value={state.lang}
                options={[
                  { value: "ru", label: t(lang, "funnel.lang.ru") },
                  { value: "local", label: t(lang, "funnel.lang.local") },
                ]}
                onChange={(v) => update((s) => ({ ...s, lang: v }))}
              />
              {state.lang === "ru" && (
                <NumberField
                  label={t(lang, "funnel.lang.ru")}
                  hideLabel
                  compact
                  value={o.rus ?? rusAvg}
                  min={0}
                  max={100}
                  suffix="%"
                  error={t(lang, "err.pct")}
                  onChange={(v) => setOverride("rus", v)}
                />
              )}
            </div>
          ),
          meta:
            state.lang === "ru" ? (
              <>
                {o.rus == null && anyEst((c) => c.rusE) && (
                  <StatusChip tone="warning">{t(lang, "funnel.est")}</StatusChip>
                )}
                {edited("rus")}
              </>
            ) : null,
        };
      case "firms":
        return {
          ctrl: (
            <Segmented
              label={t(lang, "funnel.firms")}
              value={state.b2bBase}
              options={[
                { value: "all", label: t(lang, "funnel.firms.all") },
                { value: "employer", label: t(lang, "funnel.firms.employer") },
              ]}
              onChange={(v) => update((s) => ({ ...s, b2bBase: v }))}
            />
          ),
          meta: (
            <>
              <span>{yearSpan(countries.map((c) => c.firmsY))}</span>
              {anyEst((c) => c.firmsE) && (
                <StatusChip tone="warning">{t(lang, "funnel.est")}</StatusChip>
              )}
            </>
          ),
        };
      case "b2bOnline":
        return {
          ctrl: (
            <NumberField
              label={t(lang, "funnel.b2bOnline")}
              hideLabel
              compact
              value={state.b2bOnline}
              min={0}
              max={100}
              suffix="%"
              error={t(lang, "err.pct")}
              onChange={(v) => update((s) => ({ ...s, b2bOnline: v }))}
            />
          ),
          meta: <StatusChip tone="warning">{t(lang, "funnel.est")}</StatusChip>,
        };
      case "avatars":
        return {
          ctrl: (
            <button type="button" className="textbtn textbtn--sm" onClick={onFocusBreadth}>
              {t(lang, "funnel.changeBreadth")}
            </button>
          ),
          meta: <span>{pctText(breadthPct(state), lang)}</span>,
        };
    }
  };

  return (
    <div className="funnel">
      <ol className="funnel__list">
        {funnel.map((step, i) => {
          const prev = funnel[i - 1];
          const conv = prev && prev.value > 0 ? (step.value / prev.value) * 100 : null;
          const c = control(step.key);
          const last = step.key === "avatars";
          const tip = TIP[step.key];
          return (
            <li key={step.key} className={cx("frow", last && "frow--last")}>
              {conv != null && (
                <div className="frow__conv">
                  <span className="pill">{pctText(conv, lang)}</span>
                  <span className="frow__loss">
                    {t(lang, "funnel.minus", { n: compact((prev?.value ?? 0) - step.value, lang) })}
                  </span>
                </div>
              )}
              <div className="frow__main">
                <div className="frow__label">
                  <span className="frow__name">
                    {t(lang, LABEL[step.key], { level: lvlName })}
                    {tip && (
                      <InfoTip
                        text={t(lang, tip)}
                        label={t(lang, LABEL[step.key], { level: lvlName })}
                      />
                    )}
                  </span>
                  {c.ctrl && <div className="frow__ctrl">{c.ctrl}</div>}
                  {c.meta && <div className="frow__meta">{c.meta}</div>}
                </div>
                <div className="frow__bar" aria-hidden="true">
                  <i
                    style={{ width: `${max > 0 ? Math.max((step.value / max) * 100, 0.4) : 0}%` }}
                  />
                </div>
                <div className="frow__val">{compact(step.value, lang)}</div>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="note">{t(lang, "funnel.scale")}</p>
    </div>
  );
};
