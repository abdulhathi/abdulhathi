import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { readJson, writeJson } from './storage';

const KEY = 'dsa-lab.problems';

export type Status = 'new' | 'tried' | 'solved' | 'mastered';
export const STATUS_LABEL: Record<Status, string> = { new: 'Not started', tried: 'Tried', solved: 'Solved', mastered: 'Mastered' };

/** Days until the next review after each successful one. After the last, a problem is mastered. */
export const REVIEW_DAYS = [3, 7, 15, 30] as const;

export type ProblemRecord = {
  status: Exclude<Status, 'new'>;
  step?: number; // index into REVIEW_DAYS of the next review
  due?: string; // YYYY-MM-DD of the next review
};

type Store = {
  records: Readonly<Record<number, ProblemRecord>>;
  statusOf: (id: number) => Status;
  setStatus: (id: number, status: Status) => void;
  review: (id: number, remembered: boolean) => void;
};

/** Local calendar date as YYYY-MM-DD. */
export function isoDay(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(day: string, days: number) {
  const [y, m, d] = day.split('-').map(Number);
  return isoDay(new Date(y, m - 1, d + days));
}

/** The next record after a status change or a review. Pure, so the schedule is easy to test. */
export function nextRecord(prev: ProblemRecord | undefined, action: { status: Status } | { remembered: boolean }, today = isoDay()): ProblemRecord | undefined {
  if ('status' in action) {
    switch (action.status) {
      case 'new':
        return undefined;
      case 'tried':
        return { status: 'tried' };
      case 'solved':
        return prev?.status === 'solved' ? prev : { status: 'solved', step: 0, due: addDays(today, REVIEW_DAYS[0]) };
      case 'mastered':
        return { status: 'mastered' };
    }
  }
  if (!prev || prev.status !== 'solved') return prev;
  if (!action.remembered) return { status: 'solved', step: 0, due: addDays(today, 1) };
  const step = (prev.step ?? 0) + 1;
  if (step >= REVIEW_DAYS.length) return { status: 'mastered' };
  return { status: 'solved', step, due: addDays(today, REVIEW_DAYS[step]) };
}

const ProblemContext = createContext<Store | null>(null);

export function ProblemProvider({ children }: { children: ReactNode }) {
  const [records, setRecords] = useState<Record<number, ProblemRecord>>(() => readJson(KEY, {}));

  useEffect(() => writeJson(KEY, records), [records]);

  const update = useCallback((id: number, action: Parameters<typeof nextRecord>[1]) => {
    setRecords((prev) => {
      const next = { ...prev };
      const rec = nextRecord(prev[id], action);
      if (rec) next[id] = rec;
      else delete next[id];
      return next;
    });
  }, []);

  const value = useMemo<Store>(
    () => ({
      records,
      statusOf: (id) => records[id]?.status ?? 'new',
      setStatus: (id, status) => update(id, { status }),
      review: (id, remembered) => update(id, { remembered }),
    }),
    [records, update],
  );

  return <ProblemContext.Provider value={value}>{children}</ProblemContext.Provider>;
}

export function useProblems() {
  const ctx = useContext(ProblemContext);
  if (!ctx) throw new Error('useProblems must be used inside <ProblemProvider>');
  return ctx;
}

/** Problem numbers whose review is due on or before `today`, oldest first. */
export function dueIds(records: Readonly<Record<number, ProblemRecord>>, today = isoDay()) {
  return Object.entries(records)
    .filter(([, r]) => r.status === 'solved' && r.due !== undefined && r.due <= today)
    .sort(([, a], [, b]) => (a.due! < b.due! ? -1 : a.due! > b.due! ? 1 : 0))
    .map(([id]) => Number(id));
}
