import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../App';
import { TRACKED } from '../chapters';

describe('App', () => {
  it('opens on chapter 01 and moves through chapters with the pager', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Learn Node.js, from first script to production' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'How this course works' })).toBeInTheDocument();

    const pager = screen.getByRole('navigation', { name: 'Previous and next chapter' });
    await user.click(within(pager).getByRole('link', { name: /What Node.js is/ }));

    expect(await screen.findByRole('heading', { level: 1, name: 'What Node.js is' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/what-is-node');
    expect(screen.getByRole('link', { name: /What Node.js is/, current: 'page' })).toBeInTheDocument();
  });

  it('opens the chapter named in the URL and shows its project folder', () => {
    window.location.hash = '#/streams';
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Buffers and streams' })).toBeInTheDocument();
    expect(screen.getAllByText('projects/07-log-analyzer').length).toBeGreaterThan(0);
  });

  it('falls back to chapter 01 for an unknown URL', () => {
    window.location.hash = '#/no-such-chapter';
    render(<App />);
    expect(screen.getByRole('heading', { level: 2, name: 'How this course works' })).toBeInTheDocument();
  });

  it('marks a chapter done, updates progress and remembers it', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByText(`0 of ${TRACKED.length} chapters done`)).toBeInTheDocument();

    await user.click(screen.getByLabelText('I finished this chapter'));

    expect(screen.getByText(`1 of ${TRACKED.length} chapters done`)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    expect(JSON.parse(localStorage.getItem('node-lab.done')!)).toEqual(['welcome']);
  });

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
});
