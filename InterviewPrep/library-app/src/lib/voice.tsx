import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { readJson, writeJson } from './storage';

// Voice-interview results per question ("<chapter>/<question id>"). A question passes when one answer scores at or
// above the pass mark. Passed questions come back for review after 3, 7 and then 21 days; failing a review puts the
// question back in the queue until it passes again.

export const REVIEW_DAYS = [3, 7, 21];
const DAY = 86_400_000;

export type VoiceResult = {
  best: number;
  attempts: number;
  passed: boolean;
  stage: number; // how many reviews passed since the first pass
  dueAt?: number; // when a passed question comes back for review
  lastScore?: number;
  lastAt?: number;
};

export type VoiceSettings = { model: string; passMark: number; mustKnowOnly: boolean; readAloud: boolean };
export const DEFAULT_SETTINGS: VoiceSettings = { model: 'claude-opus-5-5', passMark: 80, mustKnowOnly: true, readAloud: true };

const KEY = 'interview-library.voice';
const SETTINGS_KEY = 'interview-library.voice-settings';

/** The next state after an answer scored `score`. Pure, so it can be tested. */
export function nextResult(prev: VoiceResult | undefined, score: number, passMark: number, now: number): VoiceResult {
  const base: VoiceResult = prev ?? { best: 0, attempts: 0, passed: false, stage: 0 };
  const wasDue = base.passed && base.dueAt !== undefined && base.dueAt <= now;
  const r: VoiceResult = { ...base, best: Math.max(base.best, score), attempts: base.attempts + 1, lastScore: score, lastAt: now };
  if (score >= passMark) {
    const stage = wasDue ? Math.min(base.stage + 1, REVIEW_DAYS.length - 1) : base.passed ? base.stage : 0;
    return { ...r, passed: true, stage, dueAt: now + REVIEW_DAYS[stage] * DAY };
  }
  // A failed answer: a new question stays unpassed; a due review falls back to the start of the schedule.
  return wasDue || !base.passed ? { ...r, passed: false, stage: 0, dueAt: undefined } : r;
}

/** True when this question should be in the queue: never passed, or passed and due for review. */
export function needsWork(r: VoiceResult | undefined, now: number) {
  return !r || !r.passed || (r.dueAt !== undefined && r.dueAt <= now);
}

type Value = {
  results: Readonly<Record<string, VoiceResult>>;
  record: (key: string, score: number, passMark: number) => VoiceResult;
  settings: VoiceSettings;
  setSettings: (s: Partial<VoiceSettings>) => void;
};
const Ctx = createContext<Value | null>(null);

export function VoiceProvider({ children }: { children: ReactNode }) {
  const [results, setResults] = useState<Record<string, VoiceResult>>(() => readJson(KEY, {}));
  const [settings, setAll] = useState<VoiceSettings>(() => ({ ...DEFAULT_SETTINGS, ...readJson<Partial<VoiceSettings>>(SETTINGS_KEY, {}) }));
  useEffect(() => writeJson(KEY, results), [results]);
  useEffect(() => writeJson(SETTINGS_KEY, settings), [settings]);

  const record = useCallback((key: string, score: number, passMark: number) => {
    let out!: VoiceResult;
    setResults((prev) => {
      out = nextResult(prev[key], score, passMark, Date.now());
      return { ...prev, [key]: out };
    });
    return out ?? nextResult(undefined, score, passMark, Date.now());
  }, []);
  const setSettings = useCallback((s: Partial<VoiceSettings>) => setAll((prev) => ({ ...prev, ...s })), []);
  const value = useMemo(() => ({ results, record, settings, setSettings }), [results, record, settings, setSettings]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVoice() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useVoice must be used inside <VoiceProvider>');
  return ctx;
}
