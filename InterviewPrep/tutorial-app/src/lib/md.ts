// Splits a chapter's Markdown into the pieces the app renders differently:
// open prose, interview question cards (answer hidden) and coding problems (hints and solution hidden).
// The format is described in CONTENT-GUIDE.md.

export type Front = { title: string; goal: string; minutes: number };

export type Question = {
  id: string; // anchor inside the chapter: q-<slug>
  title: string;
  tags: string[]; // 'core' = must know, 'deep' = follow-up or senior-level
  body: string;
};

export type Level = 'easy' | 'medium' | 'hard';

export type Problem = {
  id: string; // anchor inside the chapter: p-<slug>
  title: string;
  level: Level;
  tags: string[];
  statement: string;
  hints: string[];
  solution: string;
  followUps: string;
  unknown: string[]; // H4 headings that are not Hints, Solution or Follow-ups (the content test rejects them)
};

export type Section =
  | { kind: 'prose'; title: string; body: string }
  | { kind: 'questions'; title: string; intro: string; questions: Question[] }
  | { kind: 'problems'; title: string; intro: string; problems: Problem[] };

export type Doc = { front: Front; intro: string; sections: Section[] };

const LEVELS: Level[] = ['easy', 'medium', 'hard'];

export const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

/** "What is a closure? {core}" → title and tags. */
export function splitTags(heading: string) {
  const m = heading.match(/^(.*?)\s*\{([a-z\s-]+)\}\s*$/);
  if (!m) return { title: heading.trim(), tags: [] as string[] };
  return { title: m[1].trim(), tags: m[2].trim().split(/\s+/) };
}

function parseFront(raw: string): { front: Front; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const fields: Record<string, string> = {};
  if (m) {
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^(\w+):\s*(.*)$/);
      if (kv) fields[kv[1]] = kv[2].trim();
    }
  }
  return {
    front: { title: fields.title ?? '', goal: fields.goal ?? '', minutes: Number(fields.minutes) || 0 },
    body: m ? raw.slice(m[0].length) : raw,
  };
}

type Block = { heading: string; lines: string[] };

/** Split lines at headings of one depth, ignoring anything inside fenced code. */
function splitAt(lines: string[], depth: number): { before: string[]; blocks: Block[] } {
  const marker = '#'.repeat(depth) + ' ';
  const before: string[] = [];
  const blocks: Block[] = [];
  let fence: string | null = null;
  for (const line of lines) {
    const f = line.match(/^\s*(```+|~~~+)/);
    if (f) {
      if (fence === null) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
    }
    if (fence === null && line.startsWith(marker)) {
      blocks.push({ heading: line.slice(marker.length).trim(), lines: [] });
      continue;
    }
    (blocks.length ? blocks[blocks.length - 1].lines : before).push(line);
  }
  return { before, blocks };
}

const text = (lines: string[]) => lines.join('\n').trim();

/** "1. first\n   more\n2. second" → ["first\nmore", "second"] */
export function listItems(src: string): string[] {
  const items: string[] = [];
  for (const line of src.split('\n')) {
    const m = line.match(/^\s*(?:\d+[.)]|[-*])\s+(.*)$/);
    if (m && !/^\s{4,}/.test(line)) items.push(m[1]);
    else if (items.length && line.trim()) items[items.length - 1] += '\n' + line.trim();
  }
  return items;
}

function parseProblem(block: Block): Problem {
  const { title, tags } = splitTags(block.heading);
  const { before, blocks } = splitAt(block.lines, 4);
  const part = (name: string) => blocks.find((b) => b.heading.toLowerCase() === name);
  return {
    id: `p-${slug(title)}`,
    title,
    level: LEVELS.find((l) => tags.includes(l)) ?? 'medium',
    tags: tags.filter((t) => !(LEVELS as string[]).includes(t)),
    statement: text(before),
    hints: listItems(text(part('hints')?.lines ?? [])),
    solution: text(part('solution')?.lines ?? []),
    followUps: text(part('follow-ups')?.lines ?? []),
    unknown: blocks.map((b) => b.heading).filter((h) => !['hints', 'solution', 'follow-ups'].includes(h.toLowerCase())),
  };
}

export function parseDoc(raw: string): Doc {
  const { front, body } = parseFront(raw);
  const { before, blocks } = splitAt(body.split(/\r?\n/), 2);
  const sections: Section[] = blocks.map((b) => {
    if (/^interview questions/i.test(b.heading)) {
      const inner = splitAt(b.lines, 3);
      return {
        kind: 'questions',
        title: b.heading,
        intro: text(inner.before),
        questions: inner.blocks.map((q) => {
          const { title, tags } = splitTags(q.heading);
          return { id: `q-${slug(title)}`, title, tags, body: text(q.lines) };
        }),
      };
    }
    if (/^(coding|practice) problems/i.test(b.heading)) {
      const inner = splitAt(b.lines, 3);
      return { kind: 'problems', title: b.heading, intro: text(inner.before), problems: inner.blocks.map(parseProblem) };
    }
    return { kind: 'prose', title: b.heading, body: text(b.lines) };
  });
  return { front, intro: text(before), sections };
}

export const questionsOf = (doc: Doc) => doc.sections.flatMap((s) => (s.kind === 'questions' ? s.questions : []));
export const problemsOf = (doc: Doc) => doc.sections.flatMap((s) => (s.kind === 'problems' ? s.problems : []));
