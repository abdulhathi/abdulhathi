import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../App';

const page = () => document.querySelector('.page')!;
const go = async (hash: string) =>
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });

describe('layout choices', () => {
  it('uses the full screen width by default, and switches to a reading column and back', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(page()).toHaveClass('full');
    await user.click(screen.getByRole('button', { name: 'Width: Full' }));
    expect(page()).not.toHaveClass('full');
    expect(localStorage.getItem('interview-library.width')).toBe('"reading"');
    await user.click(screen.getByRole('button', { name: 'Width: Reading' }));
    expect(page()).toHaveClass('full');
  });

  it('hides and shows the menu with the button, and remembers it', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    const hide = screen.getByRole('button', { name: 'Hide menu' });
    expect(hide).toHaveAttribute('aria-expanded', 'true');
    await user.click(hide);
    expect(page()).toHaveClass('menu-hidden');
    expect(screen.getByRole('button', { name: 'Show menu' })).toHaveAttribute('aria-expanded', 'false');
    expect(localStorage.getItem('interview-library.menu-hidden')).toBe('true');
    unmount();
    render(<App />);
    expect(page()).toHaveClass('menu-hidden');
  });

  it('toggles the menu with "[" but not while typing', async () => {
    const user = userEvent.setup();
    render(<App />);
    // "[[" is how user-event types a literal "[".
    await user.keyboard('[[');
    expect(page()).toHaveClass('menu-hidden');
    await user.keyboard('[[');
    expect(page()).not.toHaveClass('menu-hidden');
    screen.getByRole('combobox', { name: /preparing for/i }).focus();
    await user.keyboard('[[');
    expect(page()).not.toHaveClass('menu-hidden');
  });

  it('keeps both choices on the code editor page', async () => {
    localStorage.setItem('interview-library.menu-hidden', 'true');
    render(<App />);
    await go('#/code/code-hashing/p-two-sum');
    expect(page()).toHaveClass('code-view', 'menu-hidden', 'full');
  });
});
