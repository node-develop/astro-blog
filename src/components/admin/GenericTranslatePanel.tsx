import React, { useState } from "react";
import PublishBar from "./PublishBar";

/**
 * Lightweight admin UI for the collection without a full CRUD editor —
 * projects. Author picks a slug from autocomplete and the shared
 * <PublishBar> drives the translate/publish actions.
 *
 * Source-of-truth slugs are passed in by the parent Astro page (it has
 * filesystem access and enumerates them at request time).
 */
interface Props {
  /** Project slugs, computed on the server. */
  readonly projectSlugs: ReadonlyArray<string>;
}

export default function GenericTranslatePanel({ projectSlugs }: Props): React.JSX.Element {
  const [slug, setSlug] = useState<string>("");

  return (
    <div className="generic-translate">
      <div className="generic-translate__row">
        <label className="generic-translate__field generic-translate__field--grow">
          <span>Slug</span>
          <input
            type="text"
            list="slugs-projects"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="astro-blog"
          />
          <datalist id="slugs-projects">
            {projectSlugs.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
      </div>

      <PublishBar collection="projects" slug={slug.trim() || null} />

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
        .generic-translate__field input {
          font-family: var(--font-mono); font-size: var(--fs-sm);
          padding: var(--space-2) var(--space-3);
          background: var(--color-bg-elevated);
          border: var(--stroke-bold) solid var(--color-fg);
          border-radius: var(--radius-md);
          color: var(--color-fg);
        }
      `}</style>
    </div>
  );
}
