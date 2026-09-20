import React, { useEffect, useState } from "react";
import { actions } from "astro:actions";

/**
 * Shared toolbar for the admin editors: "Translate to EN" + "Publish".
 *
 * Used by EditorShell (posts) and SiteEditor (about/now/uses), and by the
 * generic /admin/translate page. Owns no editor state — only the two
 * actions and the auto-translate-on-save preference (stored in
 * localStorage, per-browser).
 */
type Collection = "posts" | "site" | "projects" | "courses" | "lessons";

interface Props {
  /** Which collection the slug belongs to. */
  readonly collection: Collection;
  /**
   * Stable slug shape per collection (see resolveCollectionPaths in
   * src/lib/translate/site-config.ts). null disables the actions —
   * useful when the parent editor hasn't created the entry yet (new post).
   */
  readonly slug: string | null;
  /** Disable both actions while the editor is mid-save. */
  readonly disabled?: boolean;
  /**
   * Notifier for the parent so it can read the current
   * "auto-translate after save" preference. Optional — when omitted
   * the toolbar just renders the checkbox without parent integration.
   */
  readonly onAutoTranslateChange?: (enabled: boolean) => void;
}

type ActionStatus = "idle" | "running" | "ok" | "warn" | "error";

const AUTO_TRANSLATE_KEY = "admin.autoTranslate";

const readAutoTranslate = (): boolean => {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(AUTO_TRANSLATE_KEY) === "1";
};

const writeAutoTranslate = (v: boolean): void => {
  if (typeof window === "undefined") return;
  if (v) window.localStorage.setItem(AUTO_TRANSLATE_KEY, "1");
  else window.localStorage.removeItem(AUTO_TRANSLATE_KEY);
};

const shortSha = (sha: string): string => sha.slice(0, 7);

