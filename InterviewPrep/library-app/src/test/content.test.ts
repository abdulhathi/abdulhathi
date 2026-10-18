import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHAPTERS, CONTENT_IDS, findChapter, PRACTICE_PAGES, REGISTERED_IDS, STACKS, TRACK_SLOTS } from '../chapters';
import { problemsOf, questionsOf, slug } from '../lib/md';
import { QUESTION_TOPICS } from '../lib/topics';
import { TRACKS } from '../tracks';

// Run one chapter's checks with: npx vitest run src/test/content.test.ts -t <id>
const LANGS = new Set(['python', 'ts', 'tsx', 'sql', 'bash', 'text', 'json', 'yaml', 'dockerfile', 'http', 'xml', 'html', 'css', 'diff', 'ini', 'toml', 'proto', 'hcl', 'graphql', 'js']);

const written = CHAPTERS.filter((c) => CONTENT_IDS.includes(c.id));
const raw = (id: string) => readFileSync(resolve(__dirname, `../../content/${id}.md`), 'utf8');

/** Every `#/id` or `#/id/anchor` link in a chapter's Markdown. */
const linksOf = (text: string) => [...text.matchAll(/\]\(#\/([a-z0-9-]+)(?:\/([a-z0-9-]+))?\)/g)].map((m) => ({ id: m[1], anchor: m[2] }));

/** The anchors a chapter page has: its sections, questions and problems. */
function anchorsOf(id: string) {
  const c = findChapter(id);
  if (!c) return new Set<string>();
  return new Set([
    ...c.doc.sections.map((s) => `s-${slug(s.title)}`),
    ...questionsOf(c.doc).map((q) => q.id),
    ...problemsOf(c.doc).map((p) => p.id),
  ]);
}

describe('the library and its tracks', () => {
  it('has a Markdown file for every registered chapter', () => {
    expect(REGISTERED_IDS.filter((id) => !CONTENT_IDS.includes(id))).toEqual([]);
  });
  it('registers every Markdown file', () => {
    expect(CONTENT_IDS.filter((id) => !REGISTERED_IDS.includes(id))).toEqual([]);
  });
  it('puts every library chapter in exactly one stack', () => {
    const ids = STACKS.flatMap((s) => s.chapters);
    expect(ids.filter((x, i) => ids.indexOf(x) !== i)).toEqual([]);
  });
  it.each(TRACKS.map((t) => [t.id, t] as const))('%s: plans only library chapters, once each, and owns its start chapters', (id, track) => {
    const library = new Set(STACKS.flatMap((s) => s.chapters));
    const planned = track.plan.map(([cid]) => cid);
    expect(planned.filter((cid) => !library.has(cid))).toEqual([]);
    expect(planned.filter((cid, i) => planned.indexOf(cid) !== i)).toEqual([]);
    expect(track.start.every((cid) => cid.startsWith(`${id}-`))).toBe(true);
    expect(track.mock.coding.filter((cid) => !library.has(cid))).toEqual([]);
    if (track.mock.first) expect(track.mock.coding).toContain(track.mock.first);
  });
});

describe.each(written.map((c) => [c.id, c] as const))('%s', (id, chapter) => {
  const text = raw(id);
  const { doc } = chapter;
  const questions = questionsOf(doc);
  const problems = problemsOf(doc);

  it(`${id}: has front matter and an introduction`, () => {
    expect(doc.front.title, 'title').not.toBe('');
    expect(doc.front.goal, 'goal').not.toBe('');
    expect(doc.front.minutes, 'minutes').toBeGreaterThan(0);
    expect(doc.intro, 'intro paragraph before the first ## heading').not.toBe('');
  });

  it(`${id}: has enough practice`, () => {
    if (chapter.kind === 'track') return;
    if (chapter.kind === 'coding') expect(problems.length, 'coding problems').toBeGreaterThanOrEqual(8);
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
    text.split('\n').forEach((line, i) => {
      const f = line.match(/^\s*```+\s*(\S*)/);
      if (f) {
        if (!fence) expect(LANGS.has(f[1]) ? f[1] : `line ${i + 1}: unknown language "${f[1]}"`).toBe(f[1] || 'missing');
        fence = !fence;
        return;
      }
      if (!fence) expect(line.startsWith('# ') ? `line ${i + 1} is an H1` : '').toBe('');
    });
    // Upper case only: a "todo list" problem is fine, a TODO marker is not.
    expect(text).not.toMatch(/\b(TODO|TBD|FIXME)\b/);
    expect(text).not.toMatch(/lorem ipsum/i);
    // Raw invisible characters hide what a test string really contains; write \uFEFF instead.
    expect(text).not.toMatch(/[\uFEFF\uFFFD\u200B]/);
  });

  it(`${id}: links only to chapters and anchors that exist`, () => {
    const pages = new Set([...REGISTERED_IDS, ...PRACTICE_PAGES.map((p) => p.id), 'track', ...TRACK_SLOTS]);
    for (const link of linksOf(text)) {
      expect(pages.has(link.id) ? 'ok' : `#/${link.id} is not a chapter`).toBe('ok');
      if (link.anchor && findChapter(link.id) && link.id !== 'track') {
        expect(anchorsOf(link.id).has(link.anchor) ? 'ok' : `#/${link.id}/${link.anchor}: no such anchor`).toBe('ok');
      }
    }
  });

  it(`${id}: library chapters stay neutral about any one job`, () => {
    if (chapter.kind === 'track') return;
    // Company names and JD talk belong in the tracks; the library is reused across job descriptions.
    expect(text).not.toMatch(/\b(CitiusTech|Capgemini)\b/);
    expect(text).not.toMatch(/\b(the JD|this JD|job description)\b/i);
  });
});

describe('question topics', () => {
  const all = CHAPTERS.flatMap((c) => questionsOf(c.doc).map((q) => ({ key: `${c.id}/${q.id}`, chapter: c })));

  it('names a topic (or null) for every question, as CONTENT-GUIDE.md asks', () => {
    expect(all.filter((x) => !(x.key in QUESTION_TOPICS)).map((x) => x.key)).toEqual([]);
  });

  it('points every topic at a prose section of the question’s own chapter, and keeps no entries for removed questions', () => {
    const known = new Set(all.map((x) => x.key));
    expect(Object.keys(QUESTION_TOPICS).filter((k) => !known.has(k))).toEqual([]);
    const broken = all.filter(({ key, chapter }) => {
      const anchor = QUESTION_TOPICS[key];
      return anchor !== null && anchor !== undefined && !chapter.doc.sections.some((s) => s.kind === 'prose' && `s-${slug(s.title)}` === anchor);
    });
    expect(broken.map((x) => `${x.key} → ${QUESTION_TOPICS[x.key]}`)).toEqual([]);
  });
});
