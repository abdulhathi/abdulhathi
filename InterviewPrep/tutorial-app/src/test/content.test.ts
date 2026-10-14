import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHAPTERS, CONTENT_IDS, REGISTERED_IDS } from '../chapters';
import { problemsOf, questionsOf } from '../lib/md';

// Run one chapter's checks with: npx vitest run src/test/content.test.ts -t <id>
const LANGS = new Set(['python', 'ts', 'tsx', 'sql', 'bash', 'text', 'json', 'yaml', 'dockerfile', 'http', 'xml', 'html', 'css', 'diff', 'ini', 'toml']);

const written = CHAPTERS.filter((c) => CONTENT_IDS.includes(c.id));

describe('the chapter list', () => {
  it('has a Markdown file for every registered chapter', () => {
    expect(REGISTERED_IDS.filter((id) => !CONTENT_IDS.includes(id))).toEqual([]);
  });
  it('registers every Markdown file', () => {
    expect(CONTENT_IDS.filter((id) => !REGISTERED_IDS.includes(id))).toEqual([]);
  });
});

describe.each(written.map((c) => [c.id, c] as const))('%s', (id, chapter) => {
  const raw = readFileSync(resolve(__dirname, `../../content/${id}.md`), 'utf8');
  const { doc } = chapter;
  const questions = questionsOf(doc);
  const problems = problemsOf(doc);
  const isCoding = chapter.group === 'Live coding';
  const isGuide = chapter.group === 'Start here';

  it(`${id}: has front matter and an introduction`, () => {
    expect(doc.front.title, 'title').not.toBe('');
    expect(doc.front.goal, 'goal').not.toBe('');
    expect(doc.front.minutes, 'minutes').toBeGreaterThan(0);
    expect(doc.intro, 'intro paragraph before the first ## heading').not.toBe('');
  });

  it(`${id}: has enough practice`, () => {
    if (isGuide) return;
    if (isCoding) expect(problems.length, 'coding problems').toBeGreaterThanOrEqual(8);
    else expect(questions.length, 'interview questions').toBeGreaterThanOrEqual(10);
  });

  it(`${id}: every question has an answer and known tags, and ids are unique`, () => {
    for (const q of questions) {
      expect(q.body, q.title).not.toBe('');
      expect(q.tags.filter((t) => !['core', 'deep'].includes(t)), q.title).toEqual([]);
    }
    const ids = [...questions.map((q) => q.id), ...problems.map((p) => p.id)];
    expect(ids.filter((x, i) => ids.indexOf(x) !== i)).toEqual([]);
  });

  it(`${id}: every problem has a statement, hints and a solution with code`, () => {
    for (const p of problems) {
      expect(p.statement, `${p.title}: statement`).not.toBe('');
      expect(p.hints.length, `${p.title}: hints`).toBeGreaterThanOrEqual(2);
      expect(p.solution, `${p.title}: solution`).toMatch(/```/);
      expect(p.unknown, `${p.title}: only Hints, Solution and Follow-ups are allowed as #### headings`).toEqual([]);
      expect(p.tags.filter((t) => t !== 'core'), p.title).toEqual([]);
    }
  });

  it(`${id}: uses known code languages, no H1 and no placeholders`, () => {
    let fence = false;
    raw.split('\n').forEach((line, i) => {
      const f = line.match(/^\s*```+\s*(\S*)/);
      if (f) {
        if (!fence) expect(LANGS.has(f[1]) ? f[1] : `line ${i + 1}: unknown language "${f[1]}"`).toBe(f[1] || 'missing');
        fence = !fence;
        return;
      }
      if (!fence) expect(line.startsWith('# ') ? `line ${i + 1} is an H1` : '').toBe('');
    });
    // Upper case only: a "todo list" problem is fine, a TODO marker is not.
    expect(raw).not.toMatch(/\b(TODO|TBD|FIXME)\b/);
    expect(raw).not.toMatch(/lorem ipsum/i);
  });
});
