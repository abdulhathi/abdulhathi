// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type Anthropic from '@anthropic-ai/sdk';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { askMessages, createWordsHandler, decodeEntities, explainPrompt, pickTranslations } from './words';

describe('translation helpers', () => {
  it('decodes the entities MyMemory sends back', () => {
    expect(decodeEntities('Tom&#39;s &amp; Jerry&#x27;s &lt;b&gt; &quot;ok&quot;')).toBe(`Tom's & Jerry's <b> "ok"`);
    expect(decodeEntities('&amp;lt;')).toBe('&lt;');
  });

  it('keeps Tamil translations and drops English noise, echoes and duplicates', () => {
    expect(pickTranslations('token', 'ta', ['டோக்கன்', 'token', 'TOKEN', 'QFontDatabase', 'டோக்கன்', 'அடையாள வில்லை'])).toEqual(['டோக்கன்', 'அடையாள வில்லை']);
  });

  it('builds a question as one conversation: passage and question first, then answers and follow-ups', () => {
    const first = askMessages('nonce', 'The ID token carries the nonce.', [], 'Why is it random?');
    expect(first).toHaveLength(1);
    expect(first[0].content).toContain('--- passage the reader is looking at ---\nThe ID token carries the nonce.');
    expect(first[0].content).toContain('Highlighted text: nonce');
    expect(first[0].content.endsWith('Question: Why is it random?')).toBe(true);
    const follow = askMessages('nonce', '', [{ question: 'Why is it random?', answer: 'So it cannot be guessed.' }], 'Who checks it?');
    expect(follow.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(follow[0].content).toBe('Highlighted text: nonce\n\nQuestion: Why is it random?');
    expect(follow[2].content).toBe('Who checks it?');
    // An Explain answer carried into Ask has no question of its own.
    const seeded = askMessages('nonce', '', [{ question: '', answer: 'A one-time value.' }], 'Give an example.');
    expect(seeded[0].content).toContain('Question: Explain this term as it is used in the passage.');
    expect(seeded[1]).toEqual({ role: 'assistant', content: 'A one-time value.' });
  });

  it('asks for the meaning in the passage when there is one', () => {
    expect(explainPrompt('nonce', '')).toBe('nonce');
    const p = explainPrompt('nonce', 'The ID token carries the nonce you sent.');
    expect(p).toContain('--- passage the reader is looking at ---\nThe ID token carries the nonce you sent.');
    expect(p.endsWith('as it is used in that passage: nonce')).toBe(true);
  });
});

describe('/api/words', () => {
  let server: Server;
  let base = '';
  let create: ReturnType<typeof vi.fn>;
  let fetchImpl: ReturnType<typeof vi.fn>;
  let handler: ReturnType<typeof createWordsHandler>;

  beforeEach(() => {
    create = vi.fn(async (body: { model: string }) => ({ model: body.model, content: [{ type: 'text', text: 'A one-time random value that ties the token to your request.' }] }));
    fetchImpl = vi.fn(async () => Response.json({ responseData: { translatedText: 'ஒருமுறை மதிப்பு' }, matches: [{ translation: 'nonce' }] }));
    handler = createWordsHandler({ header: 'x-test-app', client: { beta: { messages: { create } } } as unknown as Anthropic, fetchImpl: fetchImpl as unknown as typeof fetch });
  });
  beforeAll(async () => {
    server = createServer((req, res) => {
      req.url = req.url!.replace(/^\/api\/words/, '') || '/';
      void handler(req, res, () => {
        res.statusCode = 404;
        res.end();
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const a = server.address();
    base = `http://127.0.0.1:${typeof a === 'object' && a ? a.port : 0}/api/words`;
  });
  afterAll(() => server.close());

  const H = { 'x-test-app': '1' };
  const translate = (text: string, headers: Record<string, string> = H) => fetch(`${base}/translate?${new URLSearchParams({ text, target: 'ta' })}`, { headers });
  const explain = (body: unknown, headers: Record<string, string> = H) =>
    fetch(`${base}/explain`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  it('translates through MyMemory, then answers repeats from the cache', async () => {
    const first = await (await translate('nonce')).json();
    expect(first).toEqual({ text: 'nonce', target: 'ta', translations: ['ஒருமுறை மதிப்பு'], cached: false });
    expect(String(fetchImpl.mock.calls[0][0])).toContain('langpair=en%7Cta');
    expect((await (await translate('NONCE')).json()).cached).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('explains with Claude using the passage, and caches per passage', async () => {
    const r = await (await explain({ text: 'nonce', context: 'The ID token carries the nonce.', model: 'claude-haiku-5-5' })).json();
    expect(r).toMatchObject({ explanation: 'A one-time random value that ties the token to your request.', model: 'claude-haiku-5-5', cached: false });
    const sent = create.mock.calls[0][0] as { model: string; messages: { content: string }[]; system: string };
    expect(sent.model).toBe('claude-haiku-5-5');
    expect(sent.messages[0].content).toContain('The ID token carries the nonce.');
    expect((await (await explain({ text: 'nonce', context: 'The ID token carries the nonce.', model: 'claude-haiku-5-5' })).json()).cached).toBe(true);
    await explain({ text: 'nonce', context: 'A different passage.', model: 'claude-haiku-5-5' });
    expect(create).toHaveBeenCalledTimes(2);
  });

  const ask = (body: unknown, headers: Record<string, string> = H) =>
    fetch(`${base}/ask`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  it('answers a question with Claude, sending the conversation so far, and caches it', async () => {
    const body = { text: 'nonce', context: 'The ID token carries the nonce.', question: 'Who checks it?', history: [{ question: 'What is it?', answer: 'A one-time value.' }], model: 'claude-haiku-5-5' };
    const r = await (await ask(body)).json();
    expect(r).toMatchObject({ question: 'Who checks it?', answer: 'A one-time random value that ties the token to your request.', model: 'claude-haiku-5-5', cached: false });
    const sent = create.mock.calls[0][0] as { system: string; messages: { role: string; content: string }[]; output_config: { effort: string } };
    expect(sent.system).toMatch(/asked a question/);
    expect(sent.output_config.effort).toBe('medium');
    expect(sent.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(sent.messages[2].content).toBe('Who checks it?');
    expect((await (await ask(body)).json()).cached).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('keeps only well-formed, recent history, and refuses an empty or very long question', async () => {
    const history = [{ question: 'x' }, 'junk', ...Array.from({ length: 9 }, (_, i) => ({ question: `q${i}`, answer: `a${i}` }))];
    await ask({ text: 'salt', question: 'Why?', history });
    const sent = create.mock.calls[0][0] as { messages: { role: string; content: string }[] };
    expect(sent.messages).toHaveLength(6 * 2 + 1); // the last six turns, then the new question
    expect(sent.messages[1].content).toBe('a3');
    expect((await ask({ text: 'salt', question: '' })).status).toBe(400);
    expect((await ask({ text: 'salt', question: 'x'.repeat(501) })).status).toBe(400);
    expect((await ask({ text: '', question: 'Why?' })).status).toBe(400);
    expect((await ask({ text: 'salt', question: 'Why?' }, {})).status).toBe(403);
  });

  it('uses the default model when none (or an unknown one) is asked for', async () => {
    await explain({ text: 'salt', model: 'gpt-x' });
    expect((create.mock.calls[0][0] as { model: string }).model).toBe('claude-opus-5-5');
  });

  it('refuses other pages and bad input', async () => {
    expect((await translate('nonce', {})).status).toBe(403);
    expect((await explain({ text: 'nonce' }, { 'x-test-app': '1', origin: 'https://evil.example' })).status).toBe(403);
    expect((await translate('')).status).toBe(400);
    expect((await translate('x'.repeat(501))).status).toBe(400);
    expect((await explain({ text: '' })).status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it('says how to sign in when Claude has no credentials', async () => {
    create.mockRejectedValueOnce(new Error('Could not resolve authentication method'));
    const r = await explain({ text: 'pepper' });
    expect(r.status).toBe(503);
    expect((await r.json()).error).toMatch(/ant auth login/);
  });
});
