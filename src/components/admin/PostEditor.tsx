import React, { useEffect, useRef } from "react";
import { EditorView, keymap, highlightActiveLine } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

interface Props {
  readonly value: string;
  readonly onChange: (next: string) => void;
}

const highlight = HighlightStyle.define([
  { tag: t.heading, color: "var(--color-fg)", fontWeight: "500" },
  { tag: t.strong, fontWeight: "600" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.link, color: "var(--color-accent)" },
  { tag: t.monospace, color: "var(--color-accent-hover)" },
  { tag: t.list, color: "var(--color-fg-muted)" },
]);

export default function PostEditor({ value, onChange }: Props): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);

  // Keep onChange in a ref so the mount-once effect doesn't close over stale handlers.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!hostRef.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown(),
        syntaxHighlighting(highlight),
        highlightActiveLine(),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
      ],
    });
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Intentionally mount once — deps array is deliberately empty.
    // Stale closure for onChange is avoided via onChangeRef.
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (view.state.doc.toString() === value) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);

  return <div ref={hostRef} className="post-editor" />;
}
