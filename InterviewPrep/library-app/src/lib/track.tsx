import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { findTrack, type Track } from '../tracks';
import { readJson, writeJson } from './storage';

const KEY = 'interview-library.track';

type Value = { track: Track | undefined; setTrack: (id: Track['id'] | null) => void };
const Ctx = createContext<Value>({ track: undefined, setTrack: () => {} });

/** The job description you are preparing for. Progress and ratings are shared by every track; this only changes focus. */
export function TrackProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<string | null>(() => readJson<string | null>(KEY, null));
  const setTrack = useCallback((next: Track['id'] | null) => {
    setId(next);
    writeJson(KEY, next);
  }, []);
  const value = useMemo(() => ({ track: findTrack(id), setTrack }), [id, setTrack]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useActiveTrack = () => useContext(Ctx);
