import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

/** Below this width the apps list is an overlay menu instead of a column. Matches the CSS breakpoint. */
export const NARROW = '(max-width: 900px)';

/** True while the media query matches. Always false where matchMedia is missing (tests, old browsers). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== 'function') return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false,
  );
}

const KEY = 'study-hub.sidebar';

/** Whether the apps column is hidden on wide screens, remembered between visits. */
export function useSidebarHidden() {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(KEY) === 'hidden';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(KEY, hidden ? 'hidden' : 'shown');
    } catch {
      /* the choice lasts for this visit only */
    }
  }, [hidden]);
  const toggle = useCallback(() => setHidden((h) => !h), []);
  return { hidden, toggle };
}
