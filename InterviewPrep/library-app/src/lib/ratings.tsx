import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { readJson, writeJson } from './storage';

// How the reader rated themselves on each question or problem, keyed "<chapter>/<card id>".
export type Rating = 'good' | 'shaky' | 'missed';
export const RATING_LABEL: Record<Rating, string> = { good: 'Nailed it', shaky: 'Shaky', missed: 'Missed' };

const KEY = 'interview-library.ratings';

type Ratings = {
  ratings: Readonly<Record<string, Rating>>;
  rate: (key: string, rating: Rating | null) => void;
  /** Set a rating without the toggle-off behaviour of rate (used by the voice interviewer). */
  setRating: (key: string, rating: Rating) => void;
};

const RatingsContext = createContext<Ratings | null>(null);

export function RatingsProvider({ children }: { children: ReactNode }) {
  const [ratings, setRatings] = useState<Record<string, Rating>>(() => readJson(KEY, {}));

  useEffect(() => writeJson(KEY, ratings), [ratings]);

  const rate = useCallback((key: string, rating: Rating | null) => {
    setRatings((prev) => {
      const next = { ...prev };
      if (rating === null || prev[key] === rating) delete next[key];
      else next[key] = rating;
      return next;
    });
  }, []);

  const setRating = useCallback((key: string, rating: Rating) => setRatings((prev) => (prev[key] === rating ? prev : { ...prev, [key]: rating })), []);

  const value = useMemo(() => ({ ratings, rate, setRating }), [ratings, rate, setRating]);
  return <RatingsContext.Provider value={value}>{children}</RatingsContext.Provider>;
}

export function useRatings() {
  const ctx = useContext(RatingsContext);
  if (!ctx) throw new Error('useRatings must be used inside <RatingsProvider>');
  return ctx;
}
