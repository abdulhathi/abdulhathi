import { useSyncExternalStore } from 'react';

// Hash routes (#/hello) work on any static host, GitHub Pages included,
// without server rewrites.
function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

function currentRoute() {
  return window.location.hash.replace(/^#\/?/, '');
}

export function useRoute() {
  return useSyncExternalStore(subscribe, currentRoute, () => '');
}

export const hrefFor = (id: string) => `#/${id}`;
