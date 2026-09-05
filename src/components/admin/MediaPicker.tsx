import React, { useEffect, useState } from "react";
import { actions } from "astro:actions";

interface Asset {
  id: number;
  path: string;
  originalName: string;
}

interface Props {
  readonly value: string | null;
  readonly onChange: (path: string | null) => void;
}

export default function MediaPicker({ value, onChange }: Props): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<readonly Asset[]>([]);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const res = await actions.media.list({});
      if (!res.error) {
        setItems(
          res.data.items.map((a) => ({
            id: a.id,
            path: a.path,
            originalName: a.originalName,
          })),
        );
      }
    })();
  }, [open]);

  // `cover` is either an upload-relative path (`2026/05/x.png`) or a site-absolute
  // one (`/og-default.svg`, `https://…`); only the former lives under /uploads/.
  const previewSrc = value && /^(\/|https?:)/.test(value) ? value : `/uploads/${value ?? ""}`;

  return (
    <div className="media-picker">
      {value ? (
        <div className="media-picker__current">
          <img src={previewSrc} alt="" />
          <button type="button" onClick={() => onChange(null)}>
            Убрать
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)}>
          Выбрать обложку
        </button>
      )}
      {open && (
        <div className="media-picker__dialog" role="dialog" aria-label="Выбор обложки">
          <button
            type="button"
            className="media-picker__close"
            onClick={() => setOpen(false)}
            aria-label="Закрыть"
          >
            ×
          </button>
          <ul>
            {items.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(a.path);
                    setOpen(false);
                  }}
                >
                  <img src={`/uploads/${a.path}`} alt={a.originalName} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <style>{`
        .media-picker__current { display: flex; gap: var(--space-3); align-items: center; }
        .media-picker__current img { height: 60px; border-radius: var(--radius-md); }
        .media-picker__current button {
          font-family: var(--font-mono); font-size: var(--fs-xs);
          color: var(--color-fg-muted); background: transparent;
          border: 1px solid var(--color-border); border-radius: var(--radius-sm);
          padding: var(--space-1) var(--space-2); cursor: pointer;
        }
        .media-picker__dialog {
          position: fixed; inset: 10vh 10vw; max-height: 80vh; overflow: auto;
          background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-lg);
          padding: var(--space-5); z-index: 100;
          box-shadow: var(--shadow-lifted);
        }
        .media-picker__close {
          position: absolute; top: var(--space-3); right: var(--space-3);
          background: transparent; border: 1px solid var(--color-border); border-radius: var(--radius-sm);
          padding: 2px 8px; cursor: pointer; color: var(--color-fg-muted);
        }
        .media-picker__dialog ul {
          list-style: none; padding: 0; margin: var(--space-3) 0 0 0;
          display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
          gap: var(--space-3);
        }
        .media-picker__dialog ul li button {
          border: 1px solid var(--color-border); border-radius: var(--radius-md);
          padding: 0; cursor: pointer; background: transparent;
          width: 100%;
        }
        .media-picker__dialog ul li button img {
          width: 100%; aspect-ratio: 1; object-fit: cover; display: block;
        }
        .media-picker__dialog ul li button:hover {
          border-color: var(--color-accent);
        }
      `}</style>
    </div>
  );
}
