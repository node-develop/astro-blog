import React, { useState, type KeyboardEvent } from "react";

interface Props {
  readonly value: readonly string[];
  readonly onChange: (next: string[]) => void;
}

export default function TagInput({ value, onChange }: Props): React.JSX.Element {
  const [draft, setDraft] = useState("");

  function commit(): void {
    const trimmed = draft.trim().replace(/^#/, "");
    if (!trimmed) return;
    if (value.includes(trimmed)) {
      setDraft("");
      return;
    }
    onChange([...value, trimmed]);
    setDraft("");
  }

  function remove(tag: string): void {
    onChange(value.filter((t) => t !== tag));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="tag-input">
      {value.map((tag) => (
        <span key={tag} className="tag-input__chip">
          #{tag}
          <button type="button" aria-label={`Удалить тег ${tag}`} onClick={() => remove(tag)}>
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        placeholder="Тег и Enter"
      />
      <style>{`
        .tag-input {
          display: flex; flex-wrap: wrap; gap: var(--space-2);
          border: 1px solid var(--color-border); border-radius: var(--radius-md);
          padding: var(--space-2); background: var(--color-bg);
        }
        .tag-input__chip {
          display: inline-flex; align-items: center; gap: 4px;
          font-family: var(--font-mono); font-size: var(--fs-xs);
          padding: 2px 8px; background: var(--color-bg-elevated);
          border-radius: var(--radius-pill);
        }
        .tag-input__chip button {
          background: transparent; border: none; cursor: pointer;
          color: var(--color-fg-muted); font-size: 14px; line-height: 1;
        }
        .tag-input input {
          flex: 1; min-width: 120px; border: none; outline: none; background: transparent;
          font-family: var(--font-sans); font-size: var(--fs-sm);
        }
      `}</style>
    </div>
  );
}
