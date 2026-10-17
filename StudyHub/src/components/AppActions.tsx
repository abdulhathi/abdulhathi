import { baseUrl, type HubApp } from '../apps';
import { stateOf, type Hub } from '../lib/useHub';

/** Start or stop an app, and open it in a new tab. Stop only appears for apps the hub started. */
export function AppActions({ app, hub, path = '/' }: { app: HubApp; hub: Hub; path?: string }) {
  const status = hub.status[app.id];
  const state = stateOf(status);
  const busy = hub.busy[app.id] || hub.busy.all;
  return (
    <div className="actions">
      {(state === 'stopped' || state === 'unknown') && (
        <button type="button" className="btn primary" onClick={() => hub.start(app.id)} disabled={busy || Boolean(status?.setup)}>
          {busy ? 'Starting…' : 'Start'}
        </button>
      )}
      {(state === 'running' || state === 'starting') && (
        <button type="button" className="btn" onClick={() => hub.stop(app.id)} disabled={busy}>
          {busy ? 'Stopping…' : 'Stop'}
        </button>
      )}
      {status?.up && (
        <a className="btn" href={baseUrl(app) + path} target="_blank" rel="noreferrer">
          New tab <span aria-hidden="true">↗</span>
        </a>
      )}
    </div>
  );
}
