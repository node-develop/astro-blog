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
          border: 1px solid var(--color-border); border-radius: var(--radius-md);
          overflow-x: auto; white-space: pre-wrap;
        }
        .diff__added { color: #14532d; background: #dcfce7; }
        .diff__removed { color: #7f1d1d; background: #fee2e2; }
        .diff__unchanged { color: var(--color-fg-muted); }
        @media (prefers-color-scheme: dark) {
          .diff__added { color: #bbf7d0; background: rgba(20,83,45,0.2); }
          .diff__removed { color: #fecaca; background: rgba(127,29,29,0.2); }
        }
      `}</style>
    </pre>
  );
}
