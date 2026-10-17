import { useEffect, useMemo, useState } from 'react';
import { baseUrl, type HubApp } from '../apps';
import type { Page } from '../lib/api';
import { appHref, homeHref } from '../lib/route';
import { stateOf, type Hub } from '../lib/useHub';
import { AppActions } from './AppActions';
import { Logs } from './Logs';
import { StatusBadge } from './StatusBadge';

/** One app: its page list on the left, the selected page in a frame on the right. */
export function AppView({ app, hub, pageId }: { app: HubApp; hub: Hub; pageId?: string }) {
  const status = hub.status[app.id];
  const pages = hub.pages[app.id] ?? [];
  const page = pages.find((p) => p.id === pageId) ?? pages[0];
  const path = page?.path ?? '/';
  const [reloadKey, setReloadKey] = useState(0);
  const [listOpen, setListOpen] = useState(true);
  const [filter, setFilter] = useState('');

  // A different app gets a fresh frame and an empty filter.
  useEffect(() => {
    setFilter('');
    setReloadKey(0);
  }, [app.id]);

  const shown = useMemo(() => {
    const terms = filter.toLowerCase().split(/\s+/).filter(Boolean);
    return terms.length ? pages.filter((p) => terms.every((t) => `${p.group ?? ''} ${p.title}`.toLowerCase().includes(t))) : pages;
  }, [pages, filter]);
  const groups = useMemo(() => {
    const map = new Map<string, Page[]>();
    for (const p of shown) map.set(p.group ?? '', [...(map.get(p.group ?? '') ?? []), p]);
    return [...map];
  }, [shown]);

  const state = stateOf(status);
  return (
    <div className={listOpen && pages.length > 1 ? 'appview with-list' : 'appview'}>
      <div className="toolbar">
        <a href={homeHref} className="btn ghost">
          <span aria-hidden="true">←</span> All apps
        </a>
        <h1 className="tool-title">
          {app.name}
          {page && pages.length > 1 && <span className="tool-page"> · {page.title}</span>}
        </h1>
        <StatusBadge status={status} short />
        <div className="tool-actions">
          {pages.length > 1 && (
            <button type="button" className="btn ghost" aria-expanded={listOpen} onClick={() => setListOpen((o) => !o)}>
              {listOpen ? 'Hide pages' : `Pages (${pages.length})`}
            </button>
          )}
          {/* While the app is down, its Start button lives in the panel below instead. */}
          {status?.up && (
            <>
              <button type="button" className="btn ghost" onClick={() => setReloadKey((k) => k + 1)}>
                Reload
              </button>
              <AppActions app={app} hub={hub} path={path} />
            </>
          )}
        </div>
      </div>

      {listOpen && pages.length > 1 && (
        <aside className="pagelist" aria-label={`${app.name} pages`}>
          <input
            type="search"
            className="filter"
            placeholder={`Filter ${pages.length} pages`}
            aria-label="Filter pages"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {groups.length === 0 && <p className="muted">No page matches.</p>}
          {groups.map(([group, list]) => (
            <div key={group || 'pages'} className="pl-group">
              {group && <p className="pl-heading">{group}</p>}
              <ul>
                {list.map((p) => (
                  <li key={p.id}>
                    <a
                      href={appHref(app.id, p.id)}
                      className={p.id === page?.id ? 'pl-link is-current' : 'pl-link'}
                      aria-current={p.id === page?.id ? 'page' : undefined}
                    >
                      {p.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </aside>
      )}

      <div className="viewer">
        {status?.up ? (
          <iframe key={`${app.id}-${reloadKey}`} title={`${app.name}: ${page?.title ?? 'home'}`} src={baseUrl(app) + path} />
        ) : (
          <div className="offline">
            <h2>{state === 'starting' ? `${app.name} is starting…` : `${app.name} is not running`}</h2>
            {state === 'unknown' && !hub.apiError && <p className="muted">Checking…</p>}
            {hub.apiError && <p className="warn">{hub.apiError}</p>}
            {status?.setup ? (
              <p className="warn">
                It is not set up yet. Run this in the portfolio folder, then press Start: <code>{status.setup}</code>
              </p>
            ) : (
              state === 'stopped' && <p>Press Start to run it on port {app.port}. The page opens here as soon as it is up.</p>
            )}
            <AppActions app={app} hub={hub} />
            <h3>Output</h3>
            <Logs id={app.id} live={state === 'starting'} />
          </div>
        )}
      </div>
    </div>
  );
}
