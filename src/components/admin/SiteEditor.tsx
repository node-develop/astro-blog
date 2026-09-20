import React, { useState } from "react";
import { actions } from "astro:actions";
import PostEditor from "./PostEditor";
import PublishBar, { maybeAutoTranslate } from "./PublishBar";

interface Props {
  readonly slug: string;
  readonly initial: { title: string; body: string };
}

export default function SiteEditor({ slug, initial }: Props): React.JSX.Element {
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const save = async (): Promise<void> => {
    setStatus("saving");
    setErrorMsg(null);
    setNotice(null);
    const result = await actions.site.update({ slug, title, body });
    if (result.error) {
      setStatus("error");
      setErrorMsg(result.error.message ?? "Не удалось сохранить");
      return;
    }
    setStatus("saved");
    // Auto-translate if opted in via PublishBar; failures are shown, not swallowed.
    void maybeAutoTranslate("site", slug).then((outcome) => {
      if (outcome.message !== null) setNotice(outcome.message);
    });
    setTimeout(() => setStatus("idle"), 1200);
  };

  return (
    <div className="editor-shell">
      <div className="fm-form__field">
        <label htmlFor="site-title">Заголовок</label>
        <input
          id="site-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          className="site-editor__title-input"
        />
      </div>
      <PostEditor value={body} onChange={setBody} />
      <div className="editor-shell__bar">
        <button
          type="button"
          onClick={save}
          disabled={status === "saving"}
          className="editor-shell__save"
        >
          {status === "saving" ? "Сохраняю…" : "Сохранить"}
        </button>
        {status === "saved" && <span className="editor-shell__hint">Сохранено</span>}
        {status === "error" && errorMsg && (
          <span role="alert" className="editor-shell__error">
            {errorMsg}
          </span>
        )}
      </div>
      {notice && (
        <div role="status" className="editor-shell__notice">
          {notice}
          <button
            type="button"
            aria-label="Закрыть уведомление"
            onClick={() => setNotice(null)}
            className="editor-shell__notice-close"
          >
            ×
          </button>
        </div>
      )}
      <PublishBar collection="site" slug={slug} disabled={status === "saving"} />

      <style>{`
        .site-editor__title-input {
          width: 100%;
          font-family: var(--font-mono);
          font-size: var(--fs-sm);
          padding: var(--space-2) var(--space-3);
          background: var(--color-bg-elevated);
          border: var(--stroke-bold) solid var(--color-fg);
          border-radius: var(--radius-md);
          color: var(--color-fg);
          box-sizing: border-box;
        }
        .site-editor__title-input:focus {
          outline: 2px solid var(--color-accent);
          outline-offset: 1px;
        }
        .fm-form__field {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
          font-family: var(--font-mono);
          font-size: var(--fs-sm);
          color: var(--color-fg-muted);
        }
        .site-editor__note {
          font-family: var(--font-mono);
          font-size: var(--fs-xs);
          color: var(--color-fg-muted);
          margin: 0;
        }
        .site-editor__note code {
          color: var(--color-accent);
        }
        .editor-shell__notice {
          display: flex; justify-content: space-between; align-items: center;
          gap: var(--space-3); padding: var(--space-3) var(--space-4);
          background: var(--color-bg-elevated);
          border: var(--stroke-bold) solid var(--color-fg); border-radius: var(--radius-md);
          font-family: var(--font-mono); font-size: var(--fs-xs);
          color: var(--color-fg);
        }
        .editor-shell__notice-close {
          background: transparent; border: none; cursor: pointer;
          color: var(--color-fg-muted); font-size: 16px; line-height: 1;
        }
      `}</style>
    </div>
  );
}
