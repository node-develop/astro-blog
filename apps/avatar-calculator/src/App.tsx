import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AiPanel } from "./components/AiPanel";
import { BreadthBand } from "./components/BreadthBand";
import { CountryTable } from "./components/CountryTable";
import { Economy } from "./components/Economy";
import { FeedbackForm } from "./components/FeedbackForm";
import { Funnel } from "./components/Funnel";
import { MarketPicker } from "./components/MarketPicker";
import { NicheDrawer } from "./components/NicheDrawer";
import { ResultSlab, VERDICT_TONE } from "./components/ResultSlab";
import { Scenarios, type Scenario } from "./components/Scenarios";
import { Segmented, StatusChip } from "./components/ui";
import { CIS_IDS, applyNiche, computeResult, verdictOf } from "./lib/calc";
import { compact } from "./lib/format";
import { regionName, t, verdictText } from "./lib/i18n";
import {
  COUNTRIES,
  COUNTRY_BY_ID,
  DEFAULT_STATE,
  NICHES,
  countryName,
  decodeState,
  encodeState,
  initialLang,
  nicheName,
  readStore,
  sanitize,
  writeStore,
} from "./lib/state";
import type { CalcState, Country, Lang } from "./lib/types";
import { cx } from "./lib/cx";
import { track } from "./lib/analytics";

const SCEN_KEY = "avatar-calc-scenarios";

interface Toast {
  readonly id: number;
  readonly text: string;
  readonly action?: { readonly label: string; readonly run: () => void };
}

const Logo = () => (
  <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
    <rect width="32" height="32" fill="var(--color-fg)" />
    <rect x="6" y="18" width="20" height="8" fill="var(--color-fill)" />
    <rect x="6" y="6" width="8" height="8" fill="var(--color-bg)" />
  </svg>
);

