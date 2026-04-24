import React from "react";
import TagInput from "./TagInput";
import MediaPicker from "./MediaPicker";

export interface FrontmatterInput {
  title: string;
  description: string;
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
        <span>Описание</span>
        <textarea
          value={value.description}
          onChange={(e) => set("description", e.target.value)}
          rows={3}
          maxLength={300}
        />
      </label>
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
      <div className="fm-form__field">
        <span>Теги</span>
        <TagInput value={value.tags} onChange={(next) => set("tags", next)} />
      </div>
      <div className="fm-form__field">
        <span>Обложка</span>
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
        }
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
