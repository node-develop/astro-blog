import React, { useState } from "react";

export interface PostListItem {
  slug: string;
  title: string;
  description: string;
  pubDate: string;
  draft: boolean;
  tags: readonly string[];
  order: number;
  pinned: boolean;
  hidden: boolean;
}

interface Props {
  readonly initial: readonly PostListItem[];
}

export default function PostList({ initial }: Props): React.JSX.Element {
  const [items] = useState(initial);
  return (
    <ul className="post-list">
      {items.map((p) => (
        <li key={p.slug} className="post-list__item">
          <span className="post-list__order">{String(p.order).padStart(2, "0")}</span>
          <div className="post-list__body">
            <a href={`/admin/posts/${encodeURIComponent(p.slug)}`} className="post-list__title">
              {p.title}
            </a>
            <p className="post-list__desc">{p.description}</p>
            <div className="post-list__meta">
              <time>{new Date(p.pubDate).toLocaleDateString("ru-RU")}</time>
              {p.draft && <span className="post-list__flag">draft</span>}
              {p.hidden && <span className="post-list__flag">скрыт</span>}
              {p.pinned && <span className="post-list__flag post-list__flag--accent">pinned</span>}
            </div>
          </div>
        </li>
      ))}
      <style>{`
        .post-list { list-style: none; padding: 0; margin: 0; }
        .post-list__item {
          display: grid;
          grid-template-columns: 36px 1fr;
          gap: var(--space-4);
          padding: var(--space-4) 0;
          border-top: 1px solid var(--color-border);
        }
        .post-list__order {
          font-family: var(--font-mono);
          font-size: var(--fs-sm);
          color: var(--color-fg-subtle);
          font-variant-numeric: tabular-nums;
        }
        .post-list__title {
          font-family: var(--font-serif);
          font-size: var(--fs-lg);
          color: var(--color-fg);
          text-decoration: none;
        }
        .post-list__title:hover { color: var(--color-accent-hover); }
        .post-list__desc {
          margin: var(--space-1) 0 var(--space-2) 0;
          color: var(--color-fg-muted);
        }
        .post-list__meta {
          display: flex;
          gap: var(--space-3);
          align-items: center;
          font-family: var(--font-mono);
          font-size: var(--fs-xs);
          color: var(--color-fg-subtle);
        }
        .post-list__flag {
          padding: 1px 6px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
        }
        .post-list__flag--accent {
          border-color: var(--color-accent);
          color: var(--color-accent);
        }
      `}</style>
    </ul>
  );
}
