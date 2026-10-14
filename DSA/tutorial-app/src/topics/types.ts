/** A phrase in a problem statement that points to a technique. */
export type Signal = {
  see: string; // what you notice in the statement or the limits
  think: string; // the technique or structure to reach for
  why: string; // why that clue points there
};

/** A variant of the chapter's technique. Problems are grouped under these. */
export type Pattern = { name: string; idea: string };

/**
 * One LeetCode problem, taught as a technique. No code anywhere: the approach is plain-English
 * steps. The number, difficulty, premium flag and link come from the LeetCode snapshot;
 * `title` is checked against it so a wrong number cannot slip through.
 */
export type Problem = {
  id: number;
  title: string; // exactly as on LeetCode
  pattern: string; // one of the topic's pattern names
  core?: boolean; // part of the Core path, the must-do set
  summary: string; // the task in your own words, one or two sentences, no hints
  hints: string[]; // two to four, from a gentle nudge to a strong push
  insight: string; // the one idea that cracks it
  approach: string[]; // the method as plain-English steps
  ds: string[]; // data structures used
  time: string; // e.g. "O(n log n)"
  space: string;
  traps?: string[]; // edge cases and common mistakes
};

export type Topic = {
  id: string; // matches the chapter id
  patterns: Pattern[];
  signals: Signal[];
  problems: Problem[];
};
