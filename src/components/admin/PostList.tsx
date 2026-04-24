import React, { useState, useMemo } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { actions } from "astro:actions";

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

interface RowProps {
  item: PostListItem;
  index: number;
  onToggleHidden: (item: PostListItem) => void;
  onTogglePinned: (item: PostListItem) => void;
}

function SortableRow({ item, index, onToggleHidden, onTogglePinned }: RowProps): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.slug,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <li ref={setNodeRef} style={style} className="post-list__item" {...attributes}>
      <button
        type="button"
        className="post-list__handle"
        aria-label={`Перетащить "${item.title}"`}
        {...listeners}
      >
        ⋮⋮
      </button>
      <span className="post-list__order" aria-hidden="true">
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className="post-list__body">
        <a href={`/admin/posts/${encodeURIComponent(item.slug)}`} className="post-list__title">
          {item.title}
        </a>
        <p className="post-list__desc">{item.description}</p>
        <div className="post-list__meta">
          <time>{new Date(item.pubDate).toLocaleDateString("ru-RU")}</time>
          {item.draft && <span className="post-list__flag">draft</span>}
          <button
            type="button"
            className={`post-list__toggle ${item.hidden ? "post-list__toggle--on" : ""}`}
            aria-pressed={item.hidden}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onToggleHidden(item);
            }}
          >
            {item.hidden ? "скрыт" : "видим"}
          </button>
          <button
            type="button"
            className={`post-list__toggle ${item.pinned ? "post-list__toggle--accent" : ""}`}
            aria-pressed={item.pinned}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onTogglePinned(item);
            }}
          >
            {item.pinned ? "pinned" : "pin"}
          </button>
        </div>
      </div>
    </li>
  );
}

export default function PostList({ initial }: Props): React.JSX.Element {
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = useMemo(() => items.map((i) => i.slug), [items]);

  async function toggleHidden(item: PostListItem): Promise<void> {
    const previous = items;
    const next = items.map((i) => (i.slug === item.slug ? { ...i, hidden: !item.hidden } : i));
    setItems(next);
    const res = await actions.posts.setVisibility({
      slug: item.slug,
      hiddenFromList: !item.hidden,
    });
    if (res.error) setItems(previous);
  }

  async function togglePinned(item: PostListItem): Promise<void> {
    const previous = items;
    const next = items.map((i) => (i.slug === item.slug ? { ...i, pinned: !item.pinned } : i));
    setItems(next);
    const res = await actions.posts.setPinned({ slug: item.slug, pinned: !item.pinned });
    if (res.error) setItems(previous);
  }

  async function handleDragEnd(event: DragEndEvent): Promise<void> {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.slug === active.id);
    const newIndex = items.findIndex((i) => i.slug === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const previous = items;
    const next = arrayMove([...items], oldIndex, newIndex);
    setItems(next);
    setPending(true);
    setError(null);

    const result = await actions.posts.reorder({ slugs: next.map((i) => i.slug) });
    setPending(false);
    if (result.error) {
      setItems(previous);
      setError(result.error.message ?? "Не удалось сохранить порядок");
    }
  }

  return (
    <div>
      {error && (
        <div role="alert" className="post-list__error">
          {error}
        </div>
      )}
      {pending && (
        <div role="status" className="post-list__status">
          Сохраняю порядок…
        </div>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul className="post-list">
            {items.map((item, index) => (
              <SortableRow
                key={item.slug}
                item={item}
                index={index}
                onToggleHidden={toggleHidden}
                onTogglePinned={togglePinned}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <style>{`
        .post-list { list-style: none; padding: 0; margin: 0; }
        .post-list__item {
          display: grid;
          grid-template-columns: 28px 36px 1fr;
          gap: var(--space-3);
          padding: var(--space-4) 0;
          border-top: 1px solid var(--color-border);
          align-items: start;
          background: var(--color-bg);
        }
        .post-list__handle {
          background: transparent;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          color: var(--color-fg-subtle);
          cursor: grab;
          padding: var(--space-1) 0;
          font-family: var(--font-mono);
          font-size: var(--fs-xs);
        }
        .post-list__handle:active { cursor: grabbing; }
        .post-list__order {
          font-family: var(--font-mono);
          font-size: var(--fs-sm);
          color: var(--color-fg-subtle);
          font-variant-numeric: tabular-nums;
          padding-top: 2px;
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
          display: flex; gap: var(--space-3); align-items: center;
          font-family: var(--font-mono); font-size: var(--fs-xs); color: var(--color-fg-subtle);
        }
        .post-list__flag {
          padding: 1px 6px; border: 1px solid var(--color-border); border-radius: var(--radius-sm);
        }
        .post-list__flag--accent {
          border-color: var(--color-accent); color: var(--color-accent);
        }
        .post-list__toggle {
          font-family: var(--font-mono);
          font-size: var(--fs-xs);
          color: var(--color-fg-subtle);
          background: transparent;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          padding: 1px 6px;
          cursor: pointer;
        }
        .post-list__toggle:hover {
          color: var(--color-fg);
          border-color: var(--color-fg-subtle);
        }
        .post-list__toggle--on {
          color: var(--color-fg);
          background: var(--color-bg-elevated);
        }
        .post-list__toggle--accent {
          color: var(--color-accent);
          border-color: var(--color-accent);
        }
        .post-list__error {
          margin-bottom: var(--space-4);
          padding: var(--space-3);
          border: 1px solid var(--color-danger);
          color: var(--color-danger);
          border-radius: var(--radius-md);
        }
        .post-list__status {
          margin-bottom: var(--space-4);
          padding: var(--space-3);
          color: var(--color-fg-muted);
          font-family: var(--font-mono);
          font-size: var(--fs-sm);
        }
      `}</style>
    </div>
  );
}
