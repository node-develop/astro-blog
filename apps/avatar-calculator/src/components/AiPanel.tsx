import { pctText } from "../lib/format";
import { t, type StringKey } from "../lib/i18n";
import { GALLUP, countryName } from "../lib/state";
import type { AiLadder, Country, Lang } from "../lib/types";

type Metric = "helpCountry" | "betterLife" | "trust" | "worried" | "positive";
const METRIC_MEDIAN: Readonly<Partial<Record<Metric, number>>> = {
  trust: GALLUP.medians.trust,
  worried: GALLUP.medians.worried,
  positive: GALLUP.medians.positive,
};
const SEGMENTS: readonly { key: keyof AiLadder; label: StringKey }[] = [
  { key: "d", label: "ai.daily" },
  { key: "w", label: "ai.weekly" },
  { key: "m", label: "ai.monthly" },
  { key: "an", label: "ai.awareNever" },
  { key: "na", label: "ai.notAware" },
];
const byUse = (table: Readonly<Record<string, readonly number[]>>, id: string) => table[id];

/** Population-weighted ladder over the market countries the survey covers. */
const weightedLadder = (cs: readonly Country[]): AiLadder | null => {
  const covered = cs.filter((c): c is Country & { ai: AiLadder } => c.ai != null);
  const pop = covered.reduce((s, c) => s + c.pop, 0);
  if (!pop) return null;
  const avg = (k: keyof AiLadder) => covered.reduce((s, c) => s + c.ai[k] * c.pop, 0) / pop;
  return { d: avg("d"), w: avg("w"), m: avg("m"), an: avg("an"), na: avg("na") };
};

export const AiPanel = ({
  lang,
  countries,
}: {
  readonly lang: Lang;
  readonly countries: readonly Country[];
}) => {
  const covered = countries.filter((c) => c.ai != null);
  const ladder = weightedLadder(countries);
  const single = countries.length === 1 && covered.length === 1 ? covered[0] : undefined;
  const med = GALLUP.medians;
  const pickMetric = (m: Metric): number | undefined =>
    single ? (GALLUP[m] as Readonly<Record<string, number>>)[single.id] : undefined;
  const trustRow = single ? byUse(GALLUP.trustByUse, single.id) : undefined;
  const worryRow = single ? byUse(GALLUP.worryByUse, single.id) : undefined;

  const tile = (label: StringKey, value: number | undefined, median: number | undefined) => (
    <div className="aitile" key={label}>
      <p className="label">{t(lang, label)}</p>
      <p className="aitile__val">{value != null ? pctText(value, lang) : "?"}</p>
      <p className="aitile__note">
        {value == null && <span>{t(lang, "ai.noData")}. </span>}
        {median != null && t(lang, "ai.median", { v: pctText(median, lang) })}
      </p>
    </div>
  );

  return (
    <section className="aipanel" aria-labelledby="ai-title">
      <div className="section-head">
        <h2 id="ai-title" className="h2">
          {t(lang, "ai.title")}
        </h2>
        <p className="section-sub">
          {t(lang, "ai.sub")}{" "}
          {single
            ? countryName(single, lang)
            : covered.length > 0
              ? t(lang, "ai.coverage", { a: covered.length, b: countries.length })
              : t(lang, "ai.none")}
        </p>
      </div>

      {ladder && (
        <figure className="ladder">
          <figcaption className="label">{t(lang, "ai.ladder")}</figcaption>
          <div
            className="ladder__bar"
            role="img"
            aria-label={SEGMENTS.map(
              (s) => `${t(lang, s.label)} ${pctText(ladder[s.key], lang)}`,
            ).join(", ")}
          >
            {SEGMENTS.map((s) => (
              <span
                key={s.key}
                className={`ladder__seg ladder__seg--${s.key}`}
                style={{ width: `${ladder[s.key]}%` }}
              />
            ))}
          </div>
          <ul className="ladder__legend">
            {SEGMENTS.map((s) => (
              <li key={s.key}>
                <span className={`ladder__sw ladder__seg--${s.key}`} aria-hidden="true" />
                {t(lang, s.label)} <b>{pctText(ladder[s.key], lang)}</b>
              </li>
            ))}
          </ul>
        </figure>
      )}

      <div className="aitiles">
        {tile("ai.metric.aware", ladder ? 100 - ladder.na : undefined, med.aware)}
        {tile("ai.metric.ever", ladder ? ladder.d + ladder.w + ladder.m : undefined, med.ever)}
        {tile("ai.metric.weekly", ladder ? ladder.d + ladder.w : undefined, med.computed.weekly)}
        {tile("ai.metric.helpCountry", pickMetric("helpCountry"), undefined)}
        {tile("ai.metric.betterLife", pickMetric("betterLife"), undefined)}
        {tile("ai.metric.trust", pickMetric("trust"), METRIC_MEDIAN.trust)}
        {tile("ai.metric.worried", pickMetric("worried"), METRIC_MEDIAN.worried)}
        {tile("ai.metric.positive", pickMetric("positive"), METRIC_MEDIAN.positive)}
      </div>

      {single && GALLUP.negativeOutweighs.includes(single.id) && (
        <p className="aipanel__flag">{t(lang, "ai.negOver")}</p>
      )}

      {(trustRow || worryRow) && (
        <div className="aipanel__byuse">
          <h3 id="ai-byuse" className="label">
            {t(lang, "ai.byUse")}
          </h3>
          <div className="tbl-wrap">
            <table className="tbl tbl--compact" aria-labelledby="ai-byuse">
              <thead>
                <tr>
                  <th scope="col" />
                  <th scope="col">{t(lang, "ai.col.daily")}</th>
                  <th scope="col">{t(lang, "ai.col.weekly")}</th>
                  <th scope="col">{t(lang, "ai.col.less")}</th>
                  <th scope="col">{t(lang, "ai.col.never")}</th>
                </tr>
              </thead>
              <tbody>
                {trustRow && (
                  <tr>
                    <th scope="row">{t(lang, "ai.trust")}</th>
                    {trustRow.map((v, i) => (
                      <td key={i} className="num">
                        {pctText(v, lang)}
                      </td>
                    ))}
                  </tr>
                )}
                {worryRow && (
                  <tr>
                    <th scope="row">{t(lang, "ai.worry")}</th>
                    {worryRow.map((v, i) => (
                      <td key={i} className="num">
                        {pctText(v, lang)}
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="note">
        {t(lang, "ai.note")} {lang === "ru" ? "Источник" : "Source"}:{" "}
        <a href={GALLUP.source.url} target="_blank" rel="noopener noreferrer">
          {t(lang, "ai.source")}
        </a>
      </p>
    </section>
  );
};
