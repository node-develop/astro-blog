/**
 * HomeEditor — React island for /admin/home.
 *
 * Two tabs: RU (source of truth) and EN (auto-translated or manually edited).
 * handleSaveRu: save → translate.one → warn-toast if status === "warned".
 * handleSaveEn: save only → server sets manuallyEdited:true.
 *
 * Props are typed against the site collection schema defined in
 * src/content.config.ts. When backender delivers src/lib/content/home-schema.ts
 * the HomeData type below can be replaced with:
 *   import type { HomeData } from "~/lib/content/home-schema";
 */
import React, { useState } from "react";
import { actions } from "astro:actions";
import PublishBar from "./PublishBar";

// Mirrors the 14 home fields in content.config.ts site schema.
export interface HomeData {
  heroEyebrow?: string;
  heroTitle?: string;
  heroHighlight?: string;
  heroLede?: string;
  heroCta?: string;
  sealPhrase?: string;
  tickerItems?: string;
  courseEyebrow?: string;
  courseTitle?: string;
  courseLede?: string;
  courseCta?: string;
  latestLabel?: string;
  authorLabel?: string;
  authorBio?: string;
  authorLinksAria?: string;
  metaTitle?: string;
  metaDescription?: string;
}

interface Props {
  readonly ru: HomeData;
  readonly en: HomeData | null;
  readonly enManuallyEdited: boolean;
}

type Tab = "ru" | "en";

type SaveStatus = "idle" | "saving" | "saved" | "error";

const MULTILINE_FIELDS: ReadonlyArray<keyof HomeData> = [
  "heroLede",
  "tickerItems",
  "courseLede",
  "authorBio",
  "metaDescription",
];

const FIELD_LABELS: Record<keyof HomeData, string> = {
  heroEyebrow: "Hero Eyebrow",
  heroTitle: "Hero Title",
  heroHighlight: "Hero Highlight (слово из Hero Title под лаймом)",
  heroLede: "Hero Lede",
  heroCta: "Hero CTA",
  sealPhrase: "Seal Phrase (текст по кругу печати)",
  tickerItems: "Ticker Items (по одному в строке)",
  courseEyebrow: "Course Eyebrow",
  courseTitle: "Course Title",
  courseLede: "Course Lede",
  courseCta: "Course CTA",
  latestLabel: "Latest Label",
  authorLabel: "Author Label",
  authorBio: "Author Bio",
  authorLinksAria: "Author Links Aria",
  metaTitle: "Meta Title",
  metaDescription: "Meta Description",
};

const FIELD_ORDER: ReadonlyArray<keyof HomeData> = [
  "heroEyebrow",
  "heroTitle",
  "heroHighlight",
  "heroLede",
  "heroCta",
  "sealPhrase",
  "tickerItems",
  "courseEyebrow",
  "courseTitle",
  "courseLede",
  "courseCta",
  "latestLabel",
  "authorLabel",
  "authorBio",
  "authorLinksAria",
  "metaTitle",
  "metaDescription",
];

const emptyData = (): HomeData => ({
  heroEyebrow: "",
  heroTitle: "",
  heroHighlight: "",
  heroLede: "",
  heroCta: "",
  sealPhrase: "",
  tickerItems: "",
  courseEyebrow: "",
  courseTitle: "",
  courseLede: "",
  courseCta: "",
  latestLabel: "",
  authorLabel: "",
  authorBio: "",
  authorLinksAria: "",
  metaTitle: "",
  metaDescription: "",
});

const toFormValues = (data: HomeData | null): HomeData => {
  const empty = emptyData();
  if (!data) return empty;
  const out: HomeData = {};
  for (const key of FIELD_ORDER) {
    (out as Record<string, string>)[key] = (data as Record<string, string | undefined>)[key] ?? "";
  }
  return out;
};

const REQUIRED_FIELDS: ReadonlyArray<keyof HomeData> = [
  "heroTitle",
  "metaTitle",
  "metaDescription",
];

/**
 * Build the action payload from the form values.
 *
 * heroTitle / metaTitle / metaDescription are required by the server schema
 * and are always sent. Every other field is sent only when it differs from
 * `snapshot` (the values this tab loaded or last saved). The server merges
 * the patch into the on-disk file, so untouched fields survive — a tab that
 * was opened before another tab (or `pnpm translate`) rewrote the file can
 * no longer clobber those fields with stale values.
 */
