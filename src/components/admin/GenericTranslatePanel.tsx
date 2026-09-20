import React, { useMemo, useState } from "react";
import PublishBar from "./PublishBar";

/**
 * Lightweight admin UI for collections without a full CRUD editor — projects,
 * courses, lessons. Author picks (collection, slug) from autocomplete and the
 * shared <PublishBar> drives the translate/publish actions.
 *
 * Source-of-truth slugs are passed in by the parent Astro page (it has
 * filesystem access and enumerates them at request time).
 */
type Collection = "projects" | "courses" | "lessons";

interface Props {
  /** Slug list per collection, computed on the server. */
  readonly slugsByCollection: Record<Collection, ReadonlyArray<string>>;
}

export default function GenericTranslatePanel({ slugsByCollection }: Props): React.JSX.Element {
  const [collection, setCollection] = useState<Collection>("projects");
  const [slug, setSlug] = useState<string>("");

  const slugs = useMemo(() => slugsByCollection[collection] ?? [], [slugsByCollection, collection]);

  return (
    <div className="generic-translate">
      <div className="generic-translate__row">
        <label className="generic-translate__field">
          <span>Коллекция</span>
          <select
            value={collection}
            onChange={(e) => {
              setCollection(e.target.value as Collection);
              setSlug("");
            }}
          >
            <option value="projects">projects</option>
            <option value="courses">courses</option>
            <option value="lessons">lessons</option>
          </select>
        </label>
        <label className="generic-translate__field generic-translate__field--grow">
          <span>Slug</span>
          <input
            type="text"
            list={`slugs-${collection}`}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder={
              collection === "lessons" ? "claude-code-guide/01-introduction" : "astro-blog"
            }
          />
          <datalist id={`slugs-${collection}`}>
            {slugs.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
      </div>

      <PublishBar collection={collection} slug={slug.trim() || null} />

      <p className="generic-translate__hint">
        Для <code>lessons</code> используйте формат <code>{`<course>/<lesson>`}</code>, например
        <code> claude-code-guide/01-introduction</code>.
      </p>

      <style>{`
        .generic-translate {
          display: flex; flex-direction: column; gap: var(--space-4);
        }
        .generic-translate__row {
          display: flex; gap: var(--space-3); flex-wrap: wrap;
        }
        .generic-translate__field {
          display: flex; flex-direction: column; gap: var(--space-1);
          font-family: var(--font-mono); font-size: var(--fs-xs);
          color: var(--color-fg-muted);
        }
        .generic-translate__field--grow { flex: 1; min-width: 240px; }
        .generic-translate__field input,
        .generic-translate__field select {
          font-family: var(--font-mono); font-size: var(--fs-sm);
          padding: var(--space-2) var(--space-3);
          background: var(--color-bg-elevated);
          border: var(--stroke-bold) solid var(--color-fg);
          border-radius: var(--radius-md);
          color: var(--color-fg);
        }
        .generic-translate__hint {
          font-family: var(--font-mono); font-size: var(--fs-xs);
          color: var(--color-fg-muted); margin: 0;
        }
        .generic-translate__hint code {
          color: var(--color-accent);
        }
      `}</style>
    </div>
  );
}
