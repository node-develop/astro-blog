import { useEffect, useMemo, useRef, useState } from "react";
import { LEVELS, LEVEL_PCT, rankIdeas, verdictOf } from "../lib/calc";
import { compact, money, pctText } from "../lib/format";
import { levelText, t, verdictText } from "../lib/i18n";
import { NICHES, nicheName } from "../lib/state";
import type { CalcState, Country, Lang, LevelId, Mode, Niche } from "../lib/types";
import { VERDICT_TONE } from "./ResultSlab";
import { Chip, StatusChip } from "./ui";

export const NicheDrawer = ({
  lang,
  open,
  state,
  countries,
  onClose,
  onApply,
  onClear,
}: {
  readonly lang: Lang;
  readonly open: boolean;
  readonly state: CalcState;
  readonly countries: readonly Country[];
  readonly onClose: () => void;
  readonly onApply: (n: Niche) => void;
  readonly onClear: () => void;
}) => {
  const ref = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<"all" | "ideas">("all");
  const [q, setQ] = useState("");
  const [lvl, setLvl] = useState<LevelId | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [picked, setPicked] = useState<string | null>(state.niche);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setPicked(state.niche);
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open, state.niche]);

  const m = (usd: number) => money(usd, state.currency, state.rates, lang);
  const list = NICHES.filter(
    (n) => (lvl == null || n.level === lvl) && (mode == null || n.model === mode),
  ).filter((n) => {
    const nq = q.trim().toLocaleLowerCase();
    return (
      !nq ||
      n.name_ru.toLocaleLowerCase().includes(nq) ||
      n.name_en.toLocaleLowerCase().includes(nq) ||
      n.example_products.some((p) => p.toLocaleLowerCase().includes(nq))
    );
  });
  const ideas = useMemo(
    () => (open && tab === "ideas" ? rankIdeas(NICHES, countries, state) : []),
    [open, tab, countries, state],
  );
  const pickedNiche = NICHES.find((n) => n.id === picked);
  const priceLine = (n: Niche, usd: number) =>
    t(lang, n.pricing === "one-off" ? "niche.oneOff" : "niche.perMonth", { p: m(usd) });
  const tabBtn = (id: "all" | "ideas", label: string) => (
    <button
      type="button"
      role="tab"
      id={`ntab-${id}`}
      aria-selected={tab === id}
      aria-controls="niche-panel"
      tabIndex={tab === id ? 0 : -1}
      className="tab"
      onClick={() => setTab(id)}
      onKeyDown={(e) => {
        if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
          e.preventDefault();
          const next =
            e.key === "Home" ? "all" : e.key === "End" ? "ideas" : id === "all" ? "ideas" : "all";
          setTab(next);
          document.getElementById(`ntab-${next}`)?.focus();
        }
      }}
    >
      {label}
    </button>
  );

  return (
    <dialog
      ref={ref}
      className="drawer"
      aria-labelledby="drawer-title"
      onClose={onClose}
      onCancel={onClose}
    >
      <div className="drawer__head">
        <h2 id="drawer-title" className="h2">
          {t(lang, "niche.title")}
        </h2>
        <button
          type="button"
          className="iconbtn"
          aria-label={t(lang, "niche.close")}
          onClick={onClose}
        >
          <svg viewBox="0 0 12 12" width="14" height="14" aria-hidden="true">
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="2" />
          </svg>
        </button>
      </div>
      <div className="tabs" role="tablist">
        {tabBtn("all", `${t(lang, "niche.all")} ${NICHES.length}`)}
        {tabBtn("ideas", t(lang, "niche.ideas"))}
      </div>
      <div
        className="drawer__body"
        id="niche-panel"
        role="tabpanel"
        aria-labelledby={`ntab-${tab}`}
      >
        {tab === "all" ? (
          <>
            <label className="sr-only" htmlFor="niche-search">
              {t(lang, "niche.search")}
            </label>
            <input
              id="niche-search"
              className="search"
              type="search"
              placeholder={t(lang, "niche.search")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="chips">
              {LEVELS.map((l) => (
                <Chip key={l} pressed={lvl === l} onClick={() => setLvl(lvl === l ? null : l)}>
                  {pctText(LEVEL_PCT[l], lang)}
                </Chip>
              ))}
              <Chip pressed={mode === "b2c"} onClick={() => setMode(mode === "b2c" ? null : "b2c")}>
                {t(lang, "niche.filter.b2c")}
              </Chip>
              <Chip pressed={mode === "b2b"} onClick={() => setMode(mode === "b2b" ? null : "b2b")}>
                {t(lang, "niche.filter.b2b")}
              </Chip>
            </div>
            {list.length === 0 && <p className="empty">{t(lang, "niche.empty")}</p>}
            <ul className="nlist">
              {list.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`nitem${picked === n.id ? "nitem--on" : ""}`}
                    aria-pressed={picked === n.id}
                    onClick={() => setPicked(n.id)}
                  >
                    <span className="nitem__name">{nicheName(n, lang)}</span>
                    <span className="nitem__meta">
                      <span className="mini">{levelText(lang, n.level).name}</span>
                      <span className="mini">{n.model.toUpperCase()}</span>
                      {n.anomaly && (
                        <StatusChip tone="success">{t(lang, "niche.anomaly")}</StatusChip>
                      )}
                      {picked === n.id && (
                        <span className="mini mini--on">{t(lang, "niche.selected")}</span>
                      )}
                    </span>
                    <span className="nitem__price">
                      {`${n.price_ru_rub_month.toLocaleString(lang === "ru" ? "ru-RU" : "en-US")} ${lang === "ru" ? "₽" : "RUB"} / $${n.price_us_usd_month} `}
                      {n.pricing === "one-off"
                        ? lang === "ru"
                          ? "в месяц, если разложить разовую покупку на год"
                          : "a month, one-off price spread over a year"
                        : lang === "ru"
                          ? "в месяц"
                          : "a month"}
                    </span>
                    {picked === n.id && (
                      <span className="nitem__more">
                        {lang === "ru" && <span>{n.note_ru}</span>}
                        <span>
                          {t(lang, "niche.examples")}: {n.example_products.join(", ")}
                        </span>
                        {n.anomaly && (
                          <span>
                            {t(lang, "niche.anomaly")}: {n.anomaly}
                          </span>
                        )}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <p className="note">
              {t(lang, "niche.ideasSub", { share: pctText(state.share, lang) })}
            </p>
            <ol className="ideas">
              {ideas.map((idea, i) => {
                const v = verdictOf(idea.avatars);
                return (
                  <li key={idea.niche.id}>
                    <button
                      type="button"
                      className={`idea${picked === idea.niche.id ? "nitem--on" : ""}`}
                      aria-pressed={picked === idea.niche.id}
                      onClick={() => setPicked(idea.niche.id)}
                    >
                      <span className="idea__rank">{i + 1}</span>
                      <span className="idea__body">
                        <span className="nitem__name">{nicheName(idea.niche, lang)}</span>
                        <span className="idea__nums">
                          {t(lang, "niche.avatars", { n: compact(idea.avatars, lang) })},{" "}
                          {priceLine(idea.niche, idea.price)},{" "}
                          {t(lang, "niche.rev", { v: m(idea.revenue) })}
                        </span>
                        <span className="nitem__meta">
                          <StatusChip tone={VERDICT_TONE[v]}>{verdictText(lang, v)[0]}</StatusChip>
                          {idea.niche.anomaly && (
                            <StatusChip tone="success">{t(lang, "niche.anomaly")}</StatusChip>
                          )}
                        </span>
                        {idea.niche.anomaly && picked === idea.niche.id && (
                          <span className="nitem__more">{idea.niche.anomaly}</span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </div>
      <div className="drawer__foot">
        <button
          type="button"
          className="btn btn--primary"
          disabled={!pickedNiche}
          onClick={() => {
            if (pickedNiche) onApply(pickedNiche);
          }}
        >
          {t(lang, "niche.apply")}
        </button>
        <button
          type="button"
          className="textbtn"
          onClick={() => {
            setPicked(null);
            onClear();
          }}
        >
          {t(lang, "niche.clear")}
        </button>
      </div>
    </dialog>
  );
};
