import React from "react";
import TagInput from "./TagInput";
import MediaPicker from "./MediaPicker";
import FaqEditor, { type FaqItem } from "./FaqEditor";

export interface FrontmatterInput {
  title: string;
  description: string;
  /** TL;DR card (60..280). Empty string = "not set". */
  summary: string;
  /** Semantic keywords for retrieval (distinct from tag slugs). */
  keywords: string[];
  /** Optional FAQ rendered under the body and in JSON-LD FAQPage. */
  faq: FaqItem[];
  pubDate: string; // yyyy-mm-dd
  updatedDate: string | null;
  tags: string[];
  draft: boolean;
  cover: string | null;
  coverAlt: string | null;
}

interface Props {
  readonly value: FrontmatterInput;
  readonly onChange: (next: FrontmatterInput) => void;
}

export default function FrontmatterForm({ value, onChange }: Props): React.JSX.Element {
  function set<K extends keyof FrontmatterInput>(key: K, v: FrontmatterInput[K]): void {
    onChange({ ...value, [key]: v });
  }

  const descBad = value.description.length > 0 && value.description.length > 200;
  const summaryBad =
    value.summary.length > 0 && (value.summary.length < 60 || value.summary.length > 280);

  return (
    <div className="fm-form">
      <label className="fm-form__field">
        <span>Заголовок</span>
        <input
          type="text"
          value={value.title}
          onChange={(e) => set("title", e.target.value)}
          maxLength={120}
        />
      </label>
      <label className="fm-form__field">
        <span>
          Описание <em className={descBad ? "is-bad" : ""}>{value.description.length} / 200</em>
        </span>
        <textarea
          value={value.description}
          onChange={(e) => set("description", e.target.value)}
          rows={3}
          maxLength={200}
        />
      </label>
      <label className="fm-form__field">
        <span>
          TL;DR (summary){" "}
          <em className={summaryBad ? "is-bad" : ""}>{value.summary.length} / 280</em>
        </span>
        <textarea
          value={value.summary}
          onChange={(e) => set("summary", e.target.value)}
          rows={4}
          maxLength={280}
          placeholder="60–280 символов. Опционально, но обязательно для постов после 2026-05-02."
        />
      </label>
      <div className="fm-form__field" role="group" aria-label="Ключевые слова (keywords)">
        <span aria-hidden="true">Keywords (для семантического поиска)</span>
        <TagInput value={value.keywords} onChange={(next) => set("keywords", next)} />
      </div>
      <div className="fm-form__field" role="group" aria-label="FAQ">
        <span aria-hidden="true">FAQ</span>
        <FaqEditor value={value.faq} onChange={(next) => set("faq", next)} />
      </div>
      <div className="fm-form__row">
        <label className="fm-form__field">
          <span>Дата публикации</span>
          <input
            type="date"
            value={value.pubDate}
            onChange={(e) => set("pubDate", e.target.value)}
          />
        </label>
        <label className="fm-form__field">
          <span>Дата обновления</span>
          <input
            type="date"
            value={value.updatedDate ?? ""}
            onChange={(e) => set("updatedDate", e.target.value === "" ? null : e.target.value)}
          />
        </label>
      </div>
      <div className="fm-form__field" role="group" aria-label="Теги">
        <span aria-hidden="true">Теги</span>
        <TagInput value={value.tags} onChange={(next) => set("tags", next)} />
      </div>
      <div className="fm-form__field" role="group" aria-label="Обложка">
        <span aria-hidden="true">Обложка</span>
        <MediaPicker value={value.cover} onChange={(path) => set("cover", path)} />
      </div>
      <label className="fm-form__field">
        <span>Alt-текст обложки</span>
        <input
          type="text"
          value={value.coverAlt ?? ""}
          onChange={(e) => set("coverAlt", e.target.value === "" ? null : e.target.value)}
        />
      </label>
      <label className="fm-form__checkbox">
        <input
          type="checkbox"
          checked={value.draft}
          onChange={(e) => set("draft", e.target.checked)}
        />
        <span>Черновик (draft)</span>
      </label>

      <style>{`
        .fm-form { display: flex; flex-direction: column; gap: var(--space-4); }
        .fm-form__field { display: flex; flex-direction: column; gap: var(--space-2); }
        .fm-form__field > span {
          font-family: var(--font-mono); font-size: var(--fs-xs);
          text-transform: uppercase; letter-spacing: var(--tracking-wide);
          color: var(--color-fg-muted);
          display: flex; justify-content: space-between; align-items: baseline;
        }
        .fm-form__field > span > em {
          font-style: normal; color: var(--color-fg-muted);
          text-transform: none; letter-spacing: 0;
        }
        .fm-form__field > span > em.is-bad { color: var(--color-danger); }
        .fm-form__field input[type="text"],
        .fm-form__field input[type="date"],
        .fm-form__field textarea {
          font-family: var(--font-sans); font-size: var(--fs-base);
          padding: var(--space-2) var(--space-3);
          border: 1px solid var(--color-border); border-radius: var(--radius-md);
          background: var(--color-bg); color: var(--color-fg);
        }
        .fm-form__row {
          display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4);
        }
        .fm-form__checkbox {
          display: flex; gap: var(--space-2); align-items: center;
          font-family: var(--font-mono); font-size: var(--fs-sm);
        }
      `}</style>
    </div>
  );
}
