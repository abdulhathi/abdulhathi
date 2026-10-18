// @vitest-environment node
// The prep plans: well-formed days, links that resolve to real hub pages, and nothing private in a public file.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APPS, findApp } from '../src/apps';
import { at, PLANS } from '../src/plans';
import { allPages } from './pages';

const portfolio = join(import.meta.dirname, '..', '..');
const pages = allPages(APPS, portfolio);

describe.each(PLANS.map((p) => [p.id, p] as const))('plan %s', (_, plan) => {
  it('has unique block ids, and blocks that run forward in time without overlapping', () => {
    const ids = plan.days.flatMap((d) => d.blocks.map((b) => b.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const day of plan.days) {
      let last = 0;
      for (const b of day.blocks) {
        const start = at(plan, day.date, b.start).getTime();
        const end = at(plan, day.date, b.end).getTime();
        expect(end, `${b.id} ends after it starts`).toBeGreaterThan(start);
        expect(start, `${b.id} starts after the previous block ends`).toBeGreaterThanOrEqual(last);
        last = end;
      }
    }
  });

  it('links only to real apps and to pages the hub lists', () => {
    for (const day of plan.days)
      for (const b of day.blocks)
        for (const l of b.links ?? []) {
          if ('url' in l) {
            expect(l.url, b.id).toMatch(/^https:\/\//);
            continue;
          }
          expect(findApp(l.app), `${b.id}: app ${l.app}`).toBeDefined();
          if ('page' in l && l.page) expect(pages[l.app].map((p) => p.id), `${b.id}: ${l.app}/${l.page}`).toContain(l.page);
        }
  });

  it('puts the milestones in order, inside or just after the plan', () => {
    const times = plan.milestones.map((m) => new Date(m.at).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(times.every((t) => !Number.isNaN(t))).toBe(true);
  });
});

it('states the Walmart deadline correctly in Pacific time (11:17 AM Eastern)', () => {
  const plan = PLANS.find((p) => p.id === 'oct-19-frontend-genai-and-walmart')!;
  const deadline = plan.milestones.find((m) => m.id === 'walmart-deadline')!;
  expect(new Date(deadline.at).toISOString()).toBe(new Date('2026-10-21T11:17:00-04:00').toISOString());
  // The planned test ends before the deadline.
  const test = plan.days.flatMap((d) => d.blocks.map((b) => ({ b, d }))).find(({ b }) => b.id === 'tue-test')!;
  expect(at(plan, test.d.date, test.b.end).getTime()).toBeLessThan(new Date(deadline.at).getTime());
});

it('keeps private details out of the public plans file', () => {
  const text = readFileSync(join(import.meta.dirname, '..', 'src', 'plans.ts'), 'utf8');
  expect(text).not.toMatch(/infovision|aspire|e-?it professionals|recruiter:|@[a-z0-9-]+\.(com|net|org)|\$\s?\d|\b\d{3}[ .-]\d{3}[ .-]\d{4}\b/i);
});
