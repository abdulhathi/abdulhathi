import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { APPS } from '../apps';
import { searchPages } from '../components/Search';
import type { AppStatus, Page } from '../lib/api';
import { appHref, parseRoute } from '../lib/route';

const PAGES: Record<string, Page[]> = {
  library: [
    { id: 'mock', title: 'Mock interview', group: 'Practice', path: '/#/mock' },
    { id: 'sse', title: 'Server-Sent Events end to end', group: 'Real-time streaming', path: '/#/sse' },
    { id: 'websockets', title: 'WebSockets', group: 'Real-time streaming', path: '/#/websockets' },
  ],
  dsa: [{ id: 'welcome', title: 'How this lab works', group: 'Start here', path: '/#/welcome' }],
};

let status: AppStatus[];
let posts: { url: string; header: string | null }[];

beforeEach(() => {
  window.location.hash = '';
  status = APPS.map((a) => ({ id: a.id, up: a.id === 'library', managed: a.id === 'library' }));
  posts = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'POST') {
        posts.push({ url, header: new Headers(init.headers).get('X-Study-Hub') });
        return Response.json({ ok: true, message: 'Starting DSA Lab on port 5182.' });
      }
      if (url === '/api/status') return Response.json(status);
      if (url === '/api/pages') return Response.json(PAGES);
      if (url.endsWith('/logs')) return new Response('');
      return new Response('not found', { status: 404 });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const go = (hash: string) =>
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });

describe('Study Hub', () => {
  it('lists every app on the dashboard with its state', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: /every study app in one place/i })).toBeInTheDocument();
    for (const app of APPS) expect(screen.getByRole('heading', { level: 3, name: app.name })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/1/, { selector: '.big' })).toBeInTheDocument());
    const card = screen.getByRole('heading', { level: 3, name: 'Interview Library' }).closest('article')!;
    expect(within(card).getByText('Running')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Server-Sent Events end to end' })).toHaveAttribute('href', '#/app/library/sse');
  });

  it('finds a page with search and opens it in the viewer', async () => {
    render(<App />);
    const box = screen.getByRole('combobox', { name: /search pages/i });
    await waitFor(() => expect(screen.getAllByRole('link', { name: 'WebSockets' }).length).toBeGreaterThan(0));
    await userEvent.type(box, 'server sent');
    const option = await screen.findByRole('option', { name: /server-sent events end to end/i });
    await userEvent.click(option);
    await waitFor(() => expect(window.location.hash).toBe('#/app/library/sse'));
    const frame = await screen.findByTitle('Interview Library: Server-Sent Events end to end');
    expect(frame).toHaveAttribute('src', 'http://localhost:5189/#/sse');
    expect(screen.getByRole('link', { name: 'Server-Sent Events end to end', current: 'page' })).toBeInTheDocument();
  });

  it('offers Start for a stopped app and sends the request with the hub header', async () => {
    render(<App />);
    await go(appHref('dsa'));
    expect(await screen.findByRole('heading', { name: 'DSA Lab is not running' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(posts).toEqual([{ url: '/api/apps/dsa/start', header: '1' }]));
    expect(await screen.findByText('Starting DSA Lab on port 5182.')).toBeInTheDocument();
  });

  it('says so when a link names an app that does not exist', async () => {
    render(<App />);
    await go('#/app/nope');
    expect(screen.getByText(/no app called/i)).toBeInTheDocument();
  });
});

describe('helpers', () => {
  it('parses hash routes', () => {
    expect(parseRoute('')).toEqual({ view: 'home' });
    expect(parseRoute('#/app/dsa')).toEqual({ view: 'app', id: 'dsa', page: undefined });
    expect(parseRoute(appHref('library', 'sse'))).toEqual({ view: 'app', id: 'library', page: 'sse' });
  });

  it('matches every search term against app, group and title', () => {
    expect(searchPages(PAGES, 'streaming web').map((h) => h.page.id)).toEqual(['websockets']);
    expect(searchPages(PAGES, 'interview library').length).toBe(3);
    expect(searchPages(PAGES, '   ')).toEqual([]);
  });
});

describe('notices', () => {
  it('fade after six seconds even while the status keeps refreshing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // jsdom reports a hidden page, which pauses polling; the bug only shows while polls re-render the app.
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    try {
      render(<App />);
      await go(appHref('dsa'));
      await userEvent.click(await screen.findByRole('button', { name: 'Start' }));
      expect(await screen.findByText('Starting DSA Lab on port 5182.')).toBeInTheDocument();
      // Step a second at a time so React re-renders after each status poll, as it does in a browser.
      for (let s = 0; s < 8; s++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1000);
        });
      }
      expect(screen.queryByText('Starting DSA Lab on port 5182.')).toBeNull();
    } finally {
      visibility.mockRestore();
      vi.useRealTimers();
    }
  });
});

describe('hiding the apps list', () => {
  beforeEach(() => localStorage.removeItem('study-hub.sidebar'));

  it('hides and shows the apps column with the top-bar button, and remembers the choice', async () => {
    const { unmount } = render(<App />);
    expect(screen.getByRole('navigation', { name: 'Apps' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: /hide apps/i }));
    expect(screen.queryByRole('navigation', { name: 'Apps' })).toBeNull();
    const show = screen.getByRole('button', { name: /show apps/i });
    expect(show).toHaveAttribute('aria-expanded', 'false');
    expect(localStorage.getItem('study-hub.sidebar')).toBe('hidden');

    unmount();
    render(<App />); // a new visit starts hidden
    expect(screen.queryByRole('navigation', { name: 'Apps' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /show apps/i }));
    expect(screen.getByRole('navigation', { name: 'Apps' })).toBeVisible();
    expect(screen.getByRole('button', { name: /hide apps/i })).toHaveAttribute('aria-expanded', 'true');
  });

  it('toggles with the [ key, but not while typing in search', async () => {
    render(<App />);
    await userEvent.keyboard('[['); // '[[' types a literal [
    expect(screen.queryByRole('navigation', { name: 'Apps' })).toBeNull();
    await userEvent.click(screen.getByRole('combobox', { name: /search pages/i }));
    await userEvent.keyboard('[['); // '[[' types a literal [
    expect(screen.queryByRole('navigation', { name: 'Apps' })).toBeNull();
    await userEvent.click(document.body);
    await userEvent.keyboard('[['); // '[[' types a literal [
    expect(screen.getByRole('navigation', { name: 'Apps' })).toBeVisible();
  });
});
