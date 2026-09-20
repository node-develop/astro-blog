import React from "react";
import { diffLines, type Change } from "diff";

interface Props {
  readonly oldBody: string;
  readonly newBody: string;
}

export default function RevisionDiff({ oldBody, newBody }: Props): React.JSX.Element {
  const parts: Change[] = diffLines(oldBody, newBody);
  return (
    <pre className="diff">
      {parts.map((part, i) => {
        const prefix = part.added ? "+" : part.removed ? "-" : " ";
        const className = part.added
          ? "diff__added"
          : part.removed
            ? "diff__removed"
            : "diff__unchanged";
        // Prefix every line of the chunk
        const text = part.value.replace(/\n$/, "").replaceAll("\n", `\n${prefix}`);
        return (
          <span key={i} className={className}>
            {prefix}
            {text}
            {"\n"}
          </span>
        );
      })}
      <style>{`
        .diff {
          font-family: var(--font-code); font-size: var(--fs-xs);
          line-height: 1.5;
          padding: var(--space-4);
          background: var(--color-bg-elevated);
          border: var(--stroke-bold) solid var(--color-fg); border-radius: var(--radius-md);
          overflow-x: auto; white-space: pre-wrap;
        }
        /* Derived from the state tokens, so these flip with [data-theme]
           rather than with the OS — the site's theme toggle is explicit and
           a prefers-color-scheme query would disagree with it. */
        .diff__added {
          color: var(--color-success);
          background: color-mix(in srgb, var(--color-success) 16%, var(--color-bg-elevated));
        }
        .diff__removed {
          color: var(--color-danger);
          background: color-mix(in srgb, var(--color-danger) 16%, var(--color-bg-elevated));
        }
        .diff__unchanged { color: var(--color-fg-muted); }
      `}</style>
    </pre>
  );
}
