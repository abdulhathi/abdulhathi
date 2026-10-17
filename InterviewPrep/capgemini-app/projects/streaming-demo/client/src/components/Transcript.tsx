import { useRef } from 'react';
import { useStickToBottom } from '../hooks/useStickToBottom';
import type { RunState } from '../lib/events';

/**
 * The conversation: the user's prompt, then each step's streamed text and tool calls. Text is rendered as plain
 * React text (never innerHTML), so model output cannot inject markup. It is not a live region: screen readers
 * would read every token. Step-level announcements go to the separate status region instead.
 */
export function Transcript({ state }: { state: RunState }) {
  const box = useRef<HTMLDivElement>(null);
  useStickToBottom(box, state.lastEventId);
  const busy = state.status === 'running' || state.status === 'awaiting_approval';
  return (
    // role="region" because aria-label is not allowed on a plain div; tabIndex makes the scroll area keyboard-reachable.
    <div className="transcript" ref={box} tabIndex={0} role="region" aria-label="Transcript" aria-busy={busy}>
      {state.prompt && (
        <p className="bubble user">
          <span className="who">You</span>
          {state.prompt}
        </p>
      )}
      {state.steps.map((step) => (
        <div key={step.id} className="bubble agent" data-step={step.id}>
          <span className="who">{step.title}</span>
          {step.text && <p className="streamed">{step.text}</p>}
          {step.tools.map((t, i) => (
            <details key={i} className="tool">
              <summary>
                {t.result ? 'Called' : 'Calling'} <code>{t.tool}</code>
              </summary>
              <pre>{JSON.stringify({ args: t.args, result: t.result ?? null }, null, 2)}</pre>
            </details>
          ))}
        </div>
      ))}
    </div>
  );
}
