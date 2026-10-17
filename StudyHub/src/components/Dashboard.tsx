import { APPS, GROUPS, type HubApp } from '../apps';
import { appHref } from '../lib/route';
import { stateOf, type Hub } from '../lib/useHub';
import { AppActions } from './AppActions';
import { Logs } from './Logs';
import { StatusBadge } from './StatusBadge';

export function Dashboard({ hub }: { hub: Hub }) {
  const up = APPS.filter((a) => hub.status[a.id]?.up).length;
  const managed = APPS.filter((a) => hub.status[a.id]?.managed).length;
  return (
    <div className="dashboard">
      <header className="dash-head">
        <div>
          <p className="kicker">Study Hub</p>
          <h1>Every study app in one place</h1>
          <p className="lede">
            Start an app, open any of its pages here, or search every page across all of them. Apps the hub starts keep
            running after you close this page; stop them here when you are done.
          </p>
        </div>
        <div className="dash-summary" aria-live="polite">
          <p className="big">
            {hub.loaded ? up : '–'} <span>of {APPS.length} running</span>
          </p>
          <div className="actions">
            <button type="button" className="btn primary" onClick={hub.startAll} disabled={hub.busy.all || up === APPS.length}>
              {hub.busy.all ? 'Working…' : 'Start all'}
            </button>
            <button type="button" className="btn" onClick={hub.stopAll} disabled={hub.busy.all || managed === 0}>
              Stop apps started here
            </button>
          </div>
        </div>
      </header>

      {GROUPS.map((group) => (
        <section key={group} className="dash-group" aria-labelledby={`g-${group}`}>
          <h2 id={`g-${group}`}>{group}</h2>
          <div className="cards">
            {APPS.filter((a) => a.group === group).map((app) => (
              <AppCard key={app.id} app={app} hub={hub} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function AppCard({ app, hub }: { app: HubApp; hub: Hub }) {
  const status = hub.status[app.id];
  const pages = hub.pages[app.id] ?? [];
  const state = stateOf(status);
  return (
    <article className="card">
      <div className="card-head">
        <h3>
          <a href={appHref(app.id)}>{app.name}</a>
        </h3>
        <StatusBadge status={status} short />
      </div>
      <p className="card-desc">{app.description}</p>
      <p className="card-meta">
        <code>localhost:{app.port}</code> · {pages.length} {pages.length === 1 ? 'page' : 'pages'}
        {app.requires?.length ? ` · starts ${app.requires.join(', ')} too` : ''}
      </p>
      {status?.setup && (
        <p className="warn">
          Not set up yet. Run <code>{status.setup}</code>
        </p>
      )}
      {pages.length > 1 && (
        <ul className="quick" aria-label={`${app.name} pages`}>
          {pages.slice(0, 5).map((p) => (
            <li key={p.id}>
              <a href={appHref(app.id, p.id)}>{p.title}</a>
            </li>
          ))}
          {pages.length > 5 && (
            <li>
              <a href={appHref(app.id)} className="more">
                all {pages.length} →
              </a>
            </li>
          )}
        </ul>
      )}
      <div className="card-foot">
        <a className="btn primary" href={appHref(app.id)}>
          Open
        </a>
        <AppActions app={app} hub={hub} />
      </div>
      {(status?.managed || state === 'stopped') && (
        <details className="card-logs">
          <summary>Output</summary>
          <Logs id={app.id} live={Boolean(status?.managed)} />
        </details>
      )}
    </article>
  );
}
