// A snapshot of LeetCode's public problem list: number, URL slug, title,
// difficulty, premium flag and topic tags. Refresh it with `npm run snapshot`.
// Imported as text: TypeScript would otherwise infer a type for all 4,000+ rows.
import raw from '../data/leetcode.json?raw';

export type Difficulty = 'Easy' | 'Medium' | 'Hard';
export type LeetCodeProblem = {
  id: number;
  slug: string;
  title: string;
  difficulty: Difficulty;
  premium: boolean;
  tags: string[];
};

type Row = [slug: string, title: string, difficulty: number, premium: number, tags: number[]];

type Snapshot = { date: string; total: number; tags: string[]; problems: Record<string, Row> };

const data = JSON.parse(raw) as Snapshot;
const DIFFICULTY: Difficulty[] = ['Easy', 'Medium', 'Hard'];
const rows = data.problems;

export const SNAPSHOT_DATE: string = data.date;
export const SNAPSHOT_TOTAL: number = data.total;
export const ALL_TAGS: readonly string[] = data.tags;

/** LeetCode tags that are not about algorithms: SQL, bash and threads. The lab leaves them out. */
export const NON_DSA_TAGS = ['Database', 'Shell', 'Concurrency'] as const;

const cache = new Map<number, LeetCodeProblem>();

export function lookup(id: number): LeetCodeProblem | undefined {
  const hit = cache.get(id);
  if (hit) return hit;
  const row = rows[String(id)];
  if (!row) return undefined;
  const [slug, title, d, paid, tags] = row;
  // A few LeetCode titles carry stray spaces; show them trimmed.
  const problem = { id, slug, title: title.trim(), difficulty: DIFFICULTY[d], premium: paid === 1, tags: tags.map((t) => ALL_TAGS[t]) };
  cache.set(id, problem);
  return problem;
}

export function mustLookup(id: number): LeetCodeProblem {
  const p = lookup(id);
  if (!p) throw new Error(`LeetCode problem ${id} is not in the snapshot`);
  return p;
}

export const problemUrl = (slug: string) => `https://leetcode.com/problems/${slug}/`;

let counts: Map<string, number> | undefined;

/** How many LeetCode problems carry this tag. */
export function tagCount(tag: string): number {
  if (!counts) {
    counts = new Map();
    for (const [, , , , tags] of Object.values(rows)) {
      for (const t of tags) counts.set(ALL_TAGS[t], (counts.get(ALL_TAGS[t]) ?? 0) + 1);
    }
  }
  return counts.get(tag) ?? 0;
}

/** Every problem number in the snapshot, ascending. */
export function allIds(): number[] {
  return Object.keys(rows).map(Number).sort((a, b) => a - b);
}
