import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../App';
import { CHAPTERS, TRACKED } from '../chapters';

describe('App', () => {
  it('opens on chapter 01 and moves through chapters with the pager', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Every way to sign users in, built three times' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'How this lab works' })).toBeInTheDocument();
    const pager = screen.getByRole('navigation', { name: 'Previous and next chapter' });
    await user.click(within(pager).getByRole('link', { name: new RegExp(CHAPTERS[1].title) }));
    expect(await screen.findByRole('heading', { level: 1, name: CHAPTERS[1].title })).toBeInTheDocument();
    expect(window.location.hash).toBe(`#/${CHAPTERS[1].id}`);
    expect(document.title).toBe(`${CHAPTERS[1].title} · Auth Lab`);
  });

  it('opens the chapter named in the URL and shows its practice folder', () => {
    window.location.hash = '#/jwt';
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'JSON Web Tokens' })).toBeInTheDocument();
    expect(screen.getAllByText('projects/08-jwt').length).toBeGreaterThan(0);
  });

  it('falls back to chapter 01 for an unknown URL', () => {
    window.location.hash = '#/no-such-chapter';
    render(<App />);
    expect(screen.getByRole('heading', { level: 2, name: 'How this lab works' })).toBeInTheDocument();
  });

  it('marks a chapter done, updates progress and remembers it', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByText(`0 of ${TRACKED.length} chapters done`)).toBeInTheDocument();
    await user.click(screen.getByLabelText('I finished this chapter'));
    expect(screen.getByText(`1 of ${TRACKED.length} chapters done`)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  });

  it('hides the menu and switches the width, and remembers both', async () => {
    const user = userEvent.setup();
    render(<App />);
    const page = document.querySelector('.page')!;
    expect(page).toHaveClass('full');
    await user.click(screen.getByRole('button', { name: 'Hide menu' }));
    expect(page).toHaveClass('menu-hidden');
    await user.click(screen.getByRole('button', { name: 'Width: Full' }));
    expect(page).not.toHaveClass('full');
    expect(localStorage.getItem('auth-lab.menu-hidden')).toBe('true');
    expect(localStorage.getItem('auth-lab.width')).toBe('"reading"');
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
