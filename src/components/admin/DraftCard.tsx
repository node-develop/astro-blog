import { useState, useEffect, useRef } from "react";
import { actions } from "astro:actions";
import type { CriticNote, SocialChannel } from "~/lib/social/types";

const LIMITS: Record<SocialChannel, number> = {
  x_en: 270,
  li_en: 1900,
  tg_ru: 600,
};

const CHANNEL_LABEL: Record<SocialChannel, string> = {
  x_en: "X (English)",
  li_en: "LinkedIn (English)",
  tg_ru: "Telegram (Russian)",
};

type DraftStatus =
  "generating" | "pending" | "sending" | "sent" | "failed" | "superseded" | "skipped";

export type DraftRow = {
  id: string;
  channel: SocialChannel;
  status: DraftStatus;
  body: string;
  threadTail: string[] | null;
  mediaUrl: string | null;
  criticAnnotations: CriticNote[] | null;
  externalUrl: string | null;
  errorMessage: string | null;
};

type SaveState = "idle" | "saving" | "saved" | "error";

export default function DraftCard({ row: initialRow }: { row: DraftRow }) {
  const [row, setRow] = useState<DraftRow>(initialRow);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const limit = LIMITS[row.channel];
  const blocked = (row.criticAnnotations ?? []).some((n) => n.severity === "block");
  const editable = row.status === "pending";
  const overLimit = row.body.length > limit;

  // Debounced auto-save — only fires when body/threadTail diverge from initial
  useEffect(() => {
    if (!editable) return;
    const bodyUnchanged = row.body === initialRow.body;
    const tailUnchanged = JSON.stringify(row.threadTail) === JSON.stringify(initialRow.threadTail);
    if (bodyUnchanged && tailUnchanged) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaveState("saving");
      const { error } = await actions.socialDrafts.save({
        id: row.id,
        body: row.body,
        threadTail: row.threadTail ?? undefined,
      });
      if (error) {
        setSaveState("error");
      } else {
        setSaveState("saved");
        setTimeout(() => setSaveState("idle"), 1500);
      }
    }, 800);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [row.body, row.threadTail, row.id, editable]);

  const onPublish = async () => {
    if (blocked && !confirm("Block-level critic notes present. Publish anyway?")) return;
    const { data, error } = await actions.socialDrafts.publish({ id: row.id, force: blocked });
    if (error) {
      setRow((r) => ({ ...r, status: "failed", errorMessage: error.message }));
    } else if (data.ok) {
      setRow((r) => ({ ...r, status: "sent", externalUrl: data.url }));
    } else {
      setRow((r) => ({ ...r, status: "failed", errorMessage: data.error }));
    }
  };

  const onSkip = async () => {
    const reason = prompt("Reason (optional):") ?? undefined;
    await actions.socialDrafts.skip({ id: row.id, reason });
    setRow((r) => ({ ...r, status: "skipped", errorMessage: reason ?? null }));
  };

  const onRecheck = async () => {
    const { data } = await actions.socialDrafts.recheck({ id: row.id });
    if (data?.ok) {
      setRow((r) => ({ ...r, criticAnnotations: data.annotations }));
    }
  };

  const setBody = (body: string) => setRow((r) => ({ ...r, body }));

  const setThread = (parts: string[]) =>
    setRow((r) => ({
      ...r,
      body: parts[0] ?? "",
      threadTail: parts.slice(1),
    }));

  const showThread = row.channel === "x_en" && row.threadTail != null && row.threadTail.length > 0;

  return (
    <article className="draft-card" data-channel={row.channel} data-row-id={row.id}>
      <header className="draft-card__header">
        <span className="draft-card__channel">
          {CHANNEL_LABEL[row.channel]}
          <span className={`badge badge--${row.status}`}>{row.status}</span>
        </span>
        <span className="draft-card__counter" data-overlimit={overLimit ? "true" : undefined}>
          {row.body.length}&thinsp;/&thinsp;{limit}
          {saveState === "saving" && " · saving…"}
          {saveState === "saved" && " · saved ✓"}
          {saveState === "error" && " · save failed"}
        </span>
      </header>

      {row.status === "generating" ? (
        <p className="draft-card__generating">Generating draft… reload in a few seconds.</p>
      ) : showThread ? (
        <ThreadEditor
          parts={[row.body, ...(row.threadTail ?? [])]}
          onChange={setThread}
          disabled={!editable}
        />
      ) : (
        <textarea
          className="draft-card__textarea"
          value={row.body}
          onChange={(e) => setBody(e.currentTarget.value)}
          disabled={!editable}
          rows={row.channel === "li_en" ? 14 : 6}
        />
      )}

      {(row.criticAnnotations ?? []).length > 0 && (
        <ul className="draft-card__notes">
          {(row.criticAnnotations ?? []).map((n, i) => (
            <li key={i} className={`annotation annotation--${n.severity}`}>
              <span aria-hidden="true">{n.severity === "block" ? "⛔" : "⚠"}</span>{" "}
              <strong>{n.kind}:</strong> {n.message}
            </li>
          ))}
        </ul>
      )}

      {row.externalUrl && (
        <p className="draft-card__external">
          Sent:{" "}
          <a href={row.externalUrl} target="_blank" rel="noreferrer" className="draft-card__link">
            {row.externalUrl}
          </a>
        </p>
      )}

      {row.errorMessage && row.status === "failed" && (
        <p className="draft-card__error">Error: {row.errorMessage}</p>
      )}

      {editable && (
        <div className="draft-card__actions">
          <button
            type="button"
            onClick={onPublish}
            className="draft-card__btn draft-card__btn--accent"
          >
            Publish{blocked ? " ⚠" : " ▸"}
          </button>
          <button type="button" onClick={onSkip} className="draft-card__btn draft-card__btn--ghost">
            Skip
          </button>
          <button
            type="button"
            onClick={onRecheck}
            className="draft-card__btn draft-card__btn--ghost"
          >
            ↻ Re-check
          </button>
        </div>
      )}

      <style>{`
        .draft-card__counter {
          font-family: var(--font-mono);
          font-size: var(--fs-xs);
          color: var(--color-fg-muted);
          white-space: nowrap;
        }
        .draft-card__counter[data-overlimit="true"] {
          color: var(--color-danger, crimson);
          font-weight: 600;
        }
        .draft-card__textarea {
          width: 100%;
          font-family: var(--font-sans);
          font-size: var(--fs-sm);
          color: var(--color-fg);
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          padding: var(--space-2) var(--space-3);
          resize: vertical;
          box-sizing: border-box;
        }
        .draft-card__textarea:focus {
          outline: 2px solid var(--color-accent);
          outline-offset: 1px;
        }
        .draft-card__textarea:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .draft-card__notes {
          list-style: none;
          margin: var(--space-3) 0 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
        }
        .draft-card__actions {
          display: flex;
          gap: var(--space-2);
          margin-top: var(--space-3);
          flex-wrap: wrap;
        }
        .draft-card__btn {
          font-family: var(--font-mono);
          font-size: var(--fs-xs);
          padding: var(--space-2) var(--space-4);
          border-radius: var(--radius-md);
          cursor: pointer;
          letter-spacing: var(--tracking-wide);
          text-transform: uppercase;
        }
        .draft-card__btn--accent {
          background: var(--color-accent);
          color: var(--color-bg);
          border: 1px solid var(--color-accent);
        }
        .draft-card__btn--accent:hover { background: var(--color-accent-hover); }
        .draft-card__btn--ghost {
          background: transparent;
          color: var(--color-fg);
          border: 1px solid var(--color-border);
        }
        .draft-card__btn--ghost:hover {
          border-color: var(--color-accent);
          color: var(--color-accent);
        }
        .draft-card__btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .draft-card__generating {
          font-size: var(--fs-sm);
          color: var(--color-fg-muted);
          margin: 0;
        }
        .thread-editor {
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .thread-editor__row {
          display: grid;
          grid-template-columns: 2rem 1fr auto;
          gap: var(--space-2);
          align-items: start;
        }
        .thread-editor__num {
          font-family: var(--font-mono);
          font-size: var(--fs-xs);
          color: var(--color-fg-muted);
          padding-top: var(--space-2);
          text-align: right;
        }
        .thread-editor__textarea {
          font-family: var(--font-sans);
          font-size: var(--fs-sm);
          color: var(--color-fg);
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          padding: var(--space-2) var(--space-3);
          resize: vertical;
          box-sizing: border-box;
          width: 100%;
        }
        .thread-editor__textarea:focus {
          outline: 2px solid var(--color-accent);
          outline-offset: 1px;
        }
        .thread-editor__textarea:disabled { opacity: 0.6; cursor: not-allowed; }
        .thread-editor__remove {
          font-family: var(--font-mono);
          font-size: var(--fs-sm);
          color: var(--color-fg-muted);
          background: transparent;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          padding: 0 var(--space-2);
          cursor: pointer;
          line-height: 1.6rem;
        }
        .thread-editor__remove:hover { color: var(--color-danger, crimson); border-color: var(--color-danger, crimson); }
        .thread-editor__add {
          font-family: var(--font-mono);
          font-size: var(--fs-xs);
          color: var(--color-fg-muted);
          background: transparent;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          padding: var(--space-1) var(--space-3);
          cursor: pointer;
          align-self: flex-start;
          margin-left: 2.5rem;
        }
        .thread-editor__add:hover { color: var(--color-accent); border-color: var(--color-accent); }
      `}</style>
    </article>
  );
}

