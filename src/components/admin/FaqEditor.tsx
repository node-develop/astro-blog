import React from "react";

export interface FaqItem {
  question: string;
  answer: string;
}

interface Props {
  readonly value: ReadonlyArray<FaqItem>;
  readonly onChange: (next: FaqItem[]) => void;
}

const Q_MIN = 5;
const Q_MAX = 200;
const A_MIN = 20;
const A_MAX = 2000;

export default function FaqEditor({ value, onChange }: Props): React.JSX.Element {
  function update(idx: number, patch: Partial<FaqItem>): void {
    const next = value.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    onChange(next);
  }

  function remove(idx: number): void {
    onChange(value.filter((_, i) => i !== idx));
  }

  function add(): void {
    onChange([...value, { question: "", answer: "" }]);
  }

  return (
    <div className="faq-editor">
      {value.length === 0 && (
        <p className="faq-editor__empty">
          Часто задаваемые вопросы (FAQ) — отрисуются под телом статьи и в JSON-LD FAQPage.
          Опционально.
        </p>
      )}
      {value.map((it, idx) => {
        const qLen = it.question.length;
        const aLen = it.answer.length;
        const qBad = qLen > 0 && (qLen < Q_MIN || qLen > Q_MAX);
        const aBad = aLen > 0 && (aLen < A_MIN || aLen > A_MAX);
        return (
          <div key={idx} className="faq-editor__card">
            <div className="faq-editor__head">
              <span className="faq-editor__idx">#{idx + 1}</span>
              <button
                type="button"
                aria-label={`Удалить вопрос ${idx + 1}`}
                onClick={() => remove(idx)}
                className="faq-editor__remove"
              >
                ×
              </button>
            </div>
            <label className="faq-editor__field">
              <span>
                Вопрос{" "}
                <em className={qBad ? "is-bad" : ""}>
                  {qLen} / {Q_MAX}
                </em>
              </span>
              <textarea
                value={it.question}
                onChange={(e) => update(idx, { question: e.target.value })}
                rows={2}
                maxLength={Q_MAX + 50}
                placeholder="Чем отличается X от Y?"
              />
            </label>
            <label className="faq-editor__field">
              <span>
                Ответ{" "}
                <em className={aBad ? "is-bad" : ""}>
                  {aLen} / {A_MAX}
                </em>
              </span>
              <textarea
                value={it.answer}
                onChange={(e) => update(idx, { answer: e.target.value })}
                rows={5}
                maxLength={A_MAX + 200}
                placeholder="Развернутый ответ от 20 до 2000 символов."
              />
            </label>
          </div>
        );
      })}
      <button type="button" onClick={add} className="faq-editor__add">
        + добавить вопрос
      </button>

      <style>{`
        .faq-editor {
          display: flex; flex-direction: column; gap: var(--space-3);
          border: 1px dashed var(--color-border); border-radius: var(--radius-md);
          padding: var(--space-3); background: var(--color-bg);
        }
        .faq-editor__empty {
          font-family: var(--font-mono); font-size: var(--fs-xs);
          color: var(--color-fg-muted); margin: 0;
        }
        .faq-editor__card {
          display: flex; flex-direction: column; gap: var(--space-2);
          border: var(--stroke-bold) solid var(--color-fg); border-radius: var(--radius-md);
          padding: var(--space-3); background: var(--color-bg-elevated);
        }
        .faq-editor__head {
          display: flex; justify-content: space-between; align-items: center;
        }
        .faq-editor__idx {
          font-family: var(--font-mono); font-size: var(--fs-xs);
          color: var(--color-fg-muted);
        }
        .faq-editor__remove {
          background: transparent; border: none; cursor: pointer;
          color: var(--color-fg-muted); font-size: 18px; line-height: 1;
        }
        .faq-editor__remove:hover { color: var(--color-danger); }
        .faq-editor__field { display: flex; flex-direction: column; gap: var(--space-2); }
        .faq-editor__field > span {
          font-family: var(--font-mono); font-size: var(--fs-xs);
          text-transform: uppercase; letter-spacing: var(--tracking-wide);
          color: var(--color-fg-muted);
          display: flex; justify-content: space-between;
        }
        .faq-editor__field em {
          font-style: normal; color: var(--color-fg-muted);
        }
        .faq-editor__field em.is-bad { color: var(--color-danger); }
        .faq-editor__field textarea {
          font-family: var(--font-sans); font-size: var(--fs-sm);
          padding: var(--space-2) var(--space-3);
          border: var(--stroke-bold) solid var(--color-fg); border-radius: var(--radius-md);
          background: var(--color-bg); color: var(--color-fg);
          resize: vertical;
        }
        .faq-editor__add {
          align-self: flex-start;
          font-family: var(--font-mono); font-size: var(--fs-xs);
          text-transform: uppercase; letter-spacing: var(--tracking-wide);
          color: var(--color-fg); background: transparent;
          border: var(--stroke-bold) dashed var(--color-fg); border-radius: var(--radius-md);
          padding: var(--space-2) var(--space-3); cursor: pointer;
          transition:
            background var(--dur-fast) var(--ease-out),
            color var(--dur-fast) var(--ease-out);
        }
        .faq-editor__add:hover {
          background: var(--color-fill); color: var(--color-on-fill);
          border-style: solid;
        }
      `}</style>
    </div>
  );
}
