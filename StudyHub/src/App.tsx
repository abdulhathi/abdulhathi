import { useCallback, useEffect, useState } from 'react';
import { findApp } from './apps';
import { AppView } from './components/AppView';
import { Dashboard } from './components/Dashboard';
import { PlanPage } from './components/PlanPage';
import { Search } from './components/Search';
import { Sidebar } from './components/Sidebar';
import { NARROW, useMediaQuery, useSidebarHidden } from './lib/layout';
import { homeHref, useRoute } from './lib/route';
import { useTheme } from './lib/theme';
import { useHub } from './lib/useHub';

export default function App() {
  const hub = useHub();
  const route = useRoute();
  const theme = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const narrow = useMediaQuery(NARROW);
  const sidebar = useSidebarHidden();
  const app = route.view === 'app' ? findApp(route.id) : undefined;

  // One button: on a wide screen it hides or shows the apps column, on a narrow one it opens the apps menu.
  const sideOpen = narrow ? menuOpen : !sidebar.hidden;
  const toggleSide = useCallback(() => (narrow ? setMenuOpen((o) => !o) : sidebar.toggle()), [narrow, sidebar]);

  // "[" toggles the apps list from anywhere, except while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key !== '[' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return;
      e.preventDefault();
      toggleSide();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleSide]);

  useEffect(() => {
    document.title = app ? `${app.name} · Study Hub` : route.view === 'plan' ? 'Prep plan · Study Hub' : 'Study Hub';
  }, [app, route.view]);

  // Notices fade after a few seconds; errors stay until dismissed.
  const { notice, dismissNotice } = hub;
  useEffect(() => {
    if (!notice?.ok) return;
    const t = setTimeout(dismissNotice, 6000);
    return () => clearTimeout(t);
  }, [notice, dismissNotice]);

  return (
    <div className={['shell', menuOpen && 'menu-open', !narrow && sidebar.hidden && 'side-hidden'].filter(Boolean).join(' ')}>
      <header className="topbar">
        <button
          type="button"
          className="btn ghost side-toggle"
          aria-expanded={sideOpen}
          aria-controls="sidebar"
          title="Hide or show the apps list (shortcut: [ )"
          onClick={toggleSide}
        >
          <span aria-hidden="true">☰</span> {narrow ? 'Apps' : sideOpen ? 'Hide apps' : 'Show apps'}
        </button>
        <a className="brand" href={homeHref}>
          Study Hub
        </a>
        <Search pages={hub.pages} />
        <button type="button" className="btn ghost" onClick={theme.next} aria-label={`Theme: ${theme.mode}. Change theme`}>
          Theme: {theme.mode === 'system' ? 'Auto' : theme.mode === 'light' ? 'Light' : 'Dark'}
        </button>
      </header>
      <div id="sidebar" className="side-wrap" hidden={!narrow && sidebar.hidden}>
        <Sidebar hub={hub} route={route} onNavigate={() => setMenuOpen(false)} />
      </div>
      <main className="main">
        {hub.apiError && route.view === 'home' && <p className="warn banner">{hub.apiError}</p>}
        {app && route.view === 'app' ? (
          <AppView app={app} hub={hub} pageId={route.page} />
        ) : route.view === 'app' ? (
          <p className="warn banner">
            No app called “{route.id}”. <a href={homeHref}>See all apps</a>.
          </p>
        ) : route.view === 'plan' ? (
          <PlanPage planId={route.id} />
        ) : (
          <Dashboard hub={hub} />
        )}
      </main>
      <div className="toast-region" role="status" aria-live="polite">
        {notice && (
          <div className={notice.ok ? 'toast' : 'toast error'}>
            <p>{notice.message}</p>
            <button type="button" className="btn ghost" onClick={dismissNotice} aria-label="Dismiss message">
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
