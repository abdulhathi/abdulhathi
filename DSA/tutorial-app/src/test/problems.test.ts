import { describe, expect, it } from 'vitest';
import { addDays, dueIds, nextRecord } from '../lib/problems';

describe('review schedule', () => {
  const today = '2026-10-12';

  it('schedules a solved problem 3 days out, then 7, 15 and 30, then masters it', () => {
    let rec = nextRecord(undefined, { status: 'solved' }, today);
    expect(rec).toEqual({ status: 'solved', step: 0, due: '2026-10-15' });
    rec = nextRecord(rec, { remembered: true }, '2026-10-15');
    expect(rec).toEqual({ status: 'solved', step: 1, due: '2026-10-22' });
    rec = nextRecord(rec, { remembered: true }, '2026-10-22');
    expect(rec?.due).toBe('2026-11-06');
    rec = nextRecord(rec, { remembered: true }, '2026-11-06');
    expect(rec?.due).toBe('2026-12-06');
    rec = nextRecord(rec, { remembered: true }, '2026-12-06');
    expect(rec).toEqual({ status: 'mastered' });
  });

  it('brings a forgotten problem back tomorrow and restarts the gaps', () => {
    const rec = nextRecord({ status: 'solved', step: 2, due: today }, { remembered: false }, today);
    expect(rec).toEqual({ status: 'solved', step: 0, due: '2026-10-13' });
  });

  it('clears the record when set back to not started, and keeps a schedule when re-marked solved', () => {
    expect(nextRecord({ status: 'tried' }, { status: 'new' }, today)).toBeUndefined();
    const solved = { status: 'solved' as const, step: 1, due: '2026-10-20' };
    expect(nextRecord(solved, { status: 'solved' }, today)).toBe(solved);
  });

  it('lists due problems oldest first and handles month ends', () => {
    expect(addDays('2026-01-30', 3)).toBe('2026-02-02');
    const records = {
      1: { status: 'solved' as const, step: 0, due: '2026-10-12' },
      2: { status: 'solved' as const, step: 0, due: '2026-10-01' },
      3: { status: 'solved' as const, step: 0, due: '2026-10-13' },
      4: { status: 'mastered' as const },
    };
    expect(dueIds(records, today)).toEqual([2, 1]);
  });
});
