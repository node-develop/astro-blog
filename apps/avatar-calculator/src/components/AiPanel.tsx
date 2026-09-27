import { pctText } from "../lib/format";
import { t, type StringKey } from "../lib/i18n";
import { GALLUP, MS_AI, countryName } from "../lib/state";
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

const byUse = (table: object, id: string): readonly number[] | undefined =>
  (table as Readonly<Record<string, readonly number[]>>)[id];

type WithLadder = Country & { ai: AiLadder };
type WithMs = Country & { aiMs: number };

const weightedBy = <T extends Country>(cs: readonly T[], f: (c: T) => number): number => {
  const pop = cs.reduce((s, c) => s + c.pop, 0);
  return pop ? cs.reduce((s, c) => s + f(c) * c.pop, 0) / pop : 0;
};

/** Population-weighted ladder over the market countries Gallup covers. */
const weightedLadder = (cs: readonly WithLadder[]): AiLadder => ({
  d: weightedBy(cs, (c) => c.ai.d),
  w: weightedBy(cs, (c) => c.ai.w),
  m: weightedBy(cs, (c) => c.ai.m),
  an: weightedBy(cs, (c) => c.ai.an),
  na: weightedBy(cs, (c) => c.ai.na),
});

/**
 * AI on the selected market. Shows only what the sources publish for these
 * countries: Gallup's survey (37 countries) and Microsoft's usage share
 * (146 countries). Renders nothing when neither covers the market.
 */
export const AiPanel = ({
  lang,
  countries,
}: {
  readonly lang: Lang;
  readonly countries: readonly Country[];
}) => {
  const gallup = countries.filter((c): c is WithLadder => c.ai != null);
  const ms = countries.filter((c): c is WithMs => c.aiMs != null);
  if (gallup.length === 0 && ms.length === 0) return null;

  const ladder = gallup.length > 0 ? weightedLadder(gallup) : null;
  const single = countries.length === 1 ? gallup[0] : undefined;
  const med = GALLUP.medians;
  const metric = (m: Metric): number | undefined =>
    single ? (GALLUP[m] as Readonly<Record<string, number>>)[single.id] : undefined;
  const trustRow = single ? byUse(GALLUP.trustByUse, single.id) : undefined;
  const worryRow = single ? byUse(GALLUP.worryByUse, single.id) : undefined;

  const msNow = weightedBy(ms, (c) => c.aiMs);
  const msPrevCs = ms.filter((c) => c.aiMsPrev != null);
  const msPrev = msPrevCs.length === ms.length ? weightedBy(ms, (c) => c.aiMsPrev ?? 0) : null;
  const hasCis = ms.some((c) => c.reg === "cis");

  const tiles: readonly { label: StringKey; value: number | undefined; median?: number | undefined }[] = [
    { label: "ai.metric.aware", value: ladder ? 100 - ladder.na : undefined, median: med.aware },
    { label: "ai.metric.ever", value: ladder ? ladder.d + ladder.w + ladder.m : undefined, median: med.ever },
    { label: "ai.metric.weekly", value: ladder ? ladder.d + ladder.w : undefined, median: med.computed.weekly },
    { label: "ai.metric.helpCountry", value: metric("helpCountry") },
    { label: "ai.metric.betterLife", value: metric("betterLife") },
    { label: "ai.metric.trust", value: metric("trust"), median: METRIC_MEDIAN.trust },
    { label: "ai.metric.worried", value: metric("worried"), median: METRIC_MEDIAN.worried },
    { label: "ai.metric.positive", value: metric("positive"), median: METRIC_MEDIAN.positive },
  ];
  const shown = tiles.filter((x): x is typeof x & { value: number } => x.value != null);

  const scope =
    countries.length === 1 && countries[0]
      ? countryName(countries[0], lang)
      : gallup.length > 0 && gallup.length < countries.length
        ? t(lang, "ai.coverage", { a: gallup.length, b: countries.length })
        : "";

  return (
    <section className="aipanel" aria-labelledby="ai-title">
      <div className="section-head">
        <h2 id="ai-title" className="h2">
          {t(lang, "ai.title")}
        </h2>
        <p className="section-sub">
          {t(lang, ladder ? "ai.sub" : "ai.subUse")} {scope}
        </p>
      </div>

      {ladder && (
        <figure className="ladder">
          <figcaption className="label">{t(lang, "ai.ladder")}</figcaption>
          <div
            className="ladder__bar"
            role="img"
            aria-label={SEGMENTS.map((s) => `${t(lang, s.label)} ${pctText(ladder[s.key], lang)}`).join(", ")}
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

      {(shown.length > 0 || ms.length > 0) && (
        <div className="aitiles">
          {shown.map((x) => (
            <div className="aitile" key={x.label}>
              <p className="label">{t(lang, x.label)}</p>
              <p className="aitile__val">{pctText(x.value, lang)}</p>
              {x.median != null && (
                <p className="aitile__note">{t(lang, "ai.median", { v: pctText(x.median, lang) })}</p>
              )}
            </div>
          ))}
          {ms.length > 0 && (
            <div className="aitile aitile--ms">
              <p className="label">{t(lang, "ai.metric.ms")}</p>
              <p className="aitile__val">{pctText(msNow, lang)}</p>
              <p className="aitile__note">
                {msPrev != null &&
                  t(lang, "ai.msGrowth", { v: pctText(msPrev, lang) })}
                {ms.length < countries.length &&
                  ` ${t(lang, "ai.msCoverage", { a: ms.length, b: countries.length })}`}
              </p>
            </div>
          )}
        </div>
      )}

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
                {(
                  [
                    ["ai.trust", trustRow],
                    ["ai.worry", worryRow],
                  ] as const
                ).map(
                  ([label, row]) =>
                    row && (
                      <tr key={label}>
                        <th scope="row">{t(lang, label)}</th>
                        {row.map((v, i) => (
                          <td key={i} className="num">
                            {pctText(v, lang)}
                          </td>
                        ))}
                      </tr>
                    ),
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="note aipanel__sources">
        {ladder && (
          <p>
            {t(lang, "ai.note")} {lang === "ru" ? "Источник" : "Source"}:{" "}
            <a href={GALLUP.source.url} target="_blank" rel="noopener noreferrer">
              {t(lang, "ai.source")}
            </a>
          </p>
        )}
        {ms.length > 0 && (
          <p>
            {t(lang, "ai.msNote")}
            {hasCis && ` ${t(lang, "ai.msCis")}`} {lang === "ru" ? "Источник" : "Source"}:{" "}
            <a href={MS_AI.source.paper} target="_blank" rel="noopener noreferrer">
              {t(lang, "ai.msSource")}
            </a>
          </p>
        )}
      </div>
    </section>
  );
};
