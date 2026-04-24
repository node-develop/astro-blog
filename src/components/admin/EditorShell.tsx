import React, { useState } from "react";
import { actions } from "astro:actions";
import FrontmatterForm, { type FrontmatterInput } from "./FrontmatterForm";
import PostEditor from "./PostEditor";

interface Props {
  readonly slug: string;
  readonly initial: {
    frontmatter: FrontmatterInput;
    body: string;
  };
}

export default function EditorShell({ slug, initial }: Props): React.JSX.Element {
  const [frontmatter, setFrontmatter] = useState(initial.frontmatter);
  const [body, setBody] = useState(initial.body);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function save(): Promise<void> {
    setStatus("saving");
    setErrorMsg(null);
    const payload = {
      slug,
      frontmatter: {
        title: frontmatter.title,
        description: frontmatter.description,
        pubDate: new Date(frontmatter.pubDate),
        tags: frontmatter.tags,
        draft: frontmatter.draft,
        ...(frontmatter.updatedDate ? { updatedDate: new Date(frontmatter.updatedDate) } : {}),
        ...(frontmatter.cover ? { cover: frontmatter.cover } : {}),
        ...(frontmatter.coverAlt ? { coverAlt: frontmatter.coverAlt } : {}),
      },
      body,
    };
    const result = await actions.posts.upsert(payload);
    if (result.error) {
      setStatus("error");
      setErrorMsg(result.error.message ?? "Не удалось сохранить");
      return;
    }
    if (!result.data.ok) {
      setStatus("error");
      setErrorMsg(result.data.error ?? "Не удалось сохранить");
      return;
    }
    setStatus("saved");
    setTimeout(() => setStatus("idle"), 1200);
  }

  return (
    <div className="editor-shell">
      <FrontmatterForm value={frontmatter} onChange={setFrontmatter} />
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

      <style>{`
        .editor-shell { display: flex; flex-direction: column; gap: var(--space-5); }
        .editor-shell__bar {
          display: flex; gap: var(--space-4); align-items: center;
          position: sticky; bottom: var(--space-4);
          padding: var(--space-3) var(--space-4);
          background: var(--color-bg-elevated);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
        }
        .editor-shell__save {
          font-family: var(--font-mono); font-size: var(--fs-sm);
          color: var(--color-bg); background: var(--color-accent);
          border: 1px solid var(--color-accent); padding: var(--space-2) var(--space-4);
          border-radius: var(--radius-md); cursor: pointer;
        }
        .editor-shell__save:hover { background: var(--color-accent-hover); }
        .editor-shell__save:disabled { opacity: 0.6; cursor: not-allowed; }
        .editor-shell__hint {
          font-family: var(--font-mono); font-size: var(--fs-xs);
          color: var(--color-fg-muted);
        }
        .editor-shell__error {
          font-family: var(--font-mono); font-size: var(--fs-xs);
          color: var(--color-danger);
        }
      `}</style>
    </div>
  );
}
