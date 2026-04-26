import React from "react";

export interface MediaAssetView {
  id: number;
  path: string;
  originalName: string;
  mimeType: string;
  width: number;
  height: number;
  byteSize: number;
  uploadedAt: string;
}

interface Props {
  readonly items: readonly MediaAssetView[];
}

export default function MediaGrid({ items }: Props): React.JSX.Element {
  return (
    <ul className="media-grid">
      {items.map((asset) => (
        <li key={asset.id}>
          <figure>
            <img src={`/uploads/${asset.path}`} alt={asset.originalName} loading="lazy" />
            <figcaption>
              <span>{asset.originalName}</span>
              <code>
                {asset.width}×{asset.height}
              </code>
            </figcaption>
          </figure>
        </li>
      ))}
      <style>{`
        .media-grid {
          list-style: none; padding: 0; margin: var(--space-6) 0 0 0;
          display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: var(--space-4);
        }
        figure { margin: 0; display: flex; flex-direction: column; gap: var(--space-2); }
        figure img {
          width: 100%; aspect-ratio: 4/3; object-fit: cover;
          border-radius: var(--radius-md); border: 1px solid var(--color-border);
        }
        figcaption {
          display: flex; justify-content: space-between; align-items: center;
          font-family: var(--font-mono); font-size: var(--fs-xs); color: var(--color-fg-muted);
        }
      `}</style>
    </ul>
  );
}
