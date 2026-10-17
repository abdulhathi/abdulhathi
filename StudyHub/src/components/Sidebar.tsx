import { APPS, GROUPS } from '../apps';
import { appHref, homeHref, type Route } from '../lib/route';
import type { Hub } from '../lib/useHub';
import { StatusDot } from './StatusBadge';

export function Sidebar({ hub, route, onNavigate }: { hub: Hub; route: Route; onNavigate: () => void }) {
  const current = route.view === 'app' ? route.id : '';
  return (
    <nav className="sidebar" aria-label="Apps">
      <a href={homeHref} className={route.view === 'home' ? 'side-link is-current' : 'side-link'} aria-current={route.view === 'home' ? 'page' : undefined} onClick={onNavigate}>
        <span className="side-icon" aria-hidden="true">◆</span>
        <span>All apps</span>
      </a>
      {GROUPS.map((group) => (
        <div key={group} className="side-group">
          <p className="side-heading">{group}</p>
          <ul>
            {APPS.filter((a) => a.group === group).map((app) => (
              <li key={app.id}>
                <a
                  href={appHref(app.id)}
                  className={app.id === current ? 'side-link is-current' : 'side-link'}
                  aria-current={app.id === current ? 'page' : undefined}
                  onClick={onNavigate}
                >
                  <StatusDot status={hub.status[app.id]} />
                  <span className="side-name">{app.name}</span>
                  <span className="side-port">{app.port}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
