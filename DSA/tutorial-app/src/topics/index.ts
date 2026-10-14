import type { Problem, Topic } from './types';

// Every src/topics/<chapter-id>.ts file exports `topic`. A named import of a missing
// export is a hard error in the browser, so this file and types.ts are excluded.
const modules = import.meta.glob<Topic>(['./*.ts', '!./index.ts', '!./types.ts', '!./*.test.ts'], { eager: true, import: 'topic' });

export const TOPICS: Record<string, Topic> = Object.fromEntries(
  Object.entries(modules).map(([path, topic]) => [path.replace(/^\.\/|\.ts$/g, ''), topic]),
);

export type PlacedProblem = { problem: Problem; topicId: string };

/** Every problem in every chapter, in chapter order once the registry sorts them. */
export const PLACED: PlacedProblem[] = Object.values(TOPICS).flatMap((t) => t.problems.map((problem) => ({ problem, topicId: t.id })));

/** Problem number → every chapter that teaches it (a problem may appear in more than one). */
export const PLACEMENTS: Map<number, PlacedProblem[]> = PLACED.reduce((map, p) => {
  map.set(p.problem.id, [...(map.get(p.problem.id) ?? []), p]);
  return map;
}, new Map<number, PlacedProblem[]>());
