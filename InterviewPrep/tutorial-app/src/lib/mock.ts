import { ALL_PROBLEMS, ALL_QUESTIONS, type Group } from '../chapters';
import type { Level } from './md';
import { rng, shuffle } from './random';

export type Format = 'coding' | 'discussion';
export const FORMATS: Record<Format, { label: string; coding: number }> = {
  coding: { label: '60% coding, 40% technical questions', coding: 0.6 },
  discussion: { label: '30% coding, 60% technical questions', coding: 0.3 },
};

export type MockItem = { kind: 'question' | 'problem'; key: string; minutes: number };
export type MockPlan = { format: Format; length: number; seed: number; items: MockItem[] };

const PROBLEM_MINUTES: Record<Level, number> = { easy: 10, medium: 20, hard: 30 };
const QUESTION_MINUTES = 3;
const INTRO_MINUTES = 5; // introductions, and your questions for them at the end

// How technical questions are spread across topics, roughly matching the JD: mandatory skills first.
const WEIGHTS: [Group, number][] = [
  ['Core Python', 5],
  ['Backend and data', 3],
  ['React', 3],
  ['Healthcare domain', 3],
  ['Machine learning', 3],
  ['Generative AI', 2],
  ['Platform and design', 1],
];

/** Build a timed round: an opening question, technical questions by topic weight, then coding problems. */
export function buildMock(format: Format, length: number, seed: number, coreOnly: boolean): MockPlan {
  const rand = rng(seed);
  const codingBudget = Math.round((length - INTRO_MINUTES) * FORMATS[format].coding);
  const questionBudget = length - INTRO_MINUTES - codingBudget;

  // Coding: mostly Python, starting with a medium, then fill the time with easy or medium problems.
  const python = shuffle(ALL_PROBLEMS.filter((x) => x.chapter.id !== 'code-react' && x.chapter.group === 'Live coding' && x.p.level !== 'hard'), seed);
  const problems: MockItem[] = [];
  let left = codingBudget;
  const first = python.find((x) => x.p.level === 'medium');
  for (const x of first ? [first, ...python.filter((y) => y !== first)] : python) {
    const m = PROBLEM_MINUTES[x.p.level];
    if (m <= left) {
      problems.push({ kind: 'problem', key: x.key, minutes: m });
      left -= m;
    }
    if (left < PROBLEM_MINUTES.easy) break;
  }

  // Technical questions: pick a topic by weight, then an unused question from it.
  const opener = ALL_QUESTIONS.find((x) => x.chapter.id === 'stories');
  const pool = ALL_QUESTIONS.filter((x) => x.chapter.group !== 'Start here' && (!coreOnly || x.q.tags.includes('core')));
  const byGroup = new Map(WEIGHTS.map(([g]) => [g, shuffle(pool.filter((x) => x.chapter.group === g), Math.floor(rand() * 2 ** 31))]));
  const total = WEIGHTS.reduce((s, [, w]) => s + w, 0);
  const count = Math.max(1, Math.floor((questionBudget - (opener ? QUESTION_MINUTES : 0)) / QUESTION_MINUTES));
  const questions: MockItem[] = opener ? [{ kind: 'question', key: opener.key, minutes: QUESTION_MINUTES }] : [];
  for (let tries = 0; questions.length < count + (opener ? 1 : 0) && tries < 500; tries++) {
    let r = rand() * total;
    const group = WEIGHTS.find(([, w]) => (r -= w) < 0)?.[0] ?? WEIGHTS[0][0];
    const next = byGroup.get(group)?.shift();
    if (next) questions.push({ kind: 'question', key: next.key, minutes: QUESTION_MINUTES });
  }

  return { format, length, seed, items: [...questions, ...problems] };
}
