import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { APPS } from '../apps';
import { clock, countdown, dayLabel, momentLabel, whereAmI } from '../lib/schedule';
import { parseRoute, planHref } from '../lib/route';
import { findPlan } from '../plans';

const plan = findPlan('oct-19-frontend-genai-and-walmart');
const pacific = (s: string) => new Date(`${s}-07:00`);

describe('schedule helpers', () => {
  it('writes times as the plan does, in 12-hour form', () => {
    expect(clock('13:30')).toBe('1:30 PM');
    expect(clock('12:00')).toBe('12:00 PM');
    expect(clock('00:05')).toBe('12:05 AM');
    expect(clock('09:00')).toBe('9:00 AM');
    expect(dayLabel('2026-10-19')).toBe('Monday, Oct 19');
    expect(momentLabel('2026-10-21T08:17:00-07:00')).toBe('Wednesday, Oct 21 · 8:17 AM');
  });

  it('counts down in days, hours or minutes, and stops at zero', () => {
    const now = pacific('2026-10-17T11:00:00');
    expect(countdown(pacific('2026-10-19T13:00:00'), now)).toBe('2 d 2 h');
    expect(countdown(pacific('2026-10-17T13:20:00'), now)).toBe('2 h 20 min');
    expect(countdown(pacific('2026-10-17T11:12:00'), now)).toBe('12 min');
    expect(countdown(pacific('2026-10-17T10:00:00'), now)).toBeNull();
  });

  it('finds the block under way and the next one that is not a break', () => {
    let w = whereAmI(plan, pacific('2026-10-17T12:20:00'));
    expect(w.current?.block.id).toBe('sat-streaming');
    expect(w.next?.block.id).toBe('sat-sse'); // lunch is skipped
    w = whereAmI(plan, pacific('2026-10-17T13:45:00'));
    expect(w.current?.block.id).toBe('sat-lunch');
    w = whereAmI(plan, pacific('2026-10-18T02:00:00'));
    expect(w.current).toBeUndefined();
    expect(w.next?.block.id).toBe('sun-angular-1');
    w = whereAmI(plan, pacific('2026-10-22T09:00:00'));
    expect(w).toEqual({ current: undefined, next: undefined });
  });

  it('routes #/plan and #/plan/<id>', () => {
    expect(parseRoute('#/plan')).toEqual({ view: 'plan', id: undefined });
    expect(parseRoute(planHref(plan.id))).toEqual({ view: 'plan', id: plan.id });
  });
});

describe('the Prep plan page', () => {
  beforeEach(() => {
    // Only the clock is faked, so timers and user events run normally.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(pacific('2026-10-17T12:20:00'));
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const url = String(input);
        if (url === '/api/status') return Response.json(APPS.map((a) => ({ id: a.id, up: false, managed: false })));
        if (url === '/api/pages') return Response.json({});
        return new Response('not found', { status: 404 });
      }),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const open = async () => {
    window.location.hash = '#/plan';
    render(<App />);
    await act(async () => {});
  };

  it('shows the countdowns, what to do now and next, and every day', async () => {
    await open();
    expect(screen.getByRole('heading', { level: 1, name: plan.title })).toBeInTheDocument();
    expect(document.title).toBe('Prep plan · Study Hub');
    const countdowns = screen.getByRole('region', { name: 'Countdowns' });
    expect(within(countdowns).getByText('in 2 d 0 h')).toBeInTheDocument(); // to Monday 1:00 PM
    expect(within(countdowns).getByText(/Wednesday, Oct 21 · 8:17 AM/)).toBeInTheDocument();
    const now = screen.getAllByText('Streaming LLM responses in the UI');
    expect(now.length).toBeGreaterThanOrEqual(2); // in the banner and in Saturday's list
    expect(document.querySelector('#block-sat-streaming')).toHaveAttribute('aria-current', 'time');
    expect(document.querySelector('#block-sat-setup')).toHaveClass('is-past');
    for (const day of plan.days) expect(screen.getByRole('heading', { level: 2, name: new RegExp(dayLabel(day.date)) })).toBeInTheDocument();
  });

  it('ticks blocks off, counts them, and remembers them', async () => {
    const user = userEvent.setup();
    await open();
    await user.click(screen.getByRole('checkbox', { name: 'Done: Set up' }));
    await user.click(screen.getByRole('checkbox', { name: 'Done: Streaming LLM responses in the UI' }));
    expect(screen.getByText(/of \d+ blocks done/).textContent).toMatch(/^2 of/);
    expect(screen.getByRole('region', { name: /Saturday, Oct 17/ })).toHaveTextContent('2 of 8 done');
    expect(JSON.parse(localStorage.getItem(`study-hub.plan.${plan.id}`)!)).toEqual(['sat-setup', 'sat-streaming']);
    // Breaks have no tick box.
    expect(screen.queryByRole('checkbox', { name: 'Done: Lunch' })).toBeNull();
  });

  it('opens library chapters in the hub, voice interviews in a new tab, and docs outside', async () => {
    await open();
    const block = document.querySelector<HTMLElement>('#block-sat-streaming')!;
    expect(within(block).getByRole('link', { name: 'Streaming chat UI' })).toHaveAttribute('href', '#/app/library/streaming-chat-ui');
    const voice = within(document.querySelector<HTMLElement>('#block-sat-voice')!).getByRole('link', { name: /Voice interview: Generative AI/ });
    expect(voice).toHaveAttribute('href', 'http://localhost:5189/#/interview/genai');
    expect(voice).toHaveAttribute('target', '_blank');
    const docs = within(document.querySelector<HTMLElement>('#block-sun-angular-1')!).getByRole('link', { name: /Signals/ });
    expect(docs).toHaveAttribute('href', 'https://angular.dev/guide/signals');
  });

  it('is in the sidebar, and the dashboard says what is next', async () => {
    window.location.hash = '#/';
    render(<App />);
    await act(async () => {});
    const dashTeaser = document.querySelector('.plan-teaser')!;
    expect(dashTeaser).toHaveAttribute('href', `#/plan/${plan.id}`);
    expect(dashTeaser).toHaveTextContent('Now: 12:15 PM · Streaming LLM responses in the UI');
    expect(dashTeaser).toHaveTextContent(/Sr Frontend interview \(React, Angular, GenAI\) in 2 d 0 h/);
    const nav = screen.getByRole('navigation', { name: 'Apps' });
    expect(within(nav).getByRole('link', { name: 'Prep plan' })).toHaveAttribute('href', '#/plan');
  });
});
