import { useCallback, useEffect, useState } from 'react';
import { at, type Block, type Plan, type PlanDay } from '../plans';

export type Slot = { block: Block; day: PlanDay; start: Date; end: Date };

/** Every block of the plan with its real start and end, in order. */
export function slotsOf(plan: Plan): Slot[] {
  return plan.days.flatMap((day) => day.blocks.map((block) => ({ block, day, start: at(plan, day.date, block.start), end: at(plan, day.date, block.end) })));
}

/** The block under way now (breaks included), and the next block that is not a break. */
export function whereAmI(plan: Plan, now: Date) {
  const slots = slotsOf(plan);
  const current = slots.find((s) => s.start <= now && now < s.end);
  const next = slots.find((s) => s.start > now && s.block.kind !== 'break');
  return { current, next };
}

/** Blocks you can tick off: everything except breaks. */
export const countable = (blocks: Block[]) => blocks.filter((b) => b.kind !== 'break');

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "13:30" → "1:30 PM", as written in the plan (the plan's own time zone, not the viewer's). */
export function clock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "2026-10-19" → "Monday, Oct 19". */
export function dayLabel(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** An ISO time with an offset ("2026-10-19T13:00:00-07:00") → "Monday, Oct 19 · 1:00 PM", in that offset. */
export function momentLabel(iso: string): string {
  return `${dayLabel(iso.slice(0, 10))} · ${clock(iso.slice(11, 16))}`;
}

/** Time left until `target`: "2 d 3 h", "5 h 20 min", "12 min", or null once it has passed. */
export function countdown(target: Date, now: Date): string | null {
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return null;
  const min = Math.ceil(ms / 60_000);
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

/** The current time, refreshed every `everyMs`. */
export function useNow(everyMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

const key = (planId: string) => `study-hub.plan.${planId}`;

/** Which blocks are done, remembered in this browser (a per-viewer convenience: it may be empty elsewhere). */
export function useDone(planId: string) {
  const [done, setDone] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(key(planId)) ?? '[]') as string[]);
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key(planId), JSON.stringify([...done]));
    } catch {
      /* ticks last for this visit only */
    }
  }, [planId, done]);
  const toggle = useCallback(
    (id: string) =>
      setDone((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );
  const reset = useCallback(() => setDone(new Set()), []);
  return { done, toggle, reset };
}
