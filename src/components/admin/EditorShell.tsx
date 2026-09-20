import React, { useState } from "react";
import { actions } from "astro:actions";
import FrontmatterForm, { type FrontmatterInput } from "./FrontmatterForm";
import PostEditor from "./PostEditor";
import PublishBar, { maybeAutoTranslate } from "./PublishBar";

interface Props {
  readonly slug: string | null;
  readonly initial: {
    frontmatter: FrontmatterInput;
    body: string;
  };
}

export default function EditorShell({ slug: propsSlug, initial }: Props): React.JSX.Element {
  const [slug, setSlug] = useState(propsSlug ?? "");
  const [frontmatter, setFrontmatter] = useState(initial.frontmatter);
  const [body, setBody] = useState(initial.body);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const slugOk = /^[a-z0-9][a-z0-9-]*$/.test(slug);

  function noticeFromWarnings(warnings: ReadonlyArray<string> | undefined): string | null {
    if (!warnings || warnings.length === 0) return null;
    const messages: string[] = [];
    if (warnings.includes("body_had_frontmatter")) {
      messages.push("⚠️ Я нашёл YAML-блок в начале тела и убрал его — поля переноси в форму выше.");
    }
    return messages.length === 0 ? null : messages.join(" ");
  }

  async function save(): Promise<void> {
    if (!slugOk) {
      setStatus("error");
      setErrorMsg("Слаг не прошёл валидацию");
      return;
    }
    setStatus("saving");
    setErrorMsg(null);
    setNotice(null);
    const payload = {
      slug,
      frontmatter: {
        title: frontmatter.title,
        description: frontmatter.description,
        pubDate: new Date(frontmatter.pubDate),
        tags: frontmatter.tags,
        draft: frontmatter.draft,
        keywords: frontmatter.keywords,
        ...(frontmatter.updatedDate ? { updatedDate: new Date(frontmatter.updatedDate) } : {}),
        ...(frontmatter.cover ? { cover: frontmatter.cover } : {}),
        ...(frontmatter.coverAlt ? { coverAlt: frontmatter.coverAlt } : {}),
        ...(frontmatter.summary && frontmatter.summary.length > 0
          ? { summary: frontmatter.summary }
          : {}),
        ...(frontmatter.faq.length > 0 ? { faq: frontmatter.faq } : {}),
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
    // Surface server-side warnings (e.g. body had its own frontmatter that we stripped).
    const note = noticeFromWarnings(result.data.warnings);
    if (note !== null) setNotice(note);
    if (propsSlug === null) {
      window.location.href = `/admin/posts/${encodeURIComponent(slug)}/`;
      return;
    }
    setStatus("saved");
    // Auto-translate if the author opted in via PublishBar. The save already
    // succeeded; a translate failure is surfaced as a notice, not swallowed.
    void maybeAutoTranslate("posts", slug).then((outcome) => {
      if (outcome.message !== null) setNotice(outcome.message);
    });
    setTimeout(() => setStatus("idle"), 1200);
  }

  return (
    <div className="editor-shell">
      {propsSlug === null && (
        <div className="editor-shell__slug">
          <label className="fm-form__field">
            <span>Slug</span>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="my-new-post"
              maxLength={100}
            />
            {slug !== "" && !slugOk && (
              <span className="editor-shell__error">
                Слаг: только a–z, 0–9 и дефисы; должен начинаться с буквы или цифры
              </span>
            )}
          </label>
        </div>
      )}
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
      {propsSlug !== null && (
        <PublishBar collection="posts" slug={propsSlug} disabled={status === "saving"} />
      )}

      <style>{`
        .editor-shell { display: flex; flex-direction: column; gap: var(--space-5); }
        .editor-shell__bar {
          display: flex; gap: var(--space-4); align-items: center;
          position: sticky; bottom: var(--space-4);
          padding: var(--space-3) var(--space-4);
          background: var(--color-bg-elevated);
          border: var(--stroke-bold) solid var(--color-fg);
          border-radius: var(--radius-md);
        }
        .editor-shell__save {
          font-family: var(--font-mono); font-size: var(--fs-sm);
          text-transform: uppercase; letter-spacing: var(--tracking-wide);
          color: var(--color-on-fill); background: var(--color-fill);
          border: var(--stroke-bold) solid var(--color-fg); padding: var(--space-2) var(--space-4);
          border-radius: var(--radius-md); cursor: pointer;
          box-shadow: var(--shadow-press);
          transition:
            transform var(--dur-fast) var(--ease-out),
            box-shadow var(--dur-fast) var(--ease-out);
        }
        .editor-shell__save:not(:disabled):hover {
          transform: translate(-2px, -2px); box-shadow: 5px 5px 0 var(--color-shadow);
        }
        .editor-shell__save:not(:disabled):active { transform: none; box-shadow: none; }
        .editor-shell__save:disabled { opacity: 0.6; cursor: not-allowed; box-shadow: none; }
        .editor-shell__hint {
          font-family: var(--font-mono); font-size: var(--fs-xs);
          color: var(--color-fg-muted);
        }
        .editor-shell__error {
          font-family: var(--font-mono); font-size: var(--fs-xs);
          color: var(--color-danger);
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
