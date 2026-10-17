import { useSyncExternalStore } from 'react';

// Hash routes: #/ is the dashboard, #/app/<id> opens an app, #/app/<id>/<page> opens one of its pages.
export type Route = { view: 'home' } | { view: 'app'; id: string; page?: string };

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export function parseRoute(hash: string): Route {
  const [kind, id, page] = hash.replace(/^#\/?/, '').split('/');
  if (kind === 'app' && id) return { view: 'app', id, page: page ? decodeURIComponent(page) : undefined };
  return { view: 'home' };
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => '');
  return parseRoute(hash);
}

export const homeHref = '#/';
export const appHref = (id: string, page?: string) => (page ? `#/app/${id}/${encodeURIComponent(page)}` : `#/app/${id}`);
