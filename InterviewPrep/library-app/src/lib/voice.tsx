import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Feedback } from './evaluate';
import type { SpeakingStats } from './speech';
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

/** Your latest scored answer to a question and the grader's feedback on it. A newer scored answer replaces it. */
export type SavedAnswer = { answer: string; feedback: Feedback; at: number; stats?: SpeakingStats };

export type VoiceSettings = { model: string; passMark: number; mustKnowOnly: boolean; readAloud: boolean };
export const DEFAULT_SETTINGS: VoiceSettings = { model: 'claude-opus-5-5', passMark: 80, mustKnowOnly: true, readAloud: true };

const KEY = 'interview-library.voice';
const SETTINGS_KEY = 'interview-library.voice-settings';
const ANSWERS_KEY = 'interview-library.voice-answers';

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

/** The first item after `index` (wrapping round) that still needs work. */
export function nextToWork<T>(deck: T[], index: number, open: (x: T) => boolean): T | undefined {
  for (let step = 1; step < deck.length; step++) {
    const x = deck[(index + step) % deck.length];
    if (open(x)) return x;
  }
  return undefined;
}

type Value = {
  results: Readonly<Record<string, VoiceResult>>;
  record: (key: string, score: number, passMark: number) => VoiceResult;
  answers: Readonly<Record<string, SavedAnswer>>;
  saveAnswer: (key: string, saved: SavedAnswer) => void;
  settings: VoiceSettings;
  setSettings: (s: Partial<VoiceSettings>) => void;
};
const Ctx = createContext<Value | null>(null);

export function VoiceProvider({ children }: { children: ReactNode }) {
  const [results, setResults] = useState<Record<string, VoiceResult>>(() => readJson(KEY, {}));
  const [answers, setAnswers] = useState<Record<string, SavedAnswer>>(() => readJson(ANSWERS_KEY, {}));
  const [settings, setAll] = useState<VoiceSettings>(() => ({ ...DEFAULT_SETTINGS, ...readJson<Partial<VoiceSettings>>(SETTINGS_KEY, {}) }));
  useEffect(() => writeJson(KEY, results), [results]);
  useEffect(() => writeJson(ANSWERS_KEY, answers), [answers]);
  useEffect(() => writeJson(SETTINGS_KEY, settings), [settings]);

  const record = useCallback((key: string, score: number, passMark: number) => {
    let out!: VoiceResult;
    setResults((prev) => {
      out = nextResult(prev[key], score, passMark, Date.now());
      return { ...prev, [key]: out };
    });
    return out ?? nextResult(undefined, score, passMark, Date.now());
  }, []);
  const saveAnswer = useCallback((key: string, saved: SavedAnswer) => setAnswers((prev) => ({ ...prev, [key]: saved })), []);
  const setSettings = useCallback((s: Partial<VoiceSettings>) => setAll((prev) => ({ ...prev, ...s })), []);
  const value = useMemo(
    () => ({ results, record, answers, saveAnswer, settings, setSettings }),
    [results, record, answers, saveAnswer, settings, setSettings],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVoice() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useVoice must be used inside <VoiceProvider>');
  return ctx;
}
