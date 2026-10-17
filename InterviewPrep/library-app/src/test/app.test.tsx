import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { ALIASES, ALL_PROBLEMS, ALL_QUESTIONS, CHAPTERS, findChapter, STACKS } from '../chapters';
import { buildMock, INTRO_MINUTES } from '../lib/mock';
import { resolve } from '../lib/resolve';
import { scopesFor } from '../lib/scope';
import { findTrack, TRACKS } from '../tracks';

const go = async (hash: string) =>
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });

beforeEach(() => {
  localStorage.clear();
  window.location.hash = '';
});

describe('the library app', () => {
  it('opens on the library home with every track and stack', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: /one library, every interview/i })).toBeInTheDocument();
    for (const t of TRACKS) expect(screen.getByRole('heading', { level: 3, name: t.company })).toBeInTheDocument();
    // Some stacks share a name with a learning path ("Python"), so look inside the stacks section.
    const stacks = screen.getByRole('region', { name: 'Browse by tech stack' });
    for (const s of STACKS) expect(within(stacks).getByRole('heading', { level: 3, name: s.title })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Learning paths' })).toBeInTheDocument();
  });

  it('renders every chapter without an error box', async () => {
    render(<App />);
    for (const c of CHAPTERS) {
      await go(`#/${c.id}`);
      await waitFor(() => expect(document.title).toContain(c.title));
      expect(screen.queryByRole('alert')).toBeNull();
    }
  });

  it('opening a track makes it active, shows its plan, and filters the sidebar to it', async () => {
    render(<App />);
    await go('#/track/capgemini');
    expect(await screen.findByRole('heading', { level: 1, name: 'Capgemini track' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /must study/i })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Library' });
    expect(within(nav).getByRole('combobox', { name: /preparing for/i })).toHaveValue('capgemini');
    expect(within(nav).getByRole('link', { name: /capgemini track/i })).toBeInTheDocument();
    expect(localStorage.getItem('interview-library.track')).toBe('"capgemini"');
  });

  it('notes where a chapter sits in the active track, and when it is outside it', async () => {
    render(<App />);
    await go('#/track/capgemini');
    await go('#/sse');
    // The sidebar also has a "Must study" group, so look inside the chapter header.
    const header = (await screen.findByRole('heading', { level: 1, name: findChapter('sse')!.title })).closest('header')!;
    expect(within(header).getByText('Must study')).toBeInTheDocument();
    await go('#/hipaa');
    expect(await screen.findByText(/not in your/i)).toBeInTheDocument();
  });

  it('redirects old chapter ids and resolves the generic track links against the active track', async () => {
    render(<App />);
    await go('#/track/citiustech');
    await go('#/stories');
    await waitFor(() => expect(document.title).toContain(findChapter('citiustech-stories')!.title));
    await go('#/fastapi-async');
    await waitFor(() => expect(document.title).toContain(findChapter('fastapi')!.title));
    expect(window.location.hash).toBe('#/fastapi');
  });

  it('reveals an answer and remembers a rating', async () => {
    const first = ALL_QUESTIONS.find((x) => x.chapter.kind === 'topic')!;
    render(<App />);
    await go(`#/${first.chapter.id}`);
    const card = (await screen.findAllByRole('button', { name: 'Show answer' }))[0].closest('section')!;
    await userEvent.click(within(card).getByRole('button', { name: 'Show answer' }));
    await userEvent.click(within(card).getByRole('button', { name: 'Shaky' }));
    expect(within(card).getByRole('button', { name: 'Shaky' })).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('interview-library.ratings')).toContain('shaky');
  });

  it('asks for a track before a mock interview, then builds one for it', async () => {
    render(<App />);
    await go('#/mock');
    expect(await screen.findByText(/choose a track first/i)).toBeInTheDocument();
    await go('#/track/capgemini');
    await go('#/mock');
    await userEvent.click(await screen.findByRole('button', { name: /build my mock interview/i }));
    expect(screen.getByRole('button', { name: /start the clock/i })).toBeInTheDocument();
    expect(screen.getByText(/^Capgemini · /)).toBeInTheDocument();
  });

  it('scopes the drill to the active track by default', async () => {
    render(<App />);
    await go('#/track/citiustech');
    await go('#/drill');
    expect(await screen.findByRole('combobox', { name: 'Cover' })).toHaveValue('track:citiustech');
  });
});

describe('routing', () => {
  it('sends every alias to a chapter that exists', () => {
    for (const [from, to] of Object.entries(ALIASES)) {
      expect(findChapter(to), `${from} → ${to}`).toBeDefined();
      expect(resolve(from, '', undefined)).toMatchObject({ kind: 'chapter', chapter: { id: to } });
    }
  });
  it('opens home for a generic track link when no track is active', () => {
    expect(resolve('stories', '', undefined)).toEqual({ kind: 'home' });
    expect(resolve('stories', '', findTrack('capgemini'))).toMatchObject({ kind: 'chapter', chapter: { id: 'capgemini-stories' } });
  });
});