export const App = () => {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [state, setState] = useState<CalcState>(
    () =>
      decodeState(new URLSearchParams(location.search).get("s")) ??
      sanitize(readStore<unknown>("avatar-calc-last-v2", null)),
  );
  const [tab, setTab] = useState<"funnel" | "econ">("funnel");
  const [drawer, setDrawer] = useState(false);
  const [scenarios, setScenarios] = useState<readonly Scenario[]>(() => {
    const raw = readStore<unknown>(SCEN_KEY, []);
    return Array.isArray(raw)
      ? raw
          .filter(
            (x): x is { id: string; state: unknown } =>
              typeof x === "object" && x !== null && typeof (x as { id?: unknown }).id === "string",
          )
          .slice(0, 3)
          .map((x) => ({ id: x.id, state: sanitize(x.state) }))
      : [];
  });
  const ratesEdited = useRef(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [rateDate, setRateDate] = useState<string | null>(null);
  const [resultVisible, setResultVisible] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );
  const resultRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const update = useCallback((fn: (s: CalcState) => CalcState) => setState((s) => fn(s)), []);
  const countries = useMemo(
    () => state.market.map((id) => COUNTRY_BY_ID.get(id)).filter((c): c is Country => !!c),
    [state.market],
  );
  const result = useMemo(() => computeResult(countries, state), [countries, state]);
  const ruMarket = countries.length > 0 && countries.every((c) => CIS_IDS.includes(c.id));

  const say = useCallback((text: string, action?: Toast["action"]) => {
    window.clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), text, ...(action ? { action } : {}) });
    toastTimer.current = window.setTimeout(() => setToast(null), action ? 6000 : 4000);
  }, []);

  /* URL and storage follow the state, so every view is a shareable link. */
  useEffect(() => {
    const id = window.setTimeout(() => {
      const url = new URL(location.href);
      url.searchParams.set("s", encodeState(state));
      history.replaceState(null, "", url);
      writeStore("avatar-calc-last-v2", state);
    }, 300);
    return () => window.clearTimeout(id);
  }, [state]);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = lang === "ru" ? "Калькулятор ширины аватара" : "Avatar breadth calculator";
    writeStore("avatar-calc-lang", lang);
  }, [lang]);

  useEffect(() => writeStore(SCEN_KEY, scenarios), [scenarios]);

  /* Live exchange rates; the fallback stays if the request fails or the user already edited them. */
  useEffect(() => {
    const ctrl = new AbortController();
    fetch("https://open.er-api.com/v6/latest/USD", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { rates?: Record<string, number>; time_last_update_unix?: number }) => {
        const rub = d.rates?.RUB;
        const eur = d.rates?.EUR;
        if (!rub || !eur) return;
        // Live rates win over stored or shared ones unless the user typed a rate this visit.
        if (ratesEdited.current) return;
        setState((s) => ({
          ...s,
          rates: { rub: Math.round(rub * 100) / 100, eur: Math.round(eur * 1000) / 1000 },
        }));
        if (d.time_last_update_unix) {
          setRateDate(
            new Date(d.time_last_update_unix * 1000).toLocaleDateString(
              lang === "ru" ? "ru-RU" : "en-US",
            ),
          );
        }
      })
      .catch(() => undefined);
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = resultRef.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      ([e]) => setResultVisible(!!e && e.intersectionRatio >= 0.3),
      { threshold: [0, 0.3, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      // Raw string, same format and key as the blog's theme toggle.
      localStorage.setItem("artka-theme", next);
    } catch {
      // Storage blocked: the theme still applies for this visit.
    }
  };

  const setMarket = (market: readonly string[], preset: CalcState["preset"]) => {
    track("select_market", { market: preset ?? market.slice(0, 5).join(","), countries: market.length });
    update((s) => ({ ...s, market, preset, overrides: { inet: null, buy: null, rus: null, ai: null } }));
  };

  const random = () => {
    const pool = COUNTRIES.filter(
      (c) => c.buyS === "findex" && c.pop >= 3_000_000 && !state.market.includes(c.id),
    );
    const c = pool[Math.floor(Math.random() * pool.length)];
    if (!c) return;
    track("random_country", { country: c.id });
    setMarket([c.id], null);
    say(t(lang, "toast.random", { c: countryName(c, lang) }));
  };

  const save = () => {
    if (scenarios.length >= 3) {
      say(t(lang, "scen.full"));
      return;
    }
    setScenarios((sc) => [...sc, { id: String(Date.now()), state }]);
    track("save_scenario", { count: scenarios.length + 1 });
    say(t(lang, "toast.saved"));
  };

  const share = () => {
    const url = new URL(location.href);
    url.searchParams.set("s", encodeState(state));
    url.searchParams.set("lang", lang);
    const text = url.toString();
    track("share", { market: state.preset ?? state.market.slice(0, 5).join(",") });
    navigator.clipboard
      ?.writeText(text)
      .then(() => say(t(lang, "toast.copied")))
      .catch(() => say(t(lang, "toast.copyFail")));
    if (!navigator.clipboard) say(t(lang, "toast.copyFail"));
  };

  const reset = () => {
    const prev = state;
    setState({ ...DEFAULT_STATE, rates: state.rates });
    say(t(lang, "toast.reset"), { label: t(lang, "toast.undo"), run: () => setState(prev) });
  };

  const focusBreadth = () => {
    const el = document.getElementById("breadth");
    el?.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
    el?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus({
      preventScroll: true,
    });
  };

  const niche = NICHES.find((n) => n.id === state.niche);
  const marketText = state.preset
    ? regionName(lang, state.preset)
    : countries.length === 1 && countries[0]
      ? countryName(countries[0], lang)
      : `${countries.length} ${lang === "ru" ? "стран" : "countries"}`;
  const context = `${marketText}, ${state.mode.toUpperCase()}${niche ? `, ${nicheName(niche, lang)}` : ""}`;
  const v = verdictOf(result.avatars);

  return (
    <>
      <a className="skip" href="#main">
        {lang === "ru" ? "К калькулятору" : "Skip to calculator"}
      </a>
      <header className="topbar">
        <a className="topbar__brand" href="https://artka.dev/">
          <Logo />
          <span>{t(lang, "brand.back")}</span>
        </a>
        <div className="topbar__actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              track("switch_language", { to: lang === "ru" ? "en" : "ru" });
              setLang(lang === "ru" ? "en" : "ru");
            }}
            lang={lang === "ru" ? "en" : "ru"}
          >
            {t(lang, "lang.switch")}
          </button>
          <button
            type="button"
            className="iconbtn"
            aria-label={t(lang, "theme.toggle")}
            aria-pressed={theme === "dark"}
            onClick={toggleTheme}
          >
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
              <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M10 3a7 7 0 010 14z" fill="currentColor" />
            </svg>
          </button>
        </div>
      </header>

      <main id="main" className="page">
        <section className="head">
          <div className="head__text">
            <p className="eyebrow">{t(lang, "head.eyebrow")}</p>
            <h1 className="h1">{t(lang, "head.title")}</h1>
            <p className="lede">{t(lang, "head.lede")}</p>
          </div>
          <div className="formula">
            <p className="sr-only">{t(lang, "head.formula.sr")}</p>
            <span className="formula__term" aria-hidden="true">
              {t(lang, "head.formula.a")}
            </span>
            <span className="formula__op" aria-hidden="true">
              ×
            </span>
            <span className="formula__term" aria-hidden="true">
              {t(lang, "head.formula.b")}
            </span>
            <span className="formula__op" aria-hidden="true">
              =
            </span>
            <span className="formula__term formula__term--fill" aria-hidden="true">
              {t(lang, "head.formula.c")}
            </span>
            <p className="head__sources">{t(lang, "head.sources")}</p>
          </div>
        </section>

        <section className="setup" aria-label={t(lang, "setup.market")}>
          <div className="setup__group setup__group--market">
            <p className="label">{t(lang, "setup.market")}</p>
            <MarketPicker
              lang={lang}
              market={state.market}
              preset={state.preset}
              onChange={setMarket}
              onRandom={random}
            />
          </div>
          <div className="setup__group">
            <p className="label">{t(lang, "setup.mode")}</p>
            <Segmented
              label={t(lang, "setup.mode")}
              full
              value={state.mode}
              options={[
                { value: "b2c", label: t(lang, "mode.b2c") },
                { value: "b2b", label: t(lang, "mode.b2b") },
              ]}
              onChange={(mode) => {
                track("select_mode", { mode });
                update((s) => ({ ...s, mode }));
              }}
            />
          </div>
          <div className="setup__group">
            <p className="label">{t(lang, "setup.niche")}</p>
            {niche ? (
              <div className="setup__niche">
                <span className="setup__nicheName">{nicheName(niche, lang)}</span>
                <span className="setup__nicheActs">
                  <button type="button" className="textbtn" onClick={() => {
                    track("open_niches");
                    setDrawer(true);
                  }}>
                    {t(lang, "setup.changeNiche")}
                  </button>
                  <button
                    type="button"
                    className="textbtn"
                    onClick={() => update((s) => ({ ...s, niche: null, customPct: null }))}
                  >
                    {t(lang, "setup.clearNiche")}
                  </button>
                </span>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn--secondary btn--block"
                  onClick={() => {
                    track("open_niches");
                    setDrawer(true);
                  }}
                >
                  {t(lang, "setup.pickNiche")}
                </button>
                <p className="note">{t(lang, "setup.nicheHint")}</p>
              </>
            )}
          </div>
        </section>

        <BreadthBand
          lang={lang}
          state={state}
          onLevel={(level) => {
            track("select_level", { level: `1/${level}` });
            update((s) => ({ ...s, level, customPct: null }));
          }}
          onCustom={(p) => update((s) => ({ ...s, customPct: p }))}
        />

        <div className="work">
          <div className="work__left">
            <div className="tabs" role="tablist" aria-label={t(lang, "tabs.funnel")}>
              {(["funnel", "econ"] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={`tab-${id}`}
                  aria-selected={tab === id}
                  aria-controls={`panel-${id}`}
                  tabIndex={tab === id ? 0 : -1}
                  className="tab"
                  onClick={() => {
                    if (id === "econ" && tab !== "econ") track("open_economy");
                    setTab(id);
                  }}
                  onKeyDown={(e) => {
                    const next =
                      e.key === "Home"
                        ? "funnel"
                        : e.key === "End"
                          ? "econ"
                          : e.key === "ArrowRight" || e.key === "ArrowLeft"
                            ? tab === "funnel"
                              ? "econ"
                              : "funnel"
                            : null;
                    if (next) {
                      e.preventDefault();
                      setTab(next);
                      document.getElementById(`tab-${next}`)?.focus();
                    }
                  }}
                >
                  {t(lang, id === "funnel" ? "tabs.funnel" : "tabs.econ")}
                </button>
              ))}
            </div>
            <div
              id="panel-funnel"
              role="tabpanel"
              aria-labelledby="tab-funnel"
              hidden={tab !== "funnel"}
            >
              <Funnel
                lang={lang}
                state={state}
                update={update}
                countries={countries}
                funnel={result.funnel}
                onFocusBreadth={focusBreadth}
              />
            </div>
            <div id="panel-econ" role="tabpanel" aria-labelledby="tab-econ" hidden={tab !== "econ"}>
              <Economy
                lang={lang}
                state={state}
                update={update}
                avatars={result.avatars}
                ruMarket={ruMarket}
              />
            </div>
          </div>
          <div className="work__right" ref={resultRef}>
            <ResultSlab
              lang={lang}
              state={state}
              update={update}
              result={result}
              context={context}
              rateDate={rateDate}
              onSave={save}
              onShare={share}
              onReset={reset}
              onRateEdit={() => {
                ratesEdited.current = true;
                setRateDate(null);
              }}
            />
          </div>
        </div>

        <AiPanel lang={lang} countries={countries} />

        <Scenarios
          lang={lang}
          scenarios={scenarios}
          current={state}
          onOpen={(sc) => setState(sc.state)}
          onDelete={(id) => setScenarios((all) => all.filter((x) => x.id !== id))}
          onSave={save}
        />

        <CountryTable
          lang={lang}
          state={state}
          selected={countries}
          onSelect={(id) => {
            setMarket([id], null);
            window.scrollTo({
              top: 0,
              behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
            });
          }}
        />

        <FeedbackForm lang={lang} state={state} />

        <footer className="foot">
          <p>{t(lang, "foot.note")}</p>
        </footer>
      </main>

      <NicheDrawer
        lang={lang}
        open={drawer}
        state={state}
        countries={countries}
        onClose={() => setDrawer(false)}
        onApply={(n) => {
          track("apply_niche", { niche: n.id, level: `1/${n.level}`, mode: n.model });
          update((s) => applyNiche(s, n, countries));
          setDrawer(false);
        }}
        onClear={() => update((s) => ({ ...s, niche: null, customPct: null }))}
      />

      <div
        className={cx("bottombar", resultVisible && "bottombar--hidden")}
        aria-hidden={resultVisible}
      >
        <span className="bottombar__num">{compact(result.avatars, lang)}</span>
        <span className="bottombar__unit">{t(lang, "result.avatars")}</span>
        <StatusChip tone={VERDICT_TONE[v]}>{verdictText(lang, v)[0]}</StatusChip>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          tabIndex={resultVisible ? -1 : 0}
          onClick={() => {
            resultRef.current?.scrollIntoView({ block: "start" });
            resultRef.current?.querySelector<HTMLElement>("h2")?.focus();
          }}
        >
          {t(lang, "bar.result")}
        </button>
      </div>

      <div className="toast-region" role="status" aria-live="polite">
        {toast && (
          <div className="toast" key={toast.id}>
            <span>{toast.text}</span>
            {toast.action && (
              <button
                type="button"
                className="toast__btn"
                onClick={() => {
                  toast.action?.run();
                  setToast(null);
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
};
