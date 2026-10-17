// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { backoffDelay } from './backoff';
import type { RunEvent } from './events';
import { FatalStreamError, followRun, type ConnectionStatus } from './stream';

const enc = new TextEncoder();
const frame = (id: number, type: string, data: object) => `id: ${id}\nevent: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
const token = (id: number, text: string) => frame(id, 'token', { step_id: 'answer', text });

/** A Response whose body streams the given chunks; with `hang`, it never ends (until the request is aborted). */
function sse(chunks: string[], { hang = false, signal }: { hang?: boolean; signal?: AbortSignal } = {}) {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const chunk of chunks) c.enqueue(enc.encode(chunk));
      if (!hang) c.close();
      signal?.addEventListener('abort', () => c.error(signal.reason));
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

type Call = { lastEventId: string | null; auth: string | null };

function fakeFetch(responders: ((signal?: AbortSignal) => Response | Promise<Response>)[]) {
  const calls: Call[] = [];
  const impl = (async (_url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({ lastEventId: headers.get('Last-Event-ID'), auth: headers.get('Authorization') });
    const next = responders[Math.min(calls.length - 1, responders.length - 1)];
    return next(init?.signal ?? undefined);
  }) as typeof fetch;
  return { impl, calls };
}

const noWait = { random: () => 0 };

describe('followRun', () => {
  it('reconnects with Last-Event-ID after a drop and never delivers an event twice', async () => {
    const { impl, calls } = fakeFetch([
      () => sse([token(1, 'Hel'), token(2, 'lo')]), // the connection drops after event 2
      () => sse([token(2, 'lo'), token(3, '!'), frame(4, 'run.completed', {})]), // server replays 2 (it should not, but be safe)
    ]);
    const seen: RunEvent[] = [];
    const statuses: ConnectionStatus[] = [];
    const result = await followRun({
      url: '/x', token: 't', signal: new AbortController().signal, fetchImpl: impl, backoff: noWait,
      onEvent: (e) => seen.push(e), onStatus: (s) => statuses.push(s),
    });
    expect(result).toBe('finished');
    expect(seen.map((e) => e.id)).toEqual([1, 2, 3, 4]);
    expect(calls).toEqual([
      { lastEventId: null, auth: 'Bearer t' },
      { lastEventId: '2', auth: 'Bearer t' },
    ]);
    expect(statuses).toEqual(['connecting', 'open', 'reconnecting', 'reconnecting', 'open', 'closed']);
  });

  it('starts from a given event id, for a page reload that already has some events', async () => {
    const { impl, calls } = fakeFetch([() => sse([frame(10, 'run.completed', {})])]);
    await followRun({ url: '/x', token: 't', signal: new AbortController().signal, fetchImpl: impl, lastEventId: 9, onEvent: () => {} });
    expect(calls[0].lastEventId).toBe('9');
  });

  it('does not retry a 401 or 404', async () => {
    const { impl, calls } = fakeFetch([() => new Response('no', { status: 401 })]);
    await expect(followRun({ url: '/x', token: 'bad', signal: new AbortController().signal, fetchImpl: impl, onEvent: () => {} })).rejects.toBeInstanceOf(
      FatalStreamError,
    );
    expect(calls).toHaveLength(1);
  });

  it('gives up after maxAttempts consecutive failures', async () => {
    const { impl, calls } = fakeFetch([() => Promise.reject(new TypeError('network down'))]);
    const result = await followRun({ url: '/x', token: 't', signal: new AbortController().signal, fetchImpl: impl, maxAttempts: 2, backoff: noWait, onEvent: () => {} });
    expect(result).toBe('gave_up');
    expect(calls).toHaveLength(3); // the first try plus two retries
  });

  it('stops cleanly when aborted mid-stream', async () => {
    const controller = new AbortController();
    const { impl } = fakeFetch([(signal) => sse([token(1, 'a')], { hang: true, signal })]);
    const seen: number[] = [];
    const done = followRun({
      url: '/x', token: 't', signal: controller.signal, fetchImpl: impl,
      onEvent: (e) => {
        seen.push(e.id);
        controller.abort(); // the user pressed Stop or navigated away
      },
    });
    await expect(done).resolves.toBe('aborted');
    expect(seen).toEqual([1]);
  });
});

describe('backoffDelay', () => {
  it('grows exponentially, is capped, and is jittered between 0 and the ceiling', () => {
    const top = { random: () => 0.999999 };
    expect([0, 1, 2, 3, 10].map((a) => backoffDelay(a, { baseMs: 100, maxMs: 1000, ...top }))).toEqual([100, 200, 400, 800, 1000]);
    expect(backoffDelay(5, { random: () => 0 })).toBe(0);
    expect(backoffDelay(1, { baseMs: 100, random: () => 0.5 })).toBe(100);
  });
});
