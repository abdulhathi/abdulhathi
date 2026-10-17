// Follows a run's SSE stream with fetch() instead of EventSource, because fetch can send an Authorization header
// and gives us control of reconnects. On a drop it reconnects with Last-Event-ID, so the server replays only what
// we missed; the reducer also ignores duplicates, so a replay can never double a token.

import { backoffDelay, sleep, type BackoffOptions } from './backoff';
import { TERMINAL, toRunEvent, type RunEvent } from './events';
import { readSSE, SSEParser } from './sse';

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';
export type FollowResult = 'finished' | 'aborted' | 'gave_up';

/** 401, 403 and 404 will not get better by retrying. */
export class FatalStreamError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`Stream refused with HTTP ${status}`);
    this.status = status;
  }
}

export type FollowOptions = {
  url: string;
  token: string;
  signal: AbortSignal;
  onEvent: (event: RunEvent) => void;
  onStatus?: (status: ConnectionStatus) => void;
  lastEventId?: number;
  maxAttempts?: number; // consecutive failed reconnects before giving up
  fetchImpl?: typeof fetch;
  backoff?: BackoffOptions;
};

export async function followRun(opts: FollowOptions): Promise<FollowResult> {
  const { url, token, signal, onEvent, onStatus = () => {}, maxAttempts = 8, fetchImpl = fetch } = opts;
  // Only dispatched events move lastId, so an id from an event cut off mid-way never skips that event on resume.
  let lastId = opts.lastEventId ?? 0;
  let attempt = 0;
  let serverRetryMs: number | undefined;

  while (!signal.aborted) {
    try {
      onStatus(attempt === 0 ? 'connecting' : 'reconnecting');
      const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' };
      if (lastId > 0) headers['Last-Event-ID'] = String(lastId);
      const response = await fetchImpl(url, { headers, signal, cache: 'no-store' });
      if ([401, 403, 404].includes(response.status)) throw new FatalStreamError(response.status);
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
      onStatus('open');
      attempt = 0;
      const parser = new SSEParser();
      for await (const message of readSSE(response.body, parser)) {
        serverRetryMs = parser.reconnectMs ?? serverRetryMs;
        const event = toRunEvent(message);
        if (!event || event.id <= lastId) continue;
        lastId = event.id;
        onEvent(event);
        if (TERMINAL.has(event.type)) {
          onStatus('closed');
          return 'finished';
        }
      }
      serverRetryMs = parser.reconnectMs ?? serverRetryMs;
      // The body ended without a terminal event: a proxy timeout or a server restart. Reconnect.
    } catch (error) {
      if (signal.aborted) break;
      if (error instanceof FatalStreamError) {
        onStatus('closed');
        throw error;
      }
    }
    if (attempt >= maxAttempts) {
      onStatus('closed');
      return 'gave_up';
    }
    onStatus('reconnecting');
    const delay = Math.max(backoffDelay(attempt, opts.backoff), attempt === 0 ? (serverRetryMs ?? 0) : 0);
    attempt++;
    try {
      await sleep(delay, signal);
    } catch {
      break;
    }
  }
  onStatus('closed');
  return 'aborted';
}