export default function PublishBar({
  collection,
  slug,
  disabled = false,
  onAutoTranslateChange,
}: Props): React.JSX.Element {
  const [translateState, setTranslateState] = useState<ActionStatus>("idle");
  const [translateMsg, setTranslateMsg] = useState<string | null>(null);
  const [publishState, setPublishState] = useState<ActionStatus>("idle");
  const [publishMsg, setPublishMsg] = useState<string | null>(null);
  const [publishUrl, setPublishUrl] = useState<string | null>(null);
  const [autoTranslate, setAutoTranslate] = useState(false);

  // Read localStorage once after mount (avoids SSR mismatch).
  useEffect(() => {
    const v = readAutoTranslate();
    setAutoTranslate(v);
    onAutoTranslateChange?.(v);
  }, [onAutoTranslateChange]);

  const handleAutoToggle = (next: boolean): void => {
    setAutoTranslate(next);
    writeAutoTranslate(next);
    onAutoTranslateChange?.(next);
  };

  async function runTranslate(force: boolean): Promise<void> {
    if (!slug) return;
    setTranslateState("running");
    setTranslateMsg(null);
    const result = await actions.translate.one({ collection, slug, force });
    if (result.error) {
      setTranslateState("error");
      setTranslateMsg(result.error.message ?? "Не удалось перевести");
      return;
    }
    const data = result.data;
    if (data.status === "translated") {
      setTranslateState("ok");
      setTranslateMsg("Перевод сохранён. Не забудьте Publish.");
    } else if (data.status === "skipped") {
      setTranslateState("ok");
      setTranslateMsg(`Пропущено: ${data.reason ?? "no changes"}`);
    } else if (data.status === "warned") {
      setTranslateState("warn");
      setTranslateMsg(`EN-twin защищён (manuallyEdited). Используйте Force чтобы перезаписать.`);
    } else {
      setTranslateState("error");
      setTranslateMsg(`Статус: ${data.status}`);
    }
    window.setTimeout(() => setTranslateState("idle"), 8000);
  }

  async function runPublish(): Promise<void> {
    if (!slug) return;
    setPublishState("running");
    setPublishMsg(null);
    setPublishUrl(null);
    const result = await actions.publish.one({ collection, slug });
    if (result.error) {
      setPublishState("error");
      setPublishMsg(result.error.message ?? "Не удалось опубликовать");
      return;
    }
    const data = result.data;
    if (data.status === "published") {
      setPublishState("ok");
      setPublishMsg(`Опубликовано (commit ${shortSha(data.commitSha)}). Деплой через ~2-3 минуты.`);
      setPublishUrl(data.commitUrl);
    } else {
      setPublishState("ok");
      setPublishMsg(`Нечего публиковать: ${data.reason ?? "локальные файлы совпадают с main"}`);
    }
    window.setTimeout(() => setPublishState("idle"), 12000);
  }

  const busy = disabled || !slug;
  const translateBusy = busy || translateState === "running" || publishState === "running";
  const publishBusy = busy || publishState === "running" || translateState === "running";

  return (
    <div className="publish-bar">
      <div className="publish-bar__row">
        <button
          type="button"
          onClick={() => runTranslate(false)}
          disabled={translateBusy}
          className="publish-bar__btn publish-bar__btn--ghost"
        >
          {translateState === "running" ? "Перевожу…" : "Перевести в EN"}
        </button>
        <button
          type="button"
          onClick={() => runTranslate(true)}
          disabled={translateBusy}
          className="publish-bar__btn publish-bar__btn--ghost"
          title="Force overwrite (игнорирует manuallyEdited)"
        >
          ⟳
        </button>
        <button
          type="button"
          onClick={runPublish}
          disabled={publishBusy}
          className="publish-bar__btn publish-bar__btn--accent"
        >
          {publishState === "running" ? "Публикую…" : "Опубликовать"}
        </button>
        <label className="publish-bar__toggle">
          <input
            type="checkbox"
            checked={autoTranslate}
            onChange={(e) => handleAutoToggle(e.target.checked)}
          />
          <span>авто-перевод после Save</span>
        </label>
      </div>
      {(translateMsg || publishMsg) && (
        <div className="publish-bar__msgs">
          {translateMsg && (
            <span
              className={`publish-bar__msg publish-bar__msg--${translateState}`}
              role={translateState === "error" ? "alert" : undefined}
            >
              {translateMsg}
            </span>
          )}
          {publishMsg && (
            <span
              className={`publish-bar__msg publish-bar__msg--${publishState}`}
              role={publishState === "error" ? "alert" : undefined}
            >
              {publishMsg}
              {publishUrl && (
                <>
                  {" "}
                  <a href={publishUrl} target="_blank" rel="noreferrer noopener">
                    смотреть
                  </a>
                </>
              )}
            </span>
          )}
        </div>
      )}

      <style>{`
        .publish-bar {
          display: flex; flex-direction: column; gap: var(--space-2);
          padding: var(--space-3) var(--space-4);
          background: var(--color-bg-elevated);
          border: var(--stroke-bold) solid var(--color-fg);
          border-radius: var(--radius-md);
        }
        .publish-bar__row {
          display: flex; gap: var(--space-3); align-items: center; flex-wrap: wrap;
        }
        .publish-bar__btn {
          font-family: var(--font-mono); font-size: var(--fs-xs);
          padding: var(--space-2) var(--space-4);
          border-radius: var(--radius-md); cursor: pointer;
          letter-spacing: var(--tracking-wide); text-transform: uppercase;
          transition:
            background var(--dur-fast) var(--ease-out),
            color var(--dur-fast) var(--ease-out),
            transform var(--dur-fast) var(--ease-out),
            box-shadow var(--dur-fast) var(--ease-out);
        }
        .publish-bar__btn--accent {
          background: var(--color-fill); color: var(--color-on-fill);
          border: var(--stroke-bold) solid var(--color-fg);
          box-shadow: var(--shadow-press);
        }
        .publish-bar__btn--ghost {
          background: transparent; color: var(--color-fg);
          border: var(--stroke-bold) solid var(--color-fg);
        }
        .publish-bar__btn:not(:disabled):hover {
          background: var(--color-fill); color: var(--color-on-fill);
          transform: translate(-2px, -2px); box-shadow: 5px 5px 0 var(--color-shadow);
        }
        .publish-bar__btn:not(:disabled):active { transform: none; box-shadow: none; }
        .publish-bar__btn:disabled { opacity: 0.55; cursor: not-allowed; box-shadow: none; }
        .publish-bar__toggle {
          margin-left: auto; display: inline-flex; align-items: center; gap: var(--space-2);
          font-family: var(--font-mono); font-size: var(--fs-xs); color: var(--color-fg-muted);
        }
        .publish-bar__msgs {
          display: flex; flex-direction: column; gap: var(--space-1);
          font-family: var(--font-mono); font-size: var(--fs-xs);
        }
        .publish-bar__msg--ok { color: var(--color-fg-muted); }
        .publish-bar__msg--warn { color: var(--color-accent); }
        .publish-bar__msg--error { color: var(--color-danger); }
      `}</style>
    </div>
  );
}

export const isAutoTranslateEnabled = readAutoTranslate;

export interface AutoTranslateOutcome {
  readonly status: "disabled" | "translated" | "skipped" | "warned" | "error";
  /** Human-readable note for the editor UI; null when nothing worth showing. */
  readonly message: string | null;
}

/**
 * Runs translate.one after a save when the author opted in via the toolbar
 * checkbox. Never throws — auto-translate must not undo a successful save —
 * but every failure is returned so the caller can show it: a silently
 * missing EN twin is exactly the kind of "looks like success" we avoid.
 */
export async function maybeAutoTranslate(
  collection: Collection,
  slug: string,
): Promise<AutoTranslateOutcome> {
  if (!readAutoTranslate()) return { status: "disabled", message: null };
  try {
    const result = await actions.translate.one({ collection, slug, force: false });
    if (result.error) {
      return {
        status: "error",
        message: `Автоперевод не удался: ${result.error.message ?? "неизвестная ошибка"}`,
      };
    }
    const data = result.data;
    if (data.status === "translated") return { status: "translated", message: null };
    if (data.status === "skipped") return { status: "skipped", message: null };
    if (data.status === "warned") {
      return {
        status: "warned",
        message: "Автоперевод пропущен: EN-twin защищён (manuallyEdited). Используйте ⟳ Force.",
      };
    }
    return { status: "error", message: `Автоперевод: неожиданный статус ${data.status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: "error", message: `Автоперевод не удался: ${msg}` };
  }
}
