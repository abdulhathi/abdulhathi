import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findChapter } from '../chapters';
import { PROFILE_SKILLS } from '../credentials';
import { speakingStats } from '../lib/speech';
import { needsWork, nextResult, REVIEW_DAYS } from '../lib/voice';
import { PATHS, projectFor, resourcesFor } from '../paths';

const DAY = 86_400_000;
const PROJECT_SECTIONS = ['What you will build', 'What it proves', 'Architecture', 'Milestones', 'Tests and CI', 'README checklist', 'Talking about it in an interview', 'LinkedIn post template', 'Resume bullet'];
const jsonIds = readdirSync(resolve(__dirname, '../paths')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
const projectIds = readdirSync(resolve(__dirname, '../../projects')).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3));

describe('learning paths', () => {
  it('have unique ids, real chapters and profile skills', () => {
    const ids = PATHS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PATHS) {
      for (const id of [...p.chapters, ...(p.coding ?? [])]) expect(findChapter(id), `${p.id}: ${id}`).toBeDefined();
      expect(PROFILE_SKILLS[p.id]?.length, p.id).toBeGreaterThan(0);
    }
  });

  it('have resources and project files only for known paths', () => {
    const known = new Set(PATHS.map((p) => p.id));
    expect(jsonIds.filter((id) => !known.has(id))).toEqual([]);
    expect(projectIds.filter((id) => !known.has(id))).toEqual([]);
  });

  it.each(jsonIds)('%s: resources are complete, dated and link to https pages', (id) => {
    const r = resourcesFor(id);
    expect(r.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.courses.length).toBeGreaterThanOrEqual(1);
    expect(r.portals.length).toBeGreaterThanOrEqual(3);
    expect(r.assessments.length).toBeGreaterThanOrEqual(1);
    for (const x of [...r.courses, ...r.portals, ...r.assessments]) expect(x.url, JSON.stringify(x)).toMatch(/^https:\/\/[^\s]+$/);
    for (const c of r.courses) for (const f of ['title', 'provider', 'duration', 'why'] as const) expect(c[f], `${id} course ${f}`).toBeTruthy();
    for (const a of r.assessments) for (const f of ['name', 'provider', 'cost', 'format', 'credential', 'why'] as const) expect(a[f], `${id} assessment ${f}`).toBeTruthy();
    const urls = [...r.courses, ...r.assessments].map((x) => x.url);
    expect(new Set(urls).size, 'a course or assessment URL is listed twice').toBe(urls.length);
  });

  it.each(projectIds)('%s: project brief has front matter and every section', (id) => {
    const p = projectFor(id)!;
    expect(p.title).not.toBe(id);
    expect(p.summary).not.toBe('');
    for (const s of PROJECT_SECTIONS) expect(Object.keys(p.sections), `${id}: ## ${s}`).toContain(s);
  });
});

describe('voice results and spaced review', () => {
  const now = 1_000 * DAY;
  it('a passing answer passes the question and schedules the first review', () => {
    const r = nextResult(undefined, 85, 80, now);
    expect(r).toMatchObject({ passed: true, stage: 0, best: 85, attempts: 1 });
    expect(r.dueAt).toBe(now + REVIEW_DAYS[0] * DAY);
    expect(needsWork(r, now)).toBe(false);
    expect(needsWork(r, now + REVIEW_DAYS[0] * DAY)).toBe(true);
  });
  it('a failing answer keeps a new question in the queue', () => {
    const r = nextResult(undefined, 60, 80, now);
    expect(r).toMatchObject({ passed: false, best: 60 });
    expect(needsWork(r, now)).toBe(true);
  });
  it('passing a due review moves to a longer interval; failing it starts again', () => {
    const first = nextResult(undefined, 90, 80, now);
    const due = first.dueAt!;
    const reviewed = nextResult(first, 88, 80, due);
    expect(reviewed).toMatchObject({ passed: true, stage: 1, dueAt: due + REVIEW_DAYS[1] * DAY });
    const failed = nextResult(reviewed, 50, 80, reviewed.dueAt!);
    expect(failed).toMatchObject({ passed: false, stage: 0 });
    expect(failed.best).toBe(90);
  });
  it('answering a passed question again before it is due does not reset it', () => {
    const first = nextResult(undefined, 90, 80, now);
    expect(nextResult(first, 40, 80, now + DAY)).toMatchObject({ passed: true, stage: 0, dueAt: first.dueAt });
  });
});

describe('speaking stats', () => {
  it('counts words, pace and filler words', () => {
    const s = speakingStats('Um so basically the cache is like checked first, you know, um then the database', 15_000);
    expect(s.words).toBe(15);
    expect(s.wpm).toBe(60);
    expect(s.fillerCount).toBe(5);
    expect(s.fillers.find((f) => f.word === 'um')?.count).toBe(2);
  });
  it('has no pace without recording time', () => {
    expect(speakingStats('typed answer', 0).wpm).toBeNull();
  });
});
