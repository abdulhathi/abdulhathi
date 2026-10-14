// Rough study-time estimates, shared by the hero and the study plan, so both always agree with the data.
import { CHAPTERS, type Group } from '../chapters';
import { PLACED } from '../topics';
import { mustLookup, type Difficulty } from './leetcode';

/** Minutes for a first solve including hints and reading the approach. Deliberately generous. */
export const MINUTES: Record<Difficulty, number> = { Easy: 20, Medium: 40, Hard: 70 };
/** Hours to read a topic chapter, step through its walkthroughs and do the exercises. */
export const CHAPTER_HOURS = 2.5;
export const HOURS_PER_WEEK = 10;

export type PhaseEstimate = {
  group: Group;
  chapters: number;
  problems: number;
  core: number;
  coreHours: number;
  allHours: number;
};

export function phaseEstimates(): PhaseEstimate[] {
  const groups = [...new Set(CHAPTERS.filter((c) => c.kind === 'topic').map((c) => c.group))];
  return groups.map((group) => {
    const ids = new Set(CHAPTERS.filter((c) => c.group === group).map((c) => c.id));
    // Count each problem once, in the first chapter that lists it.
    const seen = new Set<number>();
    const list = PLACED.filter((p) => ids.has(p.topicId) && !seen.has(p.problem.id) && seen.add(p.problem.id));
    const mins = (core: boolean) =>
      list.filter((p) => !core || p.problem.core).reduce((sum, p) => sum + MINUTES[mustLookup(p.problem.id).difficulty], 0);
    const chapterHours = ids.size * CHAPTER_HOURS;
    return {
      group,
      chapters: ids.size,
      problems: list.length,
      core: list.filter((p) => p.problem.core).length,
      coreHours: Math.round(chapterHours + mins(true) / 60),
      allHours: Math.round(chapterHours + mins(false) / 60),
    };
  });
}

export function totals() {
  const phases = phaseEstimates();
  const sum = (f: (p: PhaseEstimate) => number) => phases.reduce((s, p) => s + f(p), 0);
  const coreHours = sum((p) => p.coreHours);
  const allHours = sum((p) => p.allHours);
  return {
    coreHours,
    allHours,
    coreWeeks: Math.ceil(coreHours / HOURS_PER_WEEK),
    allWeeks: Math.ceil(allHours / HOURS_PER_WEEK),
  };
}