export interface HomeUpdatePayload extends HomeData {
  readonly locale: "ru" | "en";
  readonly heroTitle: string;
  readonly metaTitle: string;
  readonly metaDescription: string;
}

export const buildHomePayload = (
  values: HomeData,
  snapshot: HomeData,
  locale: "ru" | "en",
): HomeUpdatePayload => {
  const dirty: HomeData = {};
  for (const key of FIELD_ORDER) {
    const next = values[key] ?? "";
    const prev = snapshot[key] ?? "";
    if (!REQUIRED_FIELDS.includes(key) && next !== prev) dirty[key] = next;
  }
  return {
    ...dirty,
    locale,
    heroTitle: values.heroTitle ?? "",
    metaTitle: values.metaTitle ?? "",
    metaDescription: values.metaDescription ?? "",
  };
};

export default function HomeEditor({ ru, en, enManuallyEdited }: Props): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<Tab>("ru");
  const [ruValues, setRuValues] = useState<HomeData>(() => toFormValues(ru));
  const [enValues, setEnValues] = useState<HomeData>(() => toFormValues(en));
  // Last known on-disk state per locale (loaded → then last successful save).
  // Used to compute the dirty-fields patch in buildHomePayload.
  const [ruSnapshot, setRuSnapshot] = useState<HomeData>(() => toFormValues(ru));
  const [enSnapshot, setEnSnapshot] = useState<HomeData>(() => toFormValues(en));

  const [ruStatus, setRuStatus] = useState<SaveStatus>("idle");
  const [enStatus, setEnStatus] = useState<SaveStatus>("idle");
  const [ruError, setRuError] = useState<string | null>(null);
  const [enError, setEnError] = useState<string | null>(null);
  const [warnMsg, setWarnMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const showToast = (msg: string, kind: "success" | "warn"): void => {
    if (kind === "warn") setWarnMsg(msg);
    else setSuccessMsg(msg);
    window.setTimeout(() => {
      if (kind === "warn") setWarnMsg(null);
      else setSuccessMsg(null);
    }, 8000);
  };

  const handleSaveRu = async (): Promise<void> => {
    setRuStatus("saving");
    setRuError(null);
    setWarnMsg(null);

    const saveResult = await actions.home.update(buildHomePayload(ruValues, ruSnapshot, "ru"));
    if (saveResult.error) {
      setRuStatus("error");
      setRuError(saveResult.error.message ?? "Не удалось сохранить");
      return;
    }
    setRuSnapshot(ruValues);
    setRuStatus("saved");
    setTimeout(() => setRuStatus("idle"), 1500);

    // Auto-translate RU → EN after save (R-FINAL-2 pattern).
    const translateResult = await actions.translate.one({
      collection: "site",
      slug: "home",
      force: false,
    });
    if (translateResult.error) {
      // Translation error is surfaced but doesn't block the save success.
      showToast(`Перевод не удался: ${translateResult.error.message}`, "warn");
      return;
    }
    if (translateResult.data.status === "warned") {
      showToast(
        "EN отмечен как отредактированный вручную, перевод пропущен. " +
          "Используйте кнопку ⟳ для перезаписи.",
        "warn",
      );
    } else if (translateResult.data.status === "translated") {
      showToast("RU сохранён, EN переведён.", "success");
    }
  };

  const handleSaveEn = async (): Promise<void> => {
    setEnStatus("saving");
    setEnError(null);

    const saveResult = await actions.home.update(buildHomePayload(enValues, enSnapshot, "en"));
    if (saveResult.error) {
      setEnStatus("error");
      setEnError(saveResult.error.message ?? "Не удалось сохранить");
      return;
    }
    setEnSnapshot(enValues);
    setEnStatus("saved");
    showToast("EN сохранён. manuallyEdited выставлен сервером.", "success");
    setTimeout(() => setEnStatus("idle"), 1500);
  };

  const setRuField = (key: keyof HomeData, value: string): void => {
    setRuValues((prev) => ({ ...prev, [key]: value }));
  };

  const setEnField = (key: keyof HomeData, value: string): void => {
    setEnValues((prev) => ({ ...prev, [key]: value }));
  };

  const isBusy = ruStatus === "saving" || enStatus === "saving";

  return (
    <div className="home-editor">
      {/* Toast notifications */}
      {warnMsg && (
        <div className="home-editor__toast home-editor__toast--warn" role="alert">
          {warnMsg}
        </div>
      )}
      {successMsg && (
        <div className="home-editor__toast home-editor__toast--ok" role="status">
          {successMsg}
        </div>
      )}

      {/* Tab switcher */}
      <div className="home-editor__tabs" role="tablist" aria-label="Язык редактирования">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "ru"}
          onClick={() => setActiveTab("ru")}
          className={`home-editor__tab${activeTab === "ru" ? "home-editor__tab--active" : ""}`}
        >
          RU
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "en"}
          onClick={() => setActiveTab("en")}
          className={`home-editor__tab${activeTab === "en" ? "home-editor__tab--active" : ""}`}
        >
          EN
          {enManuallyEdited && (
            <span
              className="home-editor__badge"
              title="Защищено от автоперевода"
              aria-label="Защищено от автоперевода"
            >
              {"🔒"}
            </span>
          )}
        </button>
      </div>

      {/* RU panel */}
      {activeTab === "ru" && (
        <div role="tabpanel" aria-label="Редактирование RU">
          <HomeFormFields values={ruValues} onChange={setRuField} disabled={isBusy} />
          <div className="home-editor__bar">
            <button
              type="button"
              onClick={() => void handleSaveRu()}
              disabled={isBusy}
              className="home-editor__save-btn"
            >
              {ruStatus === "saving" ? "Сохраняю…" : "Сохранить RU"}
            </button>
            {ruStatus === "saved" && <span className="home-editor__hint">Сохранено</span>}
            {ruStatus === "error" && ruError && (
              <span role="alert" className="home-editor__error">
                {ruError}
              </span>
            )}
          </div>
        </div>
      )}

      {/* EN panel */}
      {activeTab === "en" && (
        <div role="tabpanel" aria-label="Редактирование EN">
          {enManuallyEdited && (
            <div className="home-editor__info-banner" role="note">
              <span className="home-editor__badge">{"🔒"}</span>{" "}
              <strong>Защищено от автоперевода.</strong> Чтобы вернуться к авто-синхронизации с RU —
              нажмите ⟳ Force в PublishBar.
            </div>
          )}
          <HomeFormFields values={enValues} onChange={setEnField} disabled={isBusy} />
          <div className="home-editor__bar">
            <button
              type="button"
              onClick={() => void handleSaveEn()}
              disabled={isBusy}
              className="home-editor__save-btn"
            >
              {enStatus === "saving" ? "Сохраняю…" : "Сохранить EN"}
            </button>
            {enStatus === "saved" && <span className="home-editor__hint">Сохранено</span>}
            {enStatus === "error" && enError && (
              <span role="alert" className="home-editor__error">
                {enError}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Single PublishBar below tabs — not duplicated per tab */}
      <div className="home-editor__publish">
        <PublishBar collection="site" slug="home" disabled={isBusy} />
      </div>

      <style>{`
        .home-editor {
          display: flex;
          flex-direction: column;
          gap: var(--space-5);
        }
        .home-editor__toast {
          padding: var(--space-3) var(--space-4);
          border-radius: var(--radius-md);
          font-family: var(--font-mono);
          font-size: var(--fs-xs);
          border: var(--stroke-bold) solid currentColor;
          text-transform: uppercase;
          letter-spacing: var(--tracking-wide);
        }
        .home-editor__toast--warn { color: var(--color-accent); background: var(--color-accent-subtle); }
        .home-editor__toast--ok   { color: var(--color-fg-muted); background: var(--color-bg-elevated); }
        .home-editor__tabs {
          display: flex;
          gap: var(--space-1);
          border-bottom: var(--stroke-hair) solid var(--color-border);
          padding-bottom: 0;
        }
        /* Square tabs sitting on the rule, poster-style: the live one is a
           lime slab, not a lifted folder tab. */
        .home-editor__tab {
          font-family: var(--font-mono);
          font-size: var(--fs-sm);
          text-transform: uppercase;
          letter-spacing: var(--tracking-wide);
          padding: var(--space-2) var(--space-4);
          background: transparent;
          border: none;
          border-bottom: var(--stroke-slab) solid transparent;
          border-radius: 0;
          cursor: pointer;
          color: var(--color-fg-muted);
          display: flex;
          align-items: center;
          gap: var(--space-2);
          margin-bottom: calc(-1 * var(--stroke-hair));
          transition:
            color var(--dur-fast) var(--ease-out),
            border-color var(--dur-fast) var(--ease-out);
        }
        .home-editor__tab:hover {
          color: var(--color-fg);
          border-bottom-color: var(--color-border);
        }
        .home-editor__tab--active {
          color: var(--color-fg);
          border-bottom-color: var(--color-fill);
        }
        .home-editor__badge {
          font-size: var(--fs-xs);
        }
        .home-editor__info-banner {
          padding: var(--space-3) var(--space-4);
          border: var(--stroke-bold) solid var(--color-fg);
          border-radius: var(--radius-md);
          background: var(--color-bg-elevated);
          font-family: var(--font-mono);
          font-size: var(--fs-xs);
          color: var(--color-fg-muted);
          margin-bottom: var(--space-4);
        }
        .home-editor__bar {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          margin-top: var(--space-4);
        }
        .home-editor__save-btn {
          font-family: var(--font-mono);
          font-size: var(--fs-xs);
          padding: var(--space-2) var(--space-5);
          background: var(--color-fill);
          color: var(--color-on-fill);
          border: var(--stroke-bold) solid var(--color-fg);
          border-radius: var(--radius-md);
          cursor: pointer;
          letter-spacing: var(--tracking-wide);
          text-transform: uppercase;
          box-shadow: var(--shadow-press);
          transition:
            transform var(--dur-fast) var(--ease-out),
            box-shadow var(--dur-fast) var(--ease-out);
        }
        .home-editor__save-btn:not(:disabled):hover {
          transform: translate(-2px, -2px);
          box-shadow: 5px 5px 0 var(--color-shadow);
        }
        .home-editor__save-btn:not(:disabled):active { transform: none; box-shadow: none; }
        .home-editor__save-btn:disabled { opacity: 0.55; cursor: not-allowed; box-shadow: none; }
        .home-editor__hint {
          font-family: var(--font-mono);
          font-size: var(--fs-xs);
          color: var(--color-fg-muted);
        }
        .home-editor__error {
          font-family: var(--font-mono);
          font-size: var(--fs-xs);
          color: var(--color-danger);
        }
        .home-editor__publish {
          margin-top: var(--space-2);
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HomeFormFields — pure form for a single locale's 14 fields.
// ---------------------------------------------------------------------------

interface FormFieldsProps {
  readonly values: HomeData;
  readonly onChange: (key: keyof HomeData, value: string) => void;
  readonly disabled: boolean;
}

function HomeFormFields({ values, onChange, disabled }: FormFieldsProps): React.JSX.Element {
  return (
    <div className="fm-form">
      {FIELD_ORDER.map((key) => {
        const label = FIELD_LABELS[key];
        const value = (values as Record<string, string | undefined>)[key] ?? "";
        const isMultiline = (MULTILINE_FIELDS as ReadonlyArray<string>).includes(key);

        return (
          <label key={key} className="fm-form__field">
            <span>{label}</span>
            {isMultiline ? (
              <textarea
                value={value}
                onChange={(e) => onChange(key, e.target.value)}
                rows={4}
                disabled={disabled}
                aria-label={label}
              />
            ) : (
              <input
                type="text"
                value={value}
                onChange={(e) => onChange(key, e.target.value)}
                disabled={disabled}
                aria-label={label}
              />
            )}
          </label>
        );
      })}

      <style>{`
        .fm-form { display: flex; flex-direction: column; gap: var(--space-4); }
        .fm-form__field { display: flex; flex-direction: column; gap: var(--space-2); }
        .fm-form__field > span {
          font-family: var(--font-mono); font-size: var(--fs-xs);
          text-transform: uppercase; letter-spacing: var(--tracking-wide);
          color: var(--color-fg-muted);
        }
        .fm-form__field input[type="text"],
        .fm-form__field textarea {
          font-family: var(--font-sans); font-size: var(--fs-base);
          padding: var(--space-2) var(--space-3);
          border: var(--stroke-bold) solid var(--color-fg); border-radius: var(--radius-md);
          background: var(--color-bg); color: var(--color-fg);
          resize: vertical;
        }
        .fm-form__field input[type="text"]:disabled,
        .fm-form__field textarea:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
