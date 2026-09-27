import { useEffect, useState } from "react";
import { VERDICT_ORDER, shownLevel, verdictOf, type Result } from "../lib/calc";
import { compact, currencySymbol, fromDisplay, money, toDisplay, whole } from "../lib/format";
import { levelText, t, verdictText } from "../lib/i18n";
import type { CalcState, Currency, Lang } from "../lib/types";
import { InfoTip, NumberField, Segmented, StatusChip, type Tone } from "./ui";
import { cx } from "../lib/cx";

type Update = (fn: (s: CalcState) => CalcState) => void;

export const VERDICT_TONE = {
  critical: "danger",
  small: "warning",
  workable: "success",
  large: "info",
  mass: "info",
} as const satisfies Record<string, Tone>;

export const ResultSlab = ({
  lang,
  state,
  update,
  result,
  context,
  rateDate,
  onSave,
  onShare,
  onReset,
  onRateEdit,
}: {
  readonly lang: Lang;
  readonly state: CalcState;
  readonly update: Update;
  readonly result: Result;
  readonly context: string;
  readonly rateDate: string | null;
  readonly onSave: () => void;
  readonly onShare: () => void;
  readonly onReset: () => void;
  readonly onRateEdit: () => void;
}) => {
  const [how, setHow] = useState(false);
  const [sr, setSr] = useState("");
  const v = verdictOf(result.avatars);
  const [vName, vLine] = verdictText(lang, v);
  const cur = state.currency;
  const m = (usd: number) => money(usd, cur, state.rates, lang);
  const lvlName = levelText(lang, shownLevel(state)).name.toLocaleLowerCase(lang);

  useEffect(() => {
    const id = window.setTimeout(
      () =>
        setSr(
          t(lang, "result.sr", {
            n: whole(result.avatars, lang),
            verdict: vName,
            rev: m(result.revenue),
          }),
        ),
      600,
    );
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.avatars, result.revenue, vName, lang, cur]);

  return (
    <section className="result" aria-labelledby="result-title">
      <div className="result__head">
        <div>
          <h2 id="result-title" className="label" tabIndex={-1}>
            {t(lang, "result.title")}
          </h2>
          <p className="result__ctx">{context}</p>
        </div>
        <Segmented<Currency>
          label={lang === "ru" ? "Валюта" : "Currency"}
          value={cur}
          options={[
            { value: "rub", label: "₽" },
            { value: "usd", label: "$" },
            { value: "eur", label: "€" },
          ]}
          onChange={(c) => update((s) => ({ ...s, currency: c }))}
        />
      </div>
      {cur !== "usd" && (
        <div className="result__rate">
          <NumberField
            label={t(lang, "result.rate")}
            value={cur === "rub" ? state.rates.rub : state.rates.eur}
            min={0.0001}
            suffix={currencySymbol(cur)}
            error={t(lang, "err.rate")}
            compact
            hint={rateDate ? t(lang, "result.rateLive", { d: rateDate }) : undefined}
            onChange={(x) => {
              if (x <= 0) return;
              onRateEdit();
              update((s) => ({ ...s, rates: { ...s.rates, [cur]: x } }));
            }}
          />
        </div>
      )}

      <div className="result__big">
        <p className="result__num">{whole(result.avatars, lang)}</p>
        <p className="result__unit">{t(lang, "result.avatars")}</p>
        <p className="result__of">
          {t(lang, "result.of", { level: lvlName, n: compact(result.audience, lang) })}
        </p>
      </div>

      <div className="verdict">
        <StatusChip tone={VERDICT_TONE[v]}>{vName}</StatusChip>
        <span className="meter" aria-hidden="true">
          {VERDICT_ORDER.map((x) => (
            <span
              key={x}
              className={cx(
                "meter__cell",
                VERDICT_ORDER.indexOf(x) <= VERDICT_ORDER.indexOf(v) && "meter__cell--on",
                x === v && "meter__cell--cur",
              )}
            />
          ))}
        </span>
        <p className="verdict__line">{vLine}</p>
      </div>

      <dl className="result__rows">
        <div className="rrow rrow--price">
          <dt>
            <Segmented
              label={lang === "ru" ? "Модель оплаты" : "Payment model"}
              value={state.pricing}
              options={[
                { value: "subscription", label: t(lang, "result.pricing.sub") },
                { value: "one-off", label: t(lang, "result.pricing.one") },
              ]}
              onChange={(p) => update((s) => ({ ...s, pricing: p }))}
            />
          </dt>
          <dd>
            <NumberField
              label={t(
                lang,
                state.pricing === "subscription" ? "result.price.sub" : "result.price.one",
              )}
              value={
                cur === "rub"
                  ? Math.round(toDisplay(state.price, cur, state.rates))
                  : Math.round(toDisplay(state.price, cur, state.rates) * 100) / 100
              }
              min={0}
              suffix={currencySymbol(cur)}
              error={t(lang, "err.price")}
              compact
              onChange={(x) => update((s) => ({ ...s, price: fromDisplay(x, cur, s.rates) }))}
            />
          </dd>
        </div>
        <div className="rrow">
          <dt>{t(lang, "result.check")}</dt>
          <dd>{m(result.check)}</dd>
        </div>
        <div className="rrow">
          <dt>
            {t(lang, "result.tam")}
            <InfoTip text={t(lang, "result.tip.tam")} label={t(lang, "result.tam")} />
          </dt>
          <dd>{m(result.tam)}</dd>
        </div>
        <div className="rrow">
          <dt>
            {t(lang, "result.share")}
            <InfoTip text={t(lang, "result.tip.share")} label={t(lang, "result.share")} />
          </dt>
          <dd className="rrow__share">
            <NumberField
              label={t(lang, "result.share")}
              hideLabel
              value={state.share}
              min={0}
              max={100}
              suffix="%"
              error={t(lang, "err.pct")}
              compact
              onChange={(x) => update((s) => ({ ...s, share: x }))}
            />
            <span className="rrow__note">
              {t(lang, "result.clients", { n: compact(result.clients, lang) })}
            </span>
          </dd>
        </div>
      </dl>

      <div className="result__rev">
        <p className="label">{t(lang, "result.revenue")}</p>
        <p className="result__revnum">{m(result.revenue)}</p>
      </div>

      <button
        type="button"
        className="textbtn"
        aria-expanded={how}
        aria-controls="how"
        onClick={() => setHow(!how)}
      >
        {how ? t(lang, "result.howHide") : t(lang, "result.how")}
      </button>
      <ol id="how" className="how" hidden={!how}>
        <li>{t(lang, "result.how.1")}</li>
        <li>{t(lang, "result.how.2")}</li>
        <li>{t(lang, "result.how.3")}</li>
        <li>{t(lang, "result.how.4")}</li>
        <li>{t(lang, "result.how.5")}</li>
      </ol>

      <div className="result__actions">
        <button type="button" className="btn btn--primary" onClick={onSave}>
          {t(lang, "result.save")}
        </button>
        <button type="button" className="btn btn--secondary" onClick={onShare}>
          {t(lang, "result.share.btn")}
        </button>
        <button type="button" className="textbtn" onClick={onReset}>
          {t(lang, "result.reset")}
        </button>
      </div>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {sr}
      </p>
    </section>
  );
};
