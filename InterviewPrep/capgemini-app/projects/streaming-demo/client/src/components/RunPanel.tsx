import type { Step } from '../lib/events';

const LABEL: Record<Step['status'], string> = { running: 'In progress', done: 'Done', skipped: 'Skipped' };

/** Run progress: one row per agent step, with a text status (not colour alone) so it reads well to everyone. */
export function RunPanel({ steps }: { steps: Step[] }) {
  if (steps.length === 0) return <p className="muted">Waiting for the first step…</p>;
  return (
    <ol className="steps" aria-label="Run progress">
      {steps.map((s) => (
        <li key={s.id} className={`step ${s.status}`}>
          <span>{s.title}</span>
          <span className="badge">{LABEL[s.status]}</span>
        </li>
      ))}
    </ol>
  );
}
