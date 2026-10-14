import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { TRACKED } from '../chapters';

afterEach(() => vi.useRealTimers());

describe('App', () => {
  it('opens on the welcome page and moves on with the pager', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: /Learn data structures and algorithms/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'How this lab works' })).toBeInTheDocument();

    const pager = await screen.findByRole('navigation', { name: 'Previous and next chapter' });
    await user.click(within(pager).getByRole('link', { name: /How to solve any problem/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'How to solve any problem' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/method');
  });

  it('opens the chapter named in the URL, with its problems', async () => {
    window.location.hash = '#/two-pointers';
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Two pointers' })).toBeInTheDocument();
    expect(await screen.findByRole('article', { name: /Problem 11: Container With Most Water/ })).toBeInTheDocument();
  });

  it('falls back to the welcome page for an unknown URL', () => {
    window.location.hash = '#/no-such-chapter';
    render(<App />);
    expect(screen.getByRole('heading', { level: 2, name: 'How this lab works' })).toBeInTheDocument();
  });

  it('marks a chapter done and remembers it', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByText(`0 of ${TRACKED.length} chapters done`)).toBeInTheDocument();
    await user.click(await screen.findByLabelText('I finished this chapter'));
    expect(screen.getByText(`1 of ${TRACKED.length} chapters done`)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('dsa-lab.done')!)).toEqual(['welcome']);
  });

  it('reveals a problem\'s help one layer at a time', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/two-pointers';
    render(<App />);
    const card = await screen.findByRole('article', { name: /Problem 167:/ });
    expect(card.querySelector('.phints')).toBeNull();
    for (const label of ['Hint 1 of 3', 'Hint 2 of 3', 'Hint 3 of 3']) await user.click(within(card).getByRole('button', { name: label }));
    expect(card.querySelectorAll('.phints li')).toHaveLength(3);
    expect(card.querySelector('.pinsight')).toBeNull();
    await user.click(within(card).getByRole('button', { name: 'Key idea' }));
    expect(within(card).getByText('Key idea')).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Full approach' }));
    expect(within(card).getByText('Approach')).toBeInTheDocument();
    expect(within(card).getByText('O(n)')).toBeInTheDocument();
  });

  it('schedules a solved problem for review and shows it when due', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 12, 9, 0));
    const user = userEvent.setup();
    window.location.hash = '#/two-pointers';
    const { unmount } = render(<App />);
    await user.selectOptions(await screen.findByLabelText('Status of problem 11'), 'solved');
    expect(JSON.parse(localStorage.getItem('dsa-lab.problems')!)).toEqual({ 11: { status: 'solved', step: 0, due: '2026-10-15' } });
    unmount();

    vi.setSystemTime(new Date(2026, 9, 15, 9, 0));
    window.location.hash = '#/review';
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Review queue' })).toBeInTheDocument();
    expect(screen.getByText('Container With Most Water')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'I solved it again' }));
    expect(screen.getByText(/Nothing is due today/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('dsa-lab.problems')!)[11]).toEqual({ status: 'solved', step: 1, due: '2026-10-22' });
  });

  it('finds any LeetCode problem in the tracker and names the chapters that teach it', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/tracker';
    render(<App />);
    const search = screen.getByLabelText('Find a problem');
    await user.type(search, '42');
    const finder = screen.getByRole('status', { name: 'Problem finder' });
    expect(within(finder).getByText(/It is in the lab/)).toBeInTheDocument();
    expect(within(finder).getByText('Two Pointers')).toBeInTheDocument();
    await user.clear(search);
    await user.type(search, '4078');
    expect(within(screen.getByRole('status', { name: 'Problem finder' })).getByText(/not one of the lab's problems/)).toBeInTheDocument();
  }, 15000);

  it('cycles the theme between automatic, light and dark', async () => {
    const user = userEvent.setup();
    render(<App />);
    const button = screen.getByRole('button', { name: 'Theme: Auto' });
    await user.click(button);
    expect(document.documentElement.dataset.theme).toBe('light');
    await user.click(button);
    expect(document.documentElement.dataset.theme).toBe('dark');
    await user.click(button);
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('runs the recognition drill', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/drill';
    render(<App />);
    const options = within(screen.getByRole('group', { name: 'Choose a technique' })).getAllByRole('button');
    expect(options).toHaveLength(4);
    await user.click(options[0]);
    expect(screen.getByText(/Key idea:/)).toBeInTheDocument();
    expect(screen.getByText(/Score:/).textContent).toMatch(/\/ 1$/);
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /Next problem/ }));
    });
    expect(screen.queryByText(/Key idea:/)).toBeNull();
  });
});