function ThreadEditor({
  parts,
  onChange,
  disabled,
}: {
  parts: string[];
  onChange: (parts: string[]) => void;
  disabled: boolean;
}) {
  const setAt = (idx: number, value: string) => {
    const next = parts.slice();
    next[idx] = value;
    onChange(next);
  };

  const remove = (idx: number) => {
    if (idx === 0) return;
    const next = parts.slice();
    next.splice(idx, 1);
    onChange(next);
  };

  const add = () => onChange([...parts, ""]);

  return (
    <div className="thread-editor">
      {parts.map((text, i) => (
        <div key={i} className="thread-editor__row">
          <span className="thread-editor__num" aria-label={`Tweet ${i + 1} of ${parts.length}`}>
            {i + 1}/{parts.length}
          </span>
          <textarea
            className="thread-editor__textarea"
            value={text}
            onChange={(e) => setAt(i, e.currentTarget.value)}
            disabled={disabled}
            rows={3}
          />
          {i > 0 && !disabled && (
            <button
              type="button"
              onClick={() => remove(i)}
              className="thread-editor__remove"
              aria-label={`Remove tweet ${i + 1}`}
            >
              ×
            </button>
          )}
        </div>
      ))}
      {!disabled && (
        <button type="button" onClick={add} className="thread-editor__add">
          + Add tweet
        </button>
      )}
    </div>
  );
}
