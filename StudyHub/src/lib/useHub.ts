import { useCallback, useEffect, useRef, useState } from 'react';
import { getPages, getStatus, post, type AppStatus, type Page } from './api';

export type Notice = { ok: boolean; message: string; at: number };

const POLL_MS = 3000;

/** Live app status (polled while the tab is visible), every app's pages, and the start/stop actions. */
export function useHub() {
  const [status, setStatus] = useState<Record<string, AppStatus>>({});
  const [pages, setPages] = useState<Record<string, Page[]>>({});
  const [loaded, setLoaded] = useState(false);
  const [apiError, setApiError] = useState('');
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const mounted = useRef(true);

  const refreshStatus = useCallback(async () => {
    try {
      const list = await getStatus();
      if (!mounted.current) return;
      setStatus(Object.fromEntries(list.map((s) => [s.id, s])));
      setApiError('');
    } catch (e) {
      if (mounted.current) setApiError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setLoaded(true);
    }
  }, []);

  const refreshPages = useCallback(async () => {
    try {
      const all = await getPages();
      if (mounted.current) setPages(all);
    } catch {
      /* the status poll reports API problems */
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refreshStatus();
    void refreshPages();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refreshStatus();
    }, POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && void refreshStatus();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshStatus, refreshPages]);

  // Stable, so the auto-dismiss timer in App is not reset by every status poll.
  const dismissNotice = useCallback(() => setNotice(null), []);

  const run = useCallback(
    async (key: string, path: string) => {
      setBusy((b) => ({ ...b, [key]: true }));
      try {
        const result = await post(path);
        if (mounted.current) setNotice({ ...result, at: Date.now() });
      } catch (e) {
        if (mounted.current) setNotice({ ok: false, message: e instanceof Error ? e.message : String(e), at: Date.now() });
      } finally {
        if (mounted.current) setBusy((b) => ({ ...b, [key]: false }));
        void refreshStatus();
      }
    },
    [refreshStatus],
  );

  return {
    status,
    pages,
    loaded,
    apiError,
    busy,
    notice,
    dismissNotice,
    refreshPages,
    start: (id: string) => run(id, `apps/${id}/start`),
    stop: (id: string) => run(id, `apps/${id}/stop`),
    startAll: () => run('all', 'start-all'),
    stopAll: () => run('all', 'stop-all'),
  };
}

export type Hub = ReturnType<typeof useHub>;

/** A short label for an app's state. */
export function stateOf(s: AppStatus | undefined): 'running' | 'external' | 'starting' | 'stopped' | 'unknown' {
  if (!s) return 'unknown';
  if (s.up) return s.managed ? 'running' : 'external';
  return s.managed ? 'starting' : 'stopped';
}
