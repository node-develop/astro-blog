import { useId, useMemo, useState } from "react";
import { PRESETS, presetMembers } from "../lib/calc";
import { regionName, t } from "../lib/i18n";
import { COUNTRIES, COUNTRY_BY_ID, countryName } from "../lib/state";
import type { Lang, PresetId } from "../lib/types";
import { Chip } from "./ui";
import { cx } from "../lib/cx";

const norm = (s: string) => s.toLocaleLowerCase().replace(/ё/g, "е");

export const MarketPicker = ({
  lang,
  market,
  preset,
  onChange,
  onRandom,
}: {
  readonly lang: Lang;
  readonly market: readonly string[];
  readonly preset: PresetId | null;
  readonly onChange: (market: readonly string[], preset: PresetId | null) => void;
  readonly onRandom: () => void;
}) => {
  const id = useId();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [showAll, setShowAll] = useState(false);

  const matches = useMemo(() => {
    const nq = norm(q.trim());
    return COUNTRIES.filter(
      (c) => !nq || norm(c.ru).includes(nq) || norm(c.en).includes(nq) || c.id.toLowerCase() === nq,
    ).slice(0, 8);
  }, [q]);

  const pick = (cid: string, add: boolean) => {
    const next = add ? (market.includes(cid) ? market : [...market, cid]) : [cid];
    onChange(next, null);
    setQ("");
    setOpen(false);
  };
  const remove = (cid: string) => {
    const next = market.filter((x) => x !== cid);
    if (next.length) onChange(next, null);
  };

  const shown = showAll ? market : market.slice(0, 4);
  const listId = `${id}-list`;

  return (
    <div className="market">
      <div className="market__presets" role="group" aria-label={t(lang, "setup.market")}>
        {PRESETS.map((p) => (
          <Chip
            key={p}
            pressed={preset === p}
            onClick={() => onChange(presetMembers(COUNTRIES, p), preset === p ? null : p)}
          >
            {regionName(lang, p, true)}
          </Chip>
        ))}
      </div>
      <div className="market__row">
        <div className="combo">
          <label htmlFor={id} className="sr-only">
            {t(lang, "setup.search")}
          </label>
          <input
            id={id}
            className="combo__input"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              open && matches[active] ? `${id}-o-${matches[active].id}` : undefined
            }
            placeholder={t(lang, "setup.search")}
            value={q}
            autoComplete="off"
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
              setActive(0);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setOpen(true);
                setActive((a) => Math.min(a + 1, matches.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter" && matches[active]) {
                e.preventDefault();
                pick(matches[active].id, e.shiftKey);
              } else if (e.key === "Escape") {
                setOpen(false);
              } else if (e.key === "Backspace" && q === "" && market.length > 1) {
                remove(market[market.length - 1] ?? "");
              }
            }}
          />
          {open && (
            <ul
              id={listId}
              className="combo__list"
              role="listbox"
              aria-label={t(lang, "setup.search")}
            >
              {matches.length === 0 && <li className="combo__empty">{t(lang, "setup.noMatch")}</li>}
              {matches.map((c, i) => (
                <li
                  key={c.id}
                  id={`${id}-o-${c.id}`}
                  role="option"
                  aria-selected={market.includes(c.id)}
                  className={cx("combo__opt", i === active && "combo__opt--active")}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                >
                  <button
                    type="button"
                    className="combo__pick"
                    tabIndex={-1}
                    onClick={() => pick(c.id, false)}
                  >
                    {countryName(c, lang)}
                    {market.includes(c.id) && (
                      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                        <path
                          d="M2 8.5l4 4 8-9"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.4"
                        />
                      </svg>
                    )}
                  </button>
                  <button
                    type="button"
                    className="combo__add"
                    tabIndex={-1}
                    aria-label={lang === "ru" ? `Добавить: ${c.ru}` : `Add: ${c.en}`}
                    onClick={() => pick(c.id, true)}
                  >
                    {lang === "ru" ? "добавить" : "add"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button type="button" className="btn btn--secondary" onClick={onRandom}>
          {t(lang, "setup.random")}
        </button>
      </div>
      <ul className="market__tokens" aria-label={t(lang, "setup.market")}>
        {preset ? (
          <li className="token token--preset">
            {regionName(lang, preset)}: {market.length}
          </li>
        ) : (
          shown.map((cid) => {
            const c = COUNTRY_BY_ID.get(cid);
            if (!c) return null;
            return (
              <li key={cid} className="token">
                {countryName(c, lang)}
                {market.length > 1 && (
                  <button
                    type="button"
                    className="token__x"
                    aria-label={`${t(lang, "setup.remove")}: ${countryName(c, lang)}`}
                    onClick={() => remove(cid)}
                  >
                    <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
                      <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="2" />
                    </svg>
                  </button>
                )}
              </li>
            );
          })
        )}
        {!preset && market.length > 4 && (
          <li>
            <button type="button" className="textbtn" onClick={() => setShowAll(!showAll)}>
              {showAll
                ? t(lang, "band.lessonClose")
                : t(lang, "setup.more", { n: market.length - 4 })}
            </button>
          </li>
        )}
      </ul>
    </div>
  );
};
