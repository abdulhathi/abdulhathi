import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../App';
import { TRACKED } from '../chapters';

describe('App', () => {
  it('opens on chapter 01 and moves through chapters with the pager', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Learn RabbitMQ by building ShopFlow' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'What you will build' })).toBeInTheDocument();

    const pager = screen.getByRole('navigation', { name: 'Previous and next chapter' });
    await user.click(within(pager).getByRole('link', { name: /The vocabulary/ }));

    expect(await screen.findByRole('heading', { level: 1, name: 'The vocabulary' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/vocabulary');
    expect(screen.getByRole('link', { name: /The vocabulary/, current: 'page' })).toBeInTheDocument();
  });

  it('opens the chapter named in the URL', () => {
    window.location.hash = '#/dead-letters';
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Dead letters and retries' })).toBeInTheDocument();
  });

  it('falls back to chapter 01 for an unknown URL', () => {
    window.location.hash = '#/no-such-chapter';
    render(<App />);
    expect(screen.getByRole('heading', { level: 2, name: 'What you will build' })).toBeInTheDocument();
  });

  it('marks a chapter done, updates progress and remembers it', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByText(`0 of ${TRACKED.length} chapters done`)).toBeInTheDocument();

    await user.click(screen.getByLabelText('I finished this chapter'));

    expect(screen.getByText(`1 of ${TRACKED.length} chapters done`)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    expect(JSON.parse(localStorage.getItem('shopflow-lab.done')!)).toEqual(['build']);
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
