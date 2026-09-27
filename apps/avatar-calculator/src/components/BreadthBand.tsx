import { useRef, useState, type KeyboardEvent } from "react";
import { LEVELS, LEVEL_PCT, LEVEL_TIER, shownLevel } from "../lib/calc";
import { levelText, prosCons, t } from "../lib/i18n";
import { pctText } from "../lib/format";
import type { CalcState, Lang, LevelId } from "../lib/types";
import { NumberField, PeopleGrid, PriceTier } from "./ui";
import { cx } from "../lib/cx";

type Cell = LevelId | "custom";

export const BreadthBand = ({
  lang,
  state,
  onLevel,
  onCustom,
}: {
  readonly lang: Lang;
  readonly state: CalcState;
  readonly onLevel: (l: LevelId) => void;
  readonly onCustom: (p: number) => void;
}) => {
  const [lessonOpen, setLessonOpen] = useState(false);
  const refs = useRef<Partial<Record<string, HTMLButtonElement | null>>>({});
  const selected: Cell = state.customPct == null ? state.level : "custom";
  const cells: readonly Cell[] = [...LEVELS, "custom"];
  const lvl = shownLevel(state);
  const b2b = state.mode === "b2b";

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    const i = cells.indexOf(selected);
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? cells[(i + 1) % cells.length]
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? cells[(i - 1 + cells.length) % cells.length]
          : e.key === "Home"
            ? cells[0]
            : e.key === "End"
              ? cells[cells.length - 1]
              : undefined;
    if (next == null) return;
    e.preventDefault();
    if (next === "custom") onCustom(state.customPct ?? LEVEL_PCT[state.level]);
    else onLevel(next);
    refs.current[String(next)]?.focus();
  };

  const pc = prosCons(lang, lvl);
  const lt = levelText(lang, lvl);

  return (
    <section className="band" aria-labelledby="band-title" id="breadth">
      <div className="section-head">
        <h2 id="band-title" className="h2">
          {t(lang, "band.title")}
        </h2>
        <p className="section-sub">{t(lang, b2b ? "band.subB2b" : "band.sub")}</p>
      </div>
      <div className="band__cells" role="radiogroup" aria-labelledby="band-title">
        {LEVELS.map((l) => {
          const txt = levelText(lang, l);
          const on = selected === l;
          const nicheSet = selected === "custom" && lvl === l && state.niche != null;
          return (
            <button
              key={l}
              ref={(el) => {
                refs.current[String(l)] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              className={cx("cell", on && "cell--on", nicheSet && "cell--hint")}
              onClick={() => onLevel(l)}
              onKeyDown={onKey}
            >
              <span className="cell__pct">{pctText(LEVEL_PCT[l], lang)}</span>
              <span className="cell__name">{txt.name}</span>
              <PeopleGrid pct={LEVEL_PCT[l]} />
              <span className="cell__who">{b2b ? txt.whoB2b : txt.who}</span>
              <span className="cell__foot">
                <PriceTier tier={LEVEL_TIER[l]} />
                <span className="cell__ref">{txt.ref}</span>
              </span>
            </button>
          );
        })}
        <div className={cx("cell", "cell--custom", selected === "custom" && "cell--on")}>
          <button
            ref={(el) => {
              refs.current.custom = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected === "custom"}
            aria-controls="custom-pct"
            tabIndex={selected === "custom" ? 0 : -1}
            className="cell__radio"
            onKeyDown={onKey}
            onClick={() => selected !== "custom" && onCustom(LEVEL_PCT[state.level])}
          >
            <span className="cell__pct cell__pct--muted" aria-hidden="true">
              %
            </span>
            <span className="cell__name">{t(lang, "band.custom")}</span>
          </button>
          <NumberField
            id="custom-pct"
            label={t(lang, "band.custom")}
            hideLabel
            value={state.customPct ?? LEVEL_PCT[state.level]}
            min={0.01}
            max={100}
            suffix="%"
            error={t(lang, "err.custom")}
            onChange={onCustom}
            compact
          />
          <span className="cell__who">
            {state.customPct != null && state.niche
              ? t(lang, "band.byNiche")
              : t(lang, "band.customHint")}
          </span>
        </div>
      </div>
      <div className="band__under">
        <button
          type="button"
          className="textbtn"
          aria-expanded={lessonOpen}
          aria-controls="lesson-panel"
          onClick={() => setLessonOpen(!lessonOpen)}
        >
          {lessonOpen
            ? t(lang, "band.lessonClose")
            : t(lang, "band.lessonOpen", { level: lt.name.toLocaleLowerCase(lang) })}
        </button>
        <p className="band__legend">{t(lang, "band.tiers")}</p>
      </div>
      <div id="lesson-panel" className="lesson" hidden={!lessonOpen}>
        <div className="lesson__col">
          <h3 className="label">{t(lang, "lesson.examples")}</h3>
          <ul className="lesson__list">
            {lt.examples.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
        <div className="lesson__col">
          <h3 className="label">
            {t(lang, lvl === 2 || lvl === 10 ? "lesson.wide" : "lesson.narrow")}
          </h3>
          <div className="lesson__pc">
            <div>
              <p className="lesson__pch">{t(lang, "lesson.plus")}</p>
              <ul className="pc pc--plus">
                {pc.plus.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="lesson__pch">{t(lang, "lesson.minus")}</p>
              <ul className="pc pc--minus">
                {pc.minus.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <div className="lesson__col">
          <h3 className="label">{t(lang, "lesson.advice")}</h3>
          <p className="lesson__advice">{lt.advice}</p>
        </div>
      </div>
    </section>
  );
};
