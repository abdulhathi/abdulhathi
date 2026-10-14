import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../App';
import { ALL_PROBLEMS, ALL_QUESTIONS, CHAPTERS } from '../chapters';
import { buildMock, FORMATS } from '../lib/mock';
import { render } from '@testing-library/react';

const go = async (hash: string) => {
  window.location.hash = hash;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
};

describe('the app', () => {
  it('opens on the welcome page with the hero', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: /walk into the interview/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /how to use this lab tonight/i })).toBeInTheDocument();
  });

  it('renders every chapter without an error box', async () => {
    render(<App />);
    for (const c of CHAPTERS) {
      await go(`#/${c.id}`);
      await waitFor(() => expect(document.title).toContain(c.title));
      expect(screen.queryByRole('alert')).toBeNull();
    }
  });

  it('reveals an answer and remembers a rating', async () => {
    const first = ALL_QUESTIONS.find((x) => x.chapter.group !== 'Start here');
    if (!first) return;
    render(<App />);
    await go(`#/${first.chapter.id}`);
    const card = (await screen.findAllByRole('button', { name: 'Show answer' }))[0].closest('section')!;
    await userEvent.click(within(card).getByRole('button', { name: 'Show answer' }));
    expect(within(card).getByRole('button', { name: 'Hide answer' })).toBeInTheDocument();
    await userEvent.click(within(card).getByRole('button', { name: 'Shaky' }));
    expect(within(card).getByRole('button', { name: 'Shaky' })).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('interview-lab.ratings')).toContain('shaky');
  });

  it('builds a mock interview and shows the drill', async () => {
    render(<App />);
    await go('#/mock');
    await userEvent.click(await screen.findByRole('button', { name: /build my mock interview/i }));
    expect(screen.getByRole('button', { name: /start the clock/i })).toBeInTheDocument();
    await go('#/drill');
    await waitFor(() => expect(document.title).toContain('Flash-card drill'));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('the mock interview plan', () => {
  it('fits the time budget and follows the coding share', () => {
    if (ALL_PROBLEMS.length === 0) return;
    for (const format of Object.keys(FORMATS) as (keyof typeof FORMATS)[]) {
      for (const length of [45, 60]) {
        const plan = buildMock(format, length, 12345, true);
        const coding = plan.items.filter((i) => i.kind === 'problem').reduce((s, i) => s + i.minutes, 0);
        const total = plan.items.reduce((s, i) => s + i.minutes, 0);
        expect(total).toBeLessThanOrEqual(length);
        expect(coding).toBeLessThanOrEqual(Math.round((length - 5) * FORMATS[format].coding));
        expect(new Set(plan.items.map((i) => i.key)).size).toBe(plan.items.length);
      }
    }
  });
});
