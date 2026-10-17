import { useState, type FormEvent } from 'react';
import { ApprovalCard } from './components/ApprovalCard';
import { RunPanel } from './components/RunPanel';
import { Transcript } from './components/Transcript';
import { DEMO_TOKEN } from './config';
import { useControlSocket } from './hooks/useControlSocket';
import { useRunStream } from './hooks/useRunStream';

const FINISHED = new Set(['completed', 'cancelled', 'failed']);
const authHeaders = { Authorization: `Bearer ${DEMO_TOKEN}` };

/** The run id lives in the URL hash, so a reload (or a second tab) replays the run's log and picks up where it was. */
const runIdFromHash = () => new URLSearchParams(location.hash.slice(1)).get('run');

export function App() {
  const [runId, setRunId] = useState<string | null>(runIdFromHash);
  const [prompt, setPrompt] = useState('Order replacement parts for the open network tickets');
  const [starting, setStarting] = useState(false);
  const [notice, setNotice] = useState('');
  const [deciding, setDeciding] = useState(false);

  const { state, connection, error, firstTokenMs } = useRunStream(runId, DEMO_TOKEN);
  const live = runId !== null && !FINISHED.has(state.status);
  const control = useControlSocket(runId, DEMO_TOKEN, live);

  async function start(e: FormEvent) {
    e.preventDefault();
    setStarting(true);
    setNotice('');
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error(`Could not start the run (HTTP ${res.status})`);
      const body = (await res.json()) as { run_id: string };
      history.replaceState(null, '', `#run=${body.run_id}`);
      setRunId(body.run_id);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  }

  async function decide(approved: boolean) {
    if (!state.approval) return;
    setDeciding(true);
    setNotice('');
    try {
      const reply = await control.request({ type: 'approve', step_id: state.approval.stepId, approved });
      if (reply.type === 'error') setNotice(`The server refused that decision (${reply.code}).`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setDeciding(false);
    }
  }

  async function stop() {
    setNotice('');
    try {
      if (control.status !== 'ready') throw new Error('socket not ready');
      await control.request({ type: 'cancel' });
    } catch {
      // The socket is down: fall back to the REST endpoint, so Stop always works.
      await fetch(`/api/runs/${runId}`, { method: 'DELETE', headers: authHeaders }).catch(() => setNotice('Could not reach the server to stop the run.'));
    }
  }

  function newRun() {
    history.replaceState(null, '', location.pathname);
    setRunId(null);
  }

  return (
    <main>
      <header>
        <h1>Streaming agent demo</h1>
        <p className="muted">Tokens stream over SSE; approvals and cancel go over a WebSocket.</p>
      </header>

      {!runId ? (
        <form onSubmit={start} className="card">
          <label htmlFor="prompt">Ask the agent</label>
          <textarea id="prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} required maxLength={2000} />
          <button type="submit" disabled={starting || !prompt.trim()}>
            {starting ? 'Starting…' : 'Start run'}
          </button>
        </form>
      ) : (
        <div className="layout">
          <section className="card" aria-labelledby="chat-heading">
            <div className="row spread">
              <h2 id="chat-heading">Conversation</h2>
              <span className="pill" data-testid="run-status">
                {state.status}
              </span>
            </div>
            <Transcript state={state} />
            {state.approval && <ApprovalCard approval={state.approval} busy={deciding} onDecide={decide} message={notice} />}
            {!state.approval && notice && <p role="alert">{notice}</p>}
            {error && <p role="alert">{error}</p>}
            {state.outcome && <p className="muted">Stopped: {state.outcome}</p>}
            <div className="row">
              {live ? (
                <button type="button" className="danger" onClick={stop}>
                  Stop
                </button>
              ) : (
                <button type="button" onClick={newRun}>
                  New run
                </button>
              )}
            </div>
          </section>

          <aside className="card" aria-labelledby="progress-heading">
            <h2 id="progress-heading">Progress</h2>
            <RunPanel steps={state.steps} />
            <dl className="stats">
              <div>
                <dt>Stream (SSE)</dt>
                <dd data-testid="sse-status">{connection}</dd>
              </div>
              <div>
                <dt>Control (WebSocket)</dt>
                <dd data-testid="ws-status">{control.status}</dd>
              </div>
              <div>
                <dt>Last event id</dt>
                <dd>{state.lastEventId}</dd>
              </div>
              <div>
                <dt>Time to first token</dt>
                <dd>{firstTokenMs === null ? '–' : `${firstTokenMs} ms`}</dd>
              </div>
            </dl>
          </aside>
        </div>
      )}

      {/* Step-level announcements for screen readers: polite, and never individual tokens. */}
      <div className="visually-hidden" aria-live="polite" role="status">
        {state.announcement}
      </div>
    </main>
  );
}
