import { useEffect, useReducer, useState } from 'react';
import { applyEvents, initialRunState, type RunEvent, type RunState } from '../lib/events';
import { followRun, type ConnectionStatus } from '../lib/stream';

type Action = { type: 'reset' } | { type: 'events'; events: RunEvent[] };

function reducer(state: RunState, action: Action): RunState {
  return action.type === 'reset' ? initialRunState : applyEvents(state, action.events);
}

/**
 * Streams a run's events into state. Tokens can arrive hundreds of times a second, so events are queued and
 * applied once per animation frame: one render per frame instead of one per token.
 */
export function useRunStream(runId: string | null, token: string) {
  const [state, dispatch] = useReducer(reducer, initialRunState);
  const [connection, setConnection] = useState<ConnectionStatus | 'idle'>('idle');
  const [error, setError] = useState('');
  const [firstTokenMs, setFirstTokenMs] = useState<number | null>(null);

  useEffect(() => {
    if (!runId) return;
    dispatch({ type: 'reset' });
    setError('');
    setFirstTokenMs(null);
    const controller = new AbortController(); // aborted on unmount or a new run: stops the fetch and the reconnects
    const queue: RunEvent[] = [];
    let frame = 0;
    const flush = () => {
      frame = 0;
      dispatch({ type: 'events', events: queue.splice(0) });
    };
    const startedAt = performance.now();
    let sawToken = false;

    followRun({
      url: `/api/runs/${runId}/events`,
      token,
      signal: controller.signal,
      onStatus: setConnection,
      onEvent: (event) => {
        // After cleanup (a new run, unmount), nothing from this stream may reach the next run's state, even an
        // event already parsed from the last chunk.
        if (controller.signal.aborted) return;
        if (!sawToken && event.type === 'token') {
          sawToken = true;
          setFirstTokenMs(Math.round(performance.now() - startedAt));
        }
        queue.push(event);
        if (!frame) frame = requestAnimationFrame(flush);
      },
    })
      .then((result) => {
        if (result === 'gave_up') setError('Lost the connection to the stream. Reload the page to resume.');
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));

    return () => {
      controller.abort();
      cancelAnimationFrame(frame);
    };
  }, [runId, token]);

  return { state, connection, error, firstTokenMs };
}
