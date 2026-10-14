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

type BoxKind = 'key' | 'try' | 'warn' | 'check' | 'tip' | 'practice' | 'recap';

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
        <div className="answer-body">{children}</div>
      </details>
    </Box>
  );
}

type Tool = { name: ReactNode; what: ReactNode };

/** The block under each chapter title: what you will learn, the tools involved, time and project folder. */
export function ChapterIntro({ learn, tools, time, project }: { learn: ReactNode[]; tools?: Tool[]; time: string; project?: string }) {
  return (
    <section className="intro" aria-label="Chapter overview">
      <div className="intro-col">
        <p className="intro-h">You will learn</p>
        <ul>
          {learn.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </div>
      {tools && (
        <div className="intro-col">
          <p className="intro-h">Tools in this chapter</p>
          <dl className="tools">
            {tools.map((t, i) => (
              <div key={i}>
                <dt>{t.name}</dt>
                <dd>{t.what}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <p className="intro-meta">
        <span>Time: {time}</span>
        {project && (
          <span>
            Project folder: <code>projects/{project}</code>
          </span>
        )}
      </p>
    </section>
  );
}

/** A numbered build step. Use inside or outside .prose. */
export function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <h3 className="step">
      <span className="step-n" aria-hidden="true">{n}</span>
      <span className="sr-only">Step {n}: </span>
      {children}
    </h3>
  );
}

type Exercise = { task: ReactNode; hint?: ReactNode; solution?: ReactNode };

/** Practice tasks to do on your own, each with an optional hint and solution behind a disclosure. */
export function Exercises({ items }: { items: Exercise[] }) {
  return (
    <aside className="box practice">
      <span className="box-label">Practice on your own</span>
      <ol className="exercises">
        {items.map((ex, i) => (
          <li key={i}>
            <div>{ex.task}</div>
            {ex.hint && (
              <details className="answer">
                <summary>Hint</summary>
                <div className="answer-body">{ex.hint}</div>
              </details>
            )}
            {ex.solution && (
              <details className="answer">
                <summary>Solution</summary>
                <div className="answer-body">{ex.solution}</div>
              </details>
            )}
          </li>
        ))}
      </ol>
    </aside>
  );
}

/** The points worth remembering, at the end of a chapter. */
export function Recap({ children }: { children: ReactNode }) {
  return (
    <Box kind="recap" label="Key takeaways">
      {children}
    </Box>
  );
}

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
