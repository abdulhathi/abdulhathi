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
    const card = (await screen.findAllByRole('heading', { level: 3, name: new RegExp(`^Q1 `) }))[0].closest('section')!;
    // Each question is a collapsible panel, closed until you open it.
    expect(within(card).queryByRole('button', { name: 'Show answer' })).toBeNull();
    await userEvent.click(within(card).getByRole('button', { expanded: false }));
    await userEvent.click(within(card).getByRole('button', { name: 'Show answer' }));
    await userEvent.click(within(card).getByRole('button', { name: 'Shaky' }));
    expect(within(card).getByRole('button', { name: 'Shaky' })).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('interview-library.ratings')).toContain('shaky');
    // Closing the panel hides it again but keeps the rating.
    await userEvent.click(within(card).getByRole('button', { expanded: true, name: /^Q1 / }));
    expect(within(card).queryByRole('button', { name: 'Shaky' })).toBeNull();
  });

  it('expands and collapses every question at once, and opens the one a link points to', async () => {
    render(<App />);
    await go('#/redis');
    const toggles = () => screen.getAllByRole('heading', { level: 3, name: /^Q\d+ / }).map((h) => within(h).getByRole('button'));
    await screen.findAllByRole('heading', { level: 3, name: /^Q1 / });
    expect(toggles().every((b) => b.getAttribute('aria-expanded') === 'false')).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Expand all' }));
    expect(toggles().every((b) => b.getAttribute('aria-expanded') === 'true')).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
    expect(toggles().every((b) => b.getAttribute('aria-expanded') === 'false')).toBe(true);
    await go('#/redis/q-what-is-a-cache-stampede-and-how-do-you-prevent-it');
    const card = document.getElementById('q-what-is-a-cache-stampede-and-how-do-you-prevent-it')!;
    await waitFor(() => expect(within(card).getByRole('button', { name: /cache stampede/i })).toHaveAttribute('aria-expanded', 'true'));
    expect(within(card).getByRole('button', { name: /answer out loud/i })).toBeInTheDocument();
  });

  it('links each question to the section that teaches it, in the chapter and from the interviewer', async () => {
    render(<App />);
    await go('#/redis');
    const card = (await screen.findAllByRole('heading', { level: 3, name: /cache stampede/i }))[0].closest('section')!;
    const link = within(card).getByRole('link', { name: /Topic: Caching patterns/ });
    expect(link).toHaveAttribute('href', '#/redis/s-caching-patterns');
    expect(link).not.toHaveAttribute('target');
    // No section covers this one, so inside its own chapter there is no topic link.
    const generic = screen.getByRole('heading', { level: 3, name: /haven't used Redis in production/ }).closest('section')!;
    expect(within(generic).queryByRole('link', { name: /Topic:/ })).toBeNull();

    localStorage.setItem('interview-library.voice-settings', JSON.stringify({ readAloud: false }));
    await go('#/interview/c-redis');
    const away = await screen.findByRole('link', { name: /Topic: Redis and Memorystore/ });
    // The first question has no section, so it falls back to the chapter, in a new tab.
    expect(away).toHaveAttribute('href', '#/redis');
    expect(away).toHaveAttribute('target', '_blank');
    await userEvent.click(screen.getByRole('button', { name: 'Skip →' }));
    expect(screen.getByRole('link', { name: /Topic: Redis and Memorystore › Data structures and what they are for/ })).toHaveAttribute('href', '#/redis/s-data-structures-and-what-they-are-for');
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
      expect(await screen.findByText('55%', { selector: '.iv-pct' })).toBeInTheDocument();
      expect(screen.getByText('it expires')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /next question/i })).toBeNull();
      await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
      await userEvent.type(screen.getByRole('textbox', { name: /your answer/i }), 'Redis is an in-memory store with TTLs.');
      await userEvent.click(screen.getByRole('button', { name: 'Submit answer' }));
      expect(await screen.findByText('88%', { selector: '.iv-pct' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /next question/i })).toBeInTheDocument();
      expect(posted).toHaveLength(2);
      expect(posted[1]).toMatchObject({ chapterId: 'redis', attempt: 2, passMark: 80, model: 'claude-opus-5-5', answer: 'Redis is an in-memory store with TTLs.' });
      expect(localStorage.getItem('interview-library.voice')).toContain('"passed":true');
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  const grader = (scores: number[], posted: Record<string, unknown>[] = []) =>
    (async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/api/evaluate/status')) return Response.json({ ready: true, models: [] });
      posted.push(JSON.parse(String(init?.body)));
      const score = scores.shift()!;
      return Response.json({
        score, verdict: score >= 80 ? 'pass' : score >= 65 ? 'close' : 'fail', summary: 'Feedback.', strengths: [], missing: [], incorrect: [],
        grammar: [], speech_to_text: [], better_answer: 'A better answer.', follow_up: '', model: 'claude-opus-5-5',
      });
    }) as typeof fetch;

  it('lets you skip a question you have not passed, go back, and jump to any question from the list with its score', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = grader([55]);
    try {
      localStorage.setItem('interview-library.voice-settings', JSON.stringify({ readAloud: false }));
      render(<App />);
      await go('#/interview/c-redis');
      const first = (await screen.findByRole('heading', { level: 2 })).textContent;
      expect(screen.getByText(/Question 1 of \d+/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '← Previous' })).toBeDisabled();
      await userEvent.type(screen.getByRole('textbox', { name: /your answer/i }), 'Redis keeps data in memory.');
      await userEvent.click(screen.getByRole('button', { name: 'Submit answer' }));
      expect(await screen.findByText('55%', { selector: '.iv-pct' })).toBeInTheDocument();
      // Not passed, but you can still move on.
      await userEvent.click(screen.getByRole('button', { name: 'Skip →' }));
      expect(screen.getByText(/Question 2 of \d+/)).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2 }).textContent).not.toBe(first);
      await userEvent.click(screen.getByRole('button', { name: '← Previous' }));
      expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(first);
      // The list shows every question; the one you answered carries its score, and picking another opens it.
      const list = document.querySelector<HTMLElement>('.iv-list')!;
      expect(list).toHaveAttribute('open');
      expect(list).toHaveTextContent(/1 of \d+ answered · average best score 55%/);
      const picks = within(list).getAllByRole('button');
      expect(picks[0]).toHaveTextContent('55%');
      expect(picks[0]).toHaveTextContent('not yet');
      await userEvent.click(picks[3]);
      expect(screen.getByText(/Question 4 of \d+/)).toBeInTheDocument();
      expect(picks[3]).toHaveAttribute('aria-current', 'true');
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('puts a microphone on every question card, shows your score, and saves your answer with its corrections', async () => {
    const posted: Record<string, unknown>[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = grader([70, 90], posted);
    const openCard = async () => {
      const card = (await screen.findAllByRole('heading', { level: 3, name: /cache stampede/i }))[0].closest('section')!;
      await userEvent.click(within(card).getByRole('button', { name: /cache stampede/i }));
      return card;
    };
    try {
      const view = render(<App />);
      await go('#/redis');
      let card = await openCard();
      let scope = within(card);
      await userEvent.click(scope.getByRole('button', { name: /answer out loud/i }));
      await userEvent.type(scope.getByRole('textbox', { name: 'Your spoken answer' }), 'Lock the key while one request rebuilds it.');
      await userEvent.click(scope.getByRole('button', { name: 'Score my answer' }));
      // The scored answer is saved and shown: what you said, the score and the corrections.
      expect(await scope.findByText('70%', { selector: '.iv-pct' })).toBeInTheDocument();
      expect(scope.getByText('Close: not yet')).toBeInTheDocument();
      expect(scope.getByRole('group', { name: 'Your saved answer' })).toHaveTextContent('Lock the key while one request rebuilds it.');
      expect(scope.getByText('Your answer, improved')).toBeInTheDocument();
      expect(card.querySelector('.qcard-head .score-badge')).toHaveTextContent('70%');
      expect(posted[0]).toMatchObject({ chapterId: 'redis', attempt: 1, passMark: 80, answer: 'Lock the key while one request rebuilds it.' });
      const key = `redis/${String(posted[0].questionId)}`;

      // It survives a reload.
      view.unmount();
      render(<App />);
      await go('#/redis');
      card = await openCard();
      scope = within(card);
      expect(scope.getByRole('group', { name: 'Your saved answer' })).toHaveTextContent('Lock the key while one request rebuilds it.');

      // Answering again replaces it.
      await userEvent.click(scope.getByRole('button', { name: /answer again/i }));
      expect(scope.getByText(/Scoring this answer replaces your saved one \(70%/)).toBeInTheDocument();
      await userEvent.type(scope.getByRole('textbox', { name: 'Your spoken answer' }), 'Use a lock, early expiry and jitter.');
      await userEvent.click(scope.getByRole('button', { name: 'Score my answer' }));
      expect(await scope.findByText('Pass')).toBeInTheDocument();
      expect(card.querySelector('.qcard-head .score-badge')).toHaveTextContent('✓ 90%');
      expect(scope.getByRole('group', { name: 'Your saved answer' })).toHaveTextContent('Use a lock, early expiry and jitter.');
      expect(scope.queryByText('Lock the key while one request rebuilds it.')).toBeNull();
      expect(posted[1]).toMatchObject({ attempt: 2 });
      expect(JSON.parse(localStorage.getItem('interview-library.voice')!)).toMatchObject({ [key]: { best: 90, attempts: 2, passed: true } });
      const saved = JSON.parse(localStorage.getItem('interview-library.voice-answers')!);
      expect(Object.keys(saved)).toEqual([key]);
      expect(saved[key]).toMatchObject({ answer: 'Use a lock, early expiry and jitter.', feedback: { score: 90, better_answer: 'A better answer.' } });
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('saves interviewer answers too, and shows the last one folded away when you try again', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = grader([55]);
    try {
      localStorage.setItem('interview-library.voice-settings', JSON.stringify({ readAloud: false }));
      render(<App />);
      await go('#/interview/c-redis');
      await userEvent.type(await screen.findByRole('textbox', { name: /your answer/i }), 'Redis keeps data in memory.');
      await userEvent.click(screen.getByRole('button', { name: 'Submit answer' }));
      await screen.findByText('55%', { selector: '.iv-pct' });
      expect(JSON.stringify(JSON.parse(localStorage.getItem('interview-library.voice-answers')!))).toContain('Redis keeps data in memory.');
      await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
      const last = screen.getByText(/Your last answer · 55%/).closest('details')!;
      expect(last).not.toHaveAttribute('open');
      expect(last).toHaveTextContent('Redis keeps data in memory.');
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
