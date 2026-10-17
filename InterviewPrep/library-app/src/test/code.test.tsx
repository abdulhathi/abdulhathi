import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { CHAPTERS } from '../chapters';
import { problemsOf } from '../lib/md';
import { resolve } from '../lib/resolve';
import { splitRoute } from '../lib/route';

const go = async (hash: string) =>
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });

const exerciseFiles = import.meta.glob<Record<string, { language: string; mode: string; starter: string }>>('../../exercises/*.json', { eager: true, import: 'default' });
const exercisesOf = (chapterId: string) => exerciseFiles[`../../exercises/${chapterId}.json`] ?? {};

/** Answers /api/run and /api/evaluate/review like the dev server; records what was sent. */
function fakeServer(results: unknown[]) {
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  const queue = [...results];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    sent.push({ url, body: JSON.parse(String(init?.body ?? '{}')) });
    const next = queue.shift() ?? { ok: true, stdout: '', stderr: '', ms: 1 };
    const status = (next as { status?: number }).status ?? 200;
    return new Response(JSON.stringify(next), { status, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { sent, fetchMock };
}

afterEach(() => vi.unstubAllGlobals());

describe('the exercises', () => {
  it('belong to real problems, in every chapter that has coding problems', () => {
    for (const c of CHAPTERS) {
      const ids = new Set(problemsOf(c.doc).map((p) => p.id));
      const ex = exercisesOf(c.id);
      for (const id of Object.keys(ex)) expect(ids, `${c.id}: ${id}`).toContain(id);
      for (const id of ids) expect(ex[id], `${c.id}: ${id} has no exercise`).toBeDefined();
    }
  });

  it('each have a language, a mode and starter code', () => {
    for (const [file, ex] of Object.entries(exerciseFiles))
      for (const [id, e] of Object.entries(ex)) {
        expect(['python', 'ts', 'tsx', 'sql', 'sql-postgres'], `${file} ${id}`).toContain(e.language);
        expect(['asserts', 'script', 'typecheck', 'rows'], `${file} ${id}`).toContain(e.mode);
        expect(typeof e.starter, `${file} ${id}`).toBe('string');
      }
  });
});

describe('the code editor page', () => {
  it('resolves #/code/<chapter>/<problem>', () => {
    const { id, anchor } = splitRoute('code/code-hashing/p-two-sum');
    expect(resolve(id, anchor, undefined)).toEqual({ kind: 'code', chapterId: 'code-hashing', problemId: 'p-two-sum' });
    expect(resolve('code', 'code-hashing', undefined).kind).toBe('missing');
  });

  it('is linked from each problem card', async () => {
    render(<App />);
    await go('#/code-hashing');
    const link = (await screen.findAllByRole('link', { name: /solve in the editor/i }))[0];
    expect(link).toHaveAttribute('href', '#/code/code-hashing/p-two-sum');
  });

  it('runs the tests, shows the failures, then marks the problem solved', async () => {
    const draft = 'def two_sum(nums, target):\n    return [0, 1]\n';
    localStorage.setItem('interview-library.code', JSON.stringify({ 'code-hashing/p-two-sum': draft }));
    const { sent } = fakeServer([
      { ok: false, stdout: '', stderr: '', ms: 12, tests: { passed: 1, total: 5, failures: [{ line: 2, code: 'assert two_sum([3, 2, 4], 6) == [1, 2]', expected: '[1, 2]', got: '[0, 1]' }] } },
      { ok: true, stdout: '', stderr: '', ms: 10, tests: { passed: 5, total: 5, failures: [] } },
    ]);
    const user = userEvent.setup();
    render(<App />);
    await go('#/code/code-hashing/p-two-sum');
    expect(await screen.findByRole('heading', { name: /two sum/i })).toBeInTheDocument();
    expect(document.title).toMatch(/^Code: Two Sum/);

    await user.click(await screen.findByRole('button', { name: /run tests/i }));
    const results = await screen.findByText(/1 of 5 tests passed/);
    const panel = results.closest('section')!;
    expect(within(panel).getByText('assert two_sum([3, 2, 4], 6) == [1, 2]')).toBeInTheDocument();
    expect(within(panel).getByText('[0, 1]')).toBeInTheDocument();
    // The saved draft is what was sent, with the problem and the mode; the tests themselves stay on the server.
    expect(sent[0]).toEqual({ url: '/api/run', body: { chapterId: 'code-hashing', problemId: 'p-two-sum', code: draft, mode: 'test' } });

    await user.click(screen.getByRole('button', { name: /run tests/i }));
    expect(await screen.findByText(/all 5 tests passed/i)).toBeInTheDocument();
    expect(screen.getAllByText('Solved').length).toBeGreaterThan(0);
    expect(JSON.parse(localStorage.getItem('interview-library.solved')!)['code-hashing/p-two-sum']).toMatchObject({ runs: 2 });
    await waitFor(() => expect(JSON.parse(localStorage.getItem('interview-library.ratings')!)['code-hashing/p-two-sum']).toBe('good'));
  });

  it('shows a run error from your code as a result, not as a server failure', async () => {
    fakeServer([{ ok: false, stdout: '', stderr: '', ms: 5, error: 'NameError: name nums is not defined' }]);
    const user = userEvent.setup();
    render(<App />);
    await go('#/code/code-hashing/p-two-sum');
    await user.click(await screen.findByRole('button', { name: /^▶ run$/i }));
    expect(await screen.findByText(/your code raised an error/i)).toBeInTheDocument();
    expect(screen.getByText(/NameError/)).toBeInTheDocument();
  });

  it('says so when the dev server refuses or is not running', async () => {
    fakeServer([{ status: 403, error: 'Requests must come from the Interview Library page.' }]);
    const user = userEvent.setup();
    render(<App />);
    await go('#/code/code-hashing/p-two-sum');
    await user.click(await screen.findByRole('button', { name: /run tests/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/must come from the interview library page/i);
  });

  it('shows SQL result tables, yours and the expected one', async () => {
    const chapter = CHAPTERS.find((c) => Object.values(exercisesOf(c.id)).some((e) => e.language === 'sql'))!;
    const id = Object.entries(exercisesOf(chapter.id)).find(([, e]) => e.language === 'sql')![0];
    fakeServer([
      { ok: false, stdout: '', stderr: '', ms: 3, tests: { passed: 0, total: 1, failures: [{ line: 0, code: 'rows', message: 'Same rows, wrong order.' }] }, table: { columns: ['name'], rows: [['b'], ['a']], count: 2 }, expected: { columns: [], rows: [['a'], ['b']], count: 2 } },
    ]);
    const user = userEvent.setup();
    render(<App />);
    await go(`#/code/${chapter.id}/${id}`);
    await user.click(await screen.findByRole('button', { name: /check result/i }));
    expect(await screen.findByText('Your result (2 rows)')).toBeInTheDocument();
    expect(screen.getByText('Expected (2 rows)')).toBeInTheDocument();
    expect(screen.getByText('Same rows, wrong order.')).toBeInTheDocument();
  });

  it('keeps the solution behind a confirmation until you solve it', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    render(<App />);
    await go('#/code/code-hashing/p-two-sum');
    await user.click(await screen.findByRole('button', { name: /show the solution/i }));
    expect(confirm).toHaveBeenCalled();
    expect(screen.queryByText('Model solution')).toBeNull();
    confirm.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: /show the solution/i }));
    expect(screen.getByText('Model solution')).toBeInTheDocument();
    confirm.mockRestore();
  });

  it('changes the code font size within limits and remembers it', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await go('#/code/code-hashing/p-two-sum');
    const bigger = await screen.findByRole('button', { name: 'Larger code font' });
    expect(screen.getByText('14px')).toBeInTheDocument();
    await user.click(bigger);
    await user.click(bigger);
    expect(screen.getByText('16px')).toBeInTheDocument();
    expect(document.querySelector<HTMLElement>('.workspace')!.style.getPropertyValue('--code-font')).toBe('16px');
    expect(localStorage.getItem('interview-library.code-font')).toBe('16');
    const smaller = screen.getByRole('button', { name: 'Smaller code font' });
    for (let i = 0; i < 5; i++) await user.click(smaller);
    expect(smaller).toBeDisabled();
    expect(screen.getByText('11px')).toBeInTheDocument();
    unmount();
    render(<App />);
    await go('#/code/code-hashing/p-two-sum');
    expect(await screen.findByText('11px')).toBeInTheDocument();
  });

  it('moves the editor right, left, bottom or top, and remembers the choice', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await go('#/code/code-hashing/p-two-sum');
    const group = await screen.findByRole('group', { name: 'Editor' });
    const workspace = () => document.querySelector('.workspace')!;
    expect(workspace()).toHaveClass('layout-right');
    expect(within(group).getByRole('button', { name: 'Right' })).toHaveAttribute('aria-pressed', 'true');
    for (const name of ['Left', 'Bottom', 'Top'] as const) {
      await user.click(within(group).getByRole('button', { name }));
      expect(workspace()).toHaveClass(`layout-${name.toLowerCase()}`);
      expect(within(group).getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true');
    }
    expect(localStorage.getItem('interview-library.code-layout')).toBe('"top"');
    unmount();
    render(<App />);
    await go('#/code/code-hashing/p-two-sum');
    await screen.findByRole('group', { name: 'Editor' });
    expect(workspace()).toHaveClass('layout-top');
  });

  it('explains an unknown problem instead of crashing', async () => {
    render(<App />);
    await go('#/code/code-hashing/p-nope');
    expect(await screen.findByText(/no coding problem/i)).toBeInTheDocument();
  });
});
