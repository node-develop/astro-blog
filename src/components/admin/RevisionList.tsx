import React, { useState } from "react";
import { actions } from "astro:actions";
import RevisionDiff from "./RevisionDiff";

interface Revision {
  id: number;
  slug: string;
  body: string;
  createdAt: string;
  authorId: string;
}

interface Props {
  readonly slug: string;
  readonly items: readonly Revision[];
}

export default function RevisionList({ slug: _slug, items }: Props): React.JSX.Element {
  const [selected, setSelected] = useState<number | null>(items[0]?.id ?? null);
  const [restoring, setRestoring] = useState(false);

  const currentIdx = items.findIndex((i) => i.id === selected);
  const current = currentIdx >= 0 ? items[currentIdx] : undefined;
  const previous = current && currentIdx + 1 < items.length ? items[currentIdx + 1] : undefined;

  async function restore(id: number): Promise<void> {
    if (!confirm("Восстановить эту версию? Будет создана новая revision.")) return;
    setRestoring(true);
    const res = await actions.revisions.restore({ revisionId: id });
    setRestoring(false);
    if (res.error) alert(res.error.message ?? "Не удалось восстановить");
    else window.location.reload();
  }

  return (
    <div className="revision-list">
      <ul className="revision-list__items">
        {items.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => setSelected(r.id)}
              aria-current={selected === r.id ? "true" : undefined}
              className="revision-list__item"
            >
              <time>{new Date(r.createdAt).toLocaleString("ru-RU")}</time>
              <span className="revision-list__id">#{r.id}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="revision-list__detail">
        {current && (
          <>
            <header className="revision-list__detail-head">
              <span>Ревизия {current.id}</span>
              <button type="button" onClick={() => restore(current.id)} disabled={restoring}>
                Восстановить
              </button>
            </header>
            <RevisionDiff oldBody={previous?.body ?? ""} newBody={current.body} />
          </>
        )}
      </div>
      <style>{`
        .revision-list { display: grid; grid-template-columns: 240px 1fr; gap: var(--space-5); }
        .revision-list__items { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 2px; }
        .revision-list__item {
          display: flex; justify-content: space-between; align-items: baseline;
          width: 100%; text-align: left; padding: var(--space-2) var(--space-3);
          border: var(--stroke-hair) solid transparent; border-radius: var(--radius-md);
          background: transparent; cursor: pointer;
          font-family: var(--font-mono); font-size: var(--fs-xs);
          color: var(--color-fg-muted);
        }
        .revision-list__item:hover { background: var(--color-bg-elevated); }
        .revision-list__item[aria-current="true"] {
          background: var(--color-bg-elevated); color: var(--color-fg);
          box-shadow: inset var(--stroke-slab) 0 0 var(--color-fill);
        }
        .revision-list__id { color: var(--color-fg-subtle); }
        .revision-list__detail-head {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: var(--space-3);
          font-family: var(--font-mono); font-size: var(--fs-sm);
          color: var(--color-fg-muted);
        }
        .revision-list__detail-head button {
          font-family: var(--font-mono); font-size: var(--fs-xs);
          text-transform: uppercase; letter-spacing: var(--tracking-wide);
          color: var(--color-fg); background: transparent;
          border: var(--stroke-bold) solid var(--color-fg); border-radius: var(--radius-md);
          padding: var(--space-1) var(--space-3); cursor: pointer;
          transition:
            background var(--dur-fast) var(--ease-out),
            color var(--dur-fast) var(--ease-out),
            transform var(--dur-fast) var(--ease-out),
            box-shadow var(--dur-fast) var(--ease-out);
        }
        .revision-list__detail-head button:hover {
          background: var(--color-fill); color: var(--color-on-fill);
          transform: translate(-2px, -2px); box-shadow: var(--shadow-press);
        }
        .revision-list__detail-head button:active { transform: none; box-shadow: none; }
      `}</style>
    </div>
  );
}
