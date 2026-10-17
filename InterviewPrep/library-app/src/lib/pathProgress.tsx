import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { readJson, writeJson } from './storage';

// What you have done on each learning path beyond reading and voice practice: courses finished, the portfolio
// project, assessments earned, and where you have shown the skill (LinkedIn, GitHub, website, resume).

export type Earned = { done: boolean; date?: string; url?: string };
export type PathState = {
  courses: Record<string, Earned>; // keyed by course URL
  assessments: Record<string, Earned>; // keyed by assessment URL
  project: { repoUrl?: string; demoUrl?: string; checks: Record<string, boolean> };
  profile: Record<string, boolean>;
};
export const EMPTY_PATH: PathState = { courses: {}, assessments: {}, project: { checks: {} }, profile: {} };

const KEY = 'interview-library.paths';

type Value = {
  state: (pathId: string) => PathState;
  update: (pathId: string, change: (s: PathState) => PathState) => void;
  all: Readonly<Record<string, PathState>>;
  replaceAll: (next: Record<string, PathState>) => void;
};
const Ctx = createContext<Value | null>(null);

export function PathProgressProvider({ children }: { children: ReactNode }) {
  const [all, setAll] = useState<Record<string, PathState>>(() => readJson(KEY, {}));
  useEffect(() => writeJson(KEY, all), [all]);
  const state = useCallback((id: string) => ({ ...EMPTY_PATH, ...all[id], project: { ...EMPTY_PATH.project, ...all[id]?.project } }), [all]);
  const update = useCallback(
    (id: string, change: (s: PathState) => PathState) =>
      setAll((prev) => ({ ...prev, [id]: change({ ...EMPTY_PATH, ...prev[id], project: { ...EMPTY_PATH.project, ...prev[id]?.project } }) })),
    [],
  );
  const value = useMemo(() => ({ state, update, all, replaceAll: setAll }), [state, update, all]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePathProgress() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePathProgress must be used inside <PathProgressProvider>');
  return ctx;
}
