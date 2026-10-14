import type { ReactNode } from 'react';

type Pane = { tag?: string; text: string };

/** Expected terminal output. Several panes sit side by side on wide screens. */
export function Output({ caption = 'What you should see', panes, children }: { caption?: string; panes?: Pane[]; children?: string }) {
  const list = panes ?? [{ text: children ?? '' }];
  return (
    <figure className="out">
      <figcaption>{caption}</figcaption>
      <div className={list.length > 1 ? 'cols' : undefined}>
        {list.map((p, i) => (
          <pre key={i}>
            {p.tag && <span className="tag">{p.tag}</span>}
            {p.text.replace(/^\n+/, '').replace(/\s+$/, '')}
          </pre>
        ))}
      </div>
    </figure>
  );
}

type BoxKind = 'key' | 'try' | 'warn' | 'check';

export function Box({ kind, label, children }: { kind: BoxKind; label: string; children: ReactNode }) {
  return (
    <aside className={`box ${kind}`}>
      <span className="box-label">{label}</span>
      {children}
    </aside>
  );
}

export function Checkpoint({ question, children }: { question: ReactNode; children: ReactNode }) {
  return (
    <Box kind="check" label="Checkpoint">
      <p>{question}</p>
      <details className="answer">
        <summary>Show answer</summary>
        <p>{children}</p>
      </details>
    </Box>
  );
}

/* Name chips, coloured like the matching boxes in the diagrams. */
const chip = (cls: string) =>
  function Chip({ children }: { children: ReactNode }) {
    return <code className={cls}>{children}</code>;
  };

/** Producer (script that publishes) */
export const P = chip('e-p');
/** Exchange */
export const X = chip('e-x');
/** Queue */
export const Q = chip('e-q');
/** Consumer */
export const C = chip('e-c');
/** Routing key or binding pattern */
export const K = chip('e-k');
/** Dead-letter queue */
export const D = chip('e-d');

export function TableWrap({ children, className = 't' }: { children: ReactNode; className?: string }) {
  return (
    <div className="table-wrap">
      <table className={className}>{children}</table>
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd>{children}</kbd>;
}