describe('scopes', () => {
  it('a track scope covers its own chapters and its plan, nothing else', () => {
    const track = findTrack('capgemini')!;
    const scope = scopesFor(track)[0];
    expect(scope.includes(findChapter('capgemini-stories')!)).toBe(true);
    expect(scope.includes(findChapter('sse')!)).toBe(true);
    expect(scope.includes(findChapter('hipaa')!)).toBe(false);
    expect(scope.includes(findChapter('citiustech-stories')!)).toBe(false);
  });
});

describe.each(TRACKS.map((t) => [t.id, t] as const))('mock interview: %s', (_, track) => {
  it('fits the time budget, follows the coding share and uses only the track', () => {
    if (ALL_PROBLEMS.length === 0) return;
    const allowed = new Set([...track.start, ...track.plan.map(([id]) => id), ...track.mock.coding]);
    for (const [format, info] of Object.entries(track.mock.formats)) {
      for (const length of [45, 60]) {
        const plan = buildMock(track, format, length, 12345, true);
        const coding = plan.items.filter((i) => i.kind === 'problem').reduce((s, i) => s + i.minutes, 0);
        expect(plan.items.reduce((s, i) => s + i.minutes, 0)).toBeLessThanOrEqual(length);
        expect(coding).toBeLessThanOrEqual(Math.round((length - INTRO_MINUTES) * info.coding));
        expect(new Set(plan.items.map((i) => i.key)).size).toBe(plan.items.length);
        expect(plan.items.filter((i) => !allowed.has(i.key.split('/')[0])).map((i) => i.key)).toEqual([]);
        expect(plan.items.find((i) => i.kind === 'question')?.key.startsWith(`${track.start[2]}/`)).toBe(true);
      }
    }
  });

  it('opens the coding part with the track\'s first chapter when there is room', () => {
    if (!track.mock.first || ALL_PROBLEMS.length === 0) return;
    const plan = buildMock(track, Object.keys(track.mock.formats)[0], 60, 12345, true);
    expect(plan.items.find((i) => i.kind === 'problem')?.key.startsWith(`${track.mock.first}/`)).toBe(true);
  });
});

describe('learning paths and the voice interviewer', () => {
  it('shows a learning path in six steps', async () => {
    render(<App />);
    await go('#/path/redis');
    expect(await screen.findByRole('heading', { level: 1, name: 'Redis learning path' })).toBeInTheDocument();
    for (let n = 1; n <= 6; n++) expect(screen.getByRole('heading', { level: 2, name: new RegExp(`Step ${n}:`) })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /start the voice interview/i })).toHaveAttribute('href', '#/interview/redis');
  });

  it('does not move on until an answer passes, then offers the next question', async () => {
    const scores = [55, 88];
    const posted: unknown[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/api/evaluate/status')) return Response.json({ ready: true, models: [] });
      posted.push(JSON.parse(String(init?.body)));
      const score = scores.shift()!;
      return Response.json({
        score, verdict: score >= 80 ? 'pass' : 'fail', summary: 'Feedback.', strengths: ['Clear start'], missing: score >= 80 ? [] : ['Mention TTLs'],
        incorrect: [], grammar: [{ original: 'it expire', corrected: 'it expires', note: 'Third person -s' }], speech_to_text: [],
        better_answer: 'A better answer.', follow_up: 'What about stampedes?', model: 'claude-opus-5-5',
      });
    }) as typeof fetch;
    try {
      localStorage.setItem('interview-library.voice-settings', JSON.stringify({ readAloud: false }));
      render(<App />);
      await go('#/interview/c-redis');
      const box = await screen.findByRole('textbox', { name: /your answer/i });
      await userEvent.type(box, 'Redis keeps data in memory.');
      await userEvent.click(screen.getByRole('button', { name: 'Submit answer' }));
      expect(await screen.findByText('55%')).toBeInTheDocument();
      expect(screen.getByText('it expires')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /next question/i })).toBeNull();
      await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
      await userEvent.type(screen.getByRole('textbox', { name: /your answer/i }), 'Redis is an in-memory store with TTLs.');
      await userEvent.click(screen.getByRole('button', { name: 'Submit answer' }));
      expect(await screen.findByText('88%')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /next question/i })).toBeInTheDocument();
      expect(posted).toHaveLength(2);
      expect(posted[1]).toMatchObject({ chapterId: 'redis', attempt: 2, passMark: 80, model: 'claude-opus-5-5' });
      expect(localStorage.getItem('interview-library.voice')).toContain('"passed":true');
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('builds profile entries from what you recorded', async () => {
    localStorage.setItem('interview-library.paths', JSON.stringify({ redis: { courses: {}, assessments: {}, project: { repoUrl: 'https://github.com/abdulhathi/redis-demo', checks: {} }, profile: {} } }));
    render(<App />);
    await go('#/path/redis');
    expect(await screen.findByRole('textbox', { name: 'LinkedIn · Skills' })).toHaveValue('Redis\nCaching');
    expect((screen.getByRole('textbox', { name: 'GitHub profile README line' }) as HTMLTextAreaElement).value).toContain('https://github.com/abdulhathi/redis-demo');
  });

  it('lists the existing HackerRank certificate on the profile kit', async () => {
    render(<App />);
    await go('#/profile-kit');
    expect(await screen.findByText('Frontend Developer (React)')).toBeInTheDocument();
  });
});
