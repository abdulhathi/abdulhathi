import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { readJson, writeJson } from './storage';

const KEY = 'node-lab.done';

type Progress = {
  done: ReadonlySet<string>;
  toggle: (id: string) => void;
};

const ProgressContext = createContext<Progress | null>(null);

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [done, setDone] = useState<Set<string>>(() => new Set(readJson<string[]>(KEY, [])));

  useEffect(() => writeJson(KEY, [...done]), [done]);

  const toggle = useCallback((id: string) => {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ done, toggle }), [done, toggle]);
  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress() {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error('useProgress must be used inside <ProgressProvider>');
  return ctx;
}
