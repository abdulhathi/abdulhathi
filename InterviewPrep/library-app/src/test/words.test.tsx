import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeSelection, WordHelper } from '../components/WordHelper';

function select(node: Node, start?: number, end?: number) {
  const range = document.createRange();
  if (start === undefined) range.selectNodeContents(node);
  else {
    range.setStart(node, start);
    range.setEnd(node, end!);
  }
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
}

let sent: { url: string; body?: Record<string, unknown>; headers: Headers }[];
beforeEach(() => {
  sent = [];
  // jsdom has no layout: give ranges a box so the chip has somewhere to go.
  Range.prototype.getBoundingClientRect = () => new DOMRect(100, 100, 120, 18);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      sent.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined, headers: new Headers(init?.headers) });
      if (url.startsWith('/api/words/translate')) return Response.json({ translations: ['அங்கீகரிப்பு', 'அடையாளச் சோதனை'], cached: false });
      return Response.json({ explanation: 'Proving who you are before you get access.', model: 'claude-haiku-5-5', cached: true });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const page = () =>
  render(
    <>
      <p data-testid="para">
        Every request needs <span data-testid="word">authentication</span> before the server answers it.
      </p>
      <input aria-label="notes" defaultValue="authentication in a field" />
      <WordHelper target="ta" headers={{ 'X-Test-App': '1' }} model="claude-haiku-5-5" />
    </>,
  );

describe('the word helper', () => {
  it('trims punctuation from the ends of a selection only', () => {
    expect(normalizeSelection('  “token,”  ')).toBe('token');
    expect(normalizeSelection("(user's re-login)")).toBe("user's re-login");
  });

  it('translates a double-clicked word into Tamil', async () => {
    page();
    select(screen.getByTestId('word'));
    fireEvent.dblClick(screen.getByTestId('word'), { clientX: 120, clientY: 90 });
    expect(await screen.findByText('அங்கீகரிப்பு')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Translation' })).toHaveTextContent('EN → TA');
    expect(sent[0].url).toBe('/api/words/translate?text=authentication&target=ta');
    expect(sent[0].headers.get('X-Test-App')).toBe('1');
  });

  it('offers Speak, Translate and Explain for a selected phrase, and explains it in context', async () => {
    const user = userEvent.setup();
    page();
    const text = screen.getByTestId('para').firstChild!; // "Every request needs "
    select(text, 0, 13);
    fireEvent.mouseUp(screen.getByTestId('para'));
    const chip = await screen.findByRole('toolbar', { name: 'Selected text' });
    expect(chip).toHaveTextContent('Translate');
    await user.click(screen.getByRole('button', { name: /Explain/ }));
    expect(await screen.findByText('Proving who you are before you get access.')).toBeInTheDocument();
    expect(screen.getByText(/via Claude · claude-haiku-5-5/)).toBeInTheDocument();
    expect(screen.getByText('cached')).toBeInTheDocument();
    expect(sent[0].body).toMatchObject({ text: 'Every request', model: 'claude-haiku-5-5' });
    expect(String(sent[0].body!.context)).toContain('before the server answers it');
  });

  it('switches between Translate and Explain, and closes with Escape', async () => {
    const user = userEvent.setup();
    page();
    select(screen.getByTestId('word'));
    fireEvent.dblClick(screen.getByTestId('word'));
    await screen.findByText('அங்கீகரிப்பு');
    await user.click(screen.getByRole('button', { name: 'Explain with Claude' }));
    expect(await screen.findByText('Proving who you are before you get access.')).toBeInTheDocument();
    await act(async () => new Promise((r) => setTimeout(r, 5)));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('leaves selections in fields alone', async () => {
    page();
    const field = screen.getByRole('textbox', { name: 'notes' });
    fireEvent.dblClick(field);
    fireEvent.mouseUp(field);
    await act(async () => new Promise((r) => setTimeout(r, 5)));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(sent).toEqual([]);
  });

  it('shows the server’s message when something goes wrong', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'Claude is not signed in. Run `ant auth login`.' }, { status: 503 })));
    const user = userEvent.setup();
    page();
    select(screen.getByTestId('word'));
    fireEvent.dblClick(screen.getByTestId('word'));
    await user.click(await screen.findByRole('button', { name: 'Explain with Claude' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ant auth login');
  });
});
