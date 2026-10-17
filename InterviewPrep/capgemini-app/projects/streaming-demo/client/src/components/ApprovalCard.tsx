import { useEffect, useState } from 'react';
import type { Approval } from '../lib/events';

type Props = { approval: Approval; busy: boolean; onDecide: (approved: boolean) => void; message: string };

/** The human-in-the-loop checkpoint: the agent waits here until someone approves, rejects, or the timer runs out. */
export function ApprovalCard({ approval, busy, onDecide, message }: Props) {
  const secondsLeft = useSecondsUntil(approval.deadline);
  const title = approval.action.replaceAll('_', ' ');
  return (
    <section className="approval" aria-labelledby="approval-title">
      <h3 id="approval-title">Approval needed: {title}</h3>
      <dl>
        {Object.entries(approval.details).map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{Array.isArray(value) ? value.join(', ') : String(value)}</dd>
          </div>
        ))}
      </dl>
      <p className="muted">Rejected automatically in {secondsLeft} s if nobody decides.</p>
      <div className="row">
        <button type="button" onClick={() => onDecide(true)} disabled={busy}>
          Approve
        </button>
        <button type="button" className="secondary" onClick={() => onDecide(false)} disabled={busy}>
          Reject
        </button>
      </div>
      {message && <p role="alert">{message}</p>}
    </section>
  );
}

function useSecondsUntil(deadline: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
