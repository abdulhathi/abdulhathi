import { ALL_PROBLEMS, ALL_QUESTIONS, type StackId } from '../chapters';
import type { Track } from '../tracks';
import type { Level } from './md';
import { rng, shuffle } from './random';

export type MockItem = { kind: 'question' | 'problem'; key: string; minutes: number };
export type MockPlan = { track: Track['id']; format: string; length: number; seed: number; items: MockItem[] };

export const PROBLEM_MINUTES: Record<Level, number> = { easy: 10, medium: 20, hard: 30 };
const QUESTION_MINUTES = 3;
export const INTRO_MINUTES = 5; // introductions, and your questions for them at the end

/**
 * A timed round for one track: its stories chapter opens, then technical questions from the chapters in its plan
 * (spread across stacks by the track's weights), then coding problems from its coding chapters.
 */
export function buildMock(track: Track, format: string, length: number, seed: number, coreOnly: boolean): MockPlan {
  const rand = rng(seed);
  const share = track.mock.formats[format]?.coding ?? Object.values(track.mock.formats)[0].coding;
  const codingBudget = Math.round((length - INTRO_MINUTES) * share);
  const questionBudget = length - INTRO_MINUTES - codingBudget;

  // Coding: the track's first chapter (a React task for front-end roles) when there is room for it and a warm-up,
  // then a medium problem, then easy or medium problems to fill the time.
  const pool = shuffle(ALL_PROBLEMS.filter((x) => track.mock.coding.includes(x.chapter.id) && x.p.level !== 'hard'), seed);
  const lead = track.mock.first ? pool.find((x) => x.chapter.id === track.mock.first && x.p.level === 'medium') : undefined;
  const rest = pool.filter((x) => x.chapter.id !== track.mock.first);
  const medium = rest.find((x) => x.p.level === 'medium');
  const roomForLead = codingBudget >= PROBLEM_MINUTES.medium + PROBLEM_MINUTES.easy;
  const ordered = [...(lead && roomForLead ? [lead] : []), ...(medium ? [medium] : []), ...rest.filter((x) => x !== medium)];
  const problems: MockItem[] = [];
  let left = codingBudget;
  for (const x of ordered) {
    const m = PROBLEM_MINUTES[x.p.level];
    if (m <= left) {
      problems.push({ kind: 'problem', key: x.key, minutes: m });
      left -= m;
    }
    if (left < PROBLEM_MINUTES.easy) break;
  }

  // Technical questions: pick a stack by weight, then an unused question from the track's chapters in that stack.
  const inPlan = new Set(track.plan.filter(([, p]) => p !== 'optional').map(([id]) => id));
  const opener = ALL_QUESTIONS.find((x) => x.chapter.id === track.start[2]);
  const candidates = ALL_QUESTIONS.filter((x) => inPlan.has(x.chapter.id) && x.chapter.kind === 'topic' && (!coreOnly || x.q.tags.includes('core')));
  const weights = (Object.entries(track.mock.weights) as [StackId, number][]).filter(([s]) => candidates.some((x) => x.chapter.stack === s));
  const byStack = new Map(weights.map(([s]) => [s, shuffle(candidates.filter((x) => x.chapter.stack === s), Math.floor(rand() * 2 ** 31))]));
  const total = weights.reduce((s, [, w]) => s + w, 0);
  const count = Math.max(1, Math.floor((questionBudget - (opener ? QUESTION_MINUTES : 0)) / QUESTION_MINUTES));
  const questions: MockItem[] = opener ? [{ kind: 'question', key: opener.key, minutes: QUESTION_MINUTES }] : [];
  for (let tries = 0; questions.length < count + (opener ? 1 : 0) && tries < 500 && total > 0; tries++) {
    let r = rand() * total;
    const stack = weights.find(([, w]) => (r -= w) < 0)?.[0] ?? weights[0][0];
    const next = byStack.get(stack)?.shift();
    if (next) questions.push({ kind: 'question', key: next.key, minutes: QUESTION_MINUTES });
  }

  return { track: track.id, format, length, seed, items: [...questions, ...problems] };
}
