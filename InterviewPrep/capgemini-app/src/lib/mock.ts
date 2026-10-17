import { ALL_PROBLEMS, ALL_QUESTIONS, type Group } from '../chapters';
import type { Level } from './md';
import { rng, shuffle } from './random';

export type Format = 'coding' | 'balanced' | 'discussion';
export const FORMATS: Record<Format, { label: string; coding: number }> = {
  coding: { label: 'Coding heavy: 60% coding, the rest technical questions', coding: 0.6 },
  balanced: { label: 'Balanced: 40% coding, 60% technical questions', coding: 0.4 },
  discussion: { label: 'Technical deep dive: 25% coding, 75% questions', coding: 0.25 },
};

export type MockItem = { kind: 'question' | 'problem'; key: string; minutes: number };
export type MockPlan = { format: Format; length: number; seed: number; items: MockItem[] };

const PROBLEM_MINUTES: Record<Level, number> = { easy: 10, medium: 20, hard: 30 };
const QUESTION_MINUTES = 3;
const INTRO_MINUTES = 5; // introductions, and your questions for them at the end

// How technical questions are spread across topics, roughly matching the JD: required qualifications first,
// with extra weight on real-time streaming because it is central to the role and the main gap on the resume.
const WEIGHTS: [Group, number][] = [
  ['Real-time streaming', 5],
  ['React and TypeScript', 5],
  ['Backend services', 4],
  ['Data', 3],
  ['Testing', 2],
  ['Security and identity', 2],
  ['GCP and delivery', 2],
  ['Agentic AI', 2],
  ['System design', 2],
];

/** Build a timed round: an opening question, technical questions by topic weight, then coding problems. */
export function buildMock(format: Format, length: number, seed: number, coreOnly: boolean): MockPlan {
  const rand = rng(seed);
  const codingBudget = Math.round((length - INTRO_MINUTES) * FORMATS[format].coding);
  const questionBudget = length - INTRO_MINUTES - codingBudget;

  // Coding: a React task first when there is room for one (the role is front-end heavy), then a medium
  // TypeScript, async or algorithm problem, then easy or medium problems to fill the time.
  const coding = shuffle(ALL_PROBLEMS.filter((x) => x.chapter.group === 'Live coding' && x.p.level !== 'hard'), seed);
  const react = coding.find((x) => x.chapter.id === 'code-react-live' && x.p.level === 'medium');
  const rest = coding.filter((x) => x.chapter.id !== 'code-react-live');
  const medium = rest.find((x) => x.p.level === 'medium');
  // A React task needs room for itself plus at least one warm-up (60% of a 60-minute round has 33 minutes).
  const roomForReact = codingBudget >= PROBLEM_MINUTES.medium + PROBLEM_MINUTES.easy;
  const ordered = [...(react && roomForReact ? [react] : []), ...(medium ? [medium] : []), ...rest.filter((x) => x !== medium)];
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
