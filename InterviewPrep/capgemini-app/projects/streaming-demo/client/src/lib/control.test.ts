// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ControlChannel, type ChannelStatus, type SocketLike } from './control';

/** A scripted stand-in for the browser WebSocket: the test plays the server. */
class FakeSocket implements SocketLike {
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  closedWith: number | null = null;
  onopen: ((ev: Event) => unknown) | null = null;
  onmessage: ((ev: MessageEvent) => unknown) | null = null;
  onclose: ((ev: CloseEvent) => unknown) | null = null;
  onerror: ((ev: Event) => unknown) | null = null;
  constructor(readonly url: string) {}
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close(code = 1000) {
    this.closedWith = code;
    this.readyState = 3;
  }
  // server side
  open() {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }
  reply(msg: object) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(msg) }));
  }
  drop(code: number) {
    this.readyState = 3;
    this.onclose?.({ code } as CloseEvent);
  }
}

let sockets: FakeSocket[];
let statuses: ChannelStatus[];

function channel(overrides = {}) {
  return new ControlChannel({
    url: 'ws://test/control',
    token: 'secret',
    createSocket: (url) => {
      const s = new FakeSocket(url);
      sockets.push(s);
      return s;
    },
    onStatus: (s) => statuses.push(s),
    backoff: { random: () => 0 },
    heartbeatMs: 1000,
    pongTimeoutMs: 500,
    ...overrides,
  });
}

/** Opens the latest socket and completes the auth handshake. */
function handshake() {
  const s = sockets.at(-1)!;
  s.open();
  expect(s.sent[0]).toEqual({ type: 'auth', token: 'secret' }); // auth is always the first message
  s.reply({ type: 'ready', run_id: 'r1', status: 'running' });
  return s;
}

beforeEach(() => {
  sockets = [];
  statuses = [];
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('ControlChannel', () => {
  it('authenticates first, then correlates requests and replies by request_id', async () => {
    const ch = channel();
    ch.start();
    const s = handshake();
    expect(ch.status).toBe('ready');
    const reply = ch.request({ type: 'approve', step_id: 'po', approved: true });
    expect(s.sent[1]).toEqual({ type: 'approve', step_id: 'po', approved: true, request_id: 'req-1' });
    s.reply({ type: 'ack', request_id: 'req-1', result: 'ok' });
    await expect(reply).resolves.toEqual({ type: 'ack', request_id: 'req-1', result: 'ok' });
    ch.stop();
  });

  it('queues a request made before the socket is ready', async () => {
    const ch = channel();
    ch.start();
    const reply = ch.request({ type: 'cancel' });
    const s = handshake();
    expect(s.sent.map((m) => m.type)).toEqual(['auth', 'cancel']);
    s.reply({ type: 'ack', request_id: 'req-1', result: 'cancelled' });
    await expect(reply).resolves.toMatchObject({ result: 'cancelled' });
    ch.stop();
  });

  it('reconnects after a drop and resends what was never acknowledged', async () => {
    const ch = channel();
    ch.start();
    handshake();
    const reply = ch.request({ type: 'approve', step_id: 'po', approved: true });
    sockets[0].drop(1006); // network blip before the ack arrived
    expect(ch.status).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(0); // backoff (random 0 → no wait)
    expect(sockets).toHaveLength(2);
    const s2 = handshake();
    expect(s2.sent[1]).toMatchObject({ type: 'approve', request_id: 'req-1' }); // safe: approvals are idempotent
    s2.reply({ type: 'ack', request_id: 'req-1', result: 'duplicate' });
    await expect(reply).resolves.toMatchObject({ result: 'duplicate' });
    expect(statuses).toEqual(['ready', 'reconnecting', 'ready']);
    ch.stop();
  });

  it('does not retry after a policy-violation close, and fails pending requests', async () => {
    const ch = channel();
    ch.start();
    const reply = ch.request({ type: 'cancel' });
    sockets[0].open();
    sockets[0].drop(1008);
    await expect(reply).rejects.toThrow('closed with code 1008');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets).toHaveLength(1);
    expect(ch.status).toBe('closed');
  });

  it('pings on an interval and replaces a socket that stops answering', async () => {
    const ch = channel();
    ch.start();
    const s = handshake();
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.sent.at(-1)).toEqual({ type: 'ping', id: 1 });
    s.reply({ type: 'pong', id: 1 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.sent.at(-1)).toEqual({ type: 'ping', id: 2 });
    await vi.advanceTimersByTimeAsync(500); // no pong this time: half-open connection
    expect(s.closedWith).toBe(4000);
    await vi.advanceTimersByTimeAsync(1); // fake timers run a 0 ms timer set inside another timer 1 ms later
    expect(sockets).toHaveLength(2);
    ch.stop();
  });

  it('still detects a dead socket when the pong timeout is longer than the ping interval', async () => {
    const ch = channel({ heartbeatMs: 1000, pongTimeoutMs: 2500 });
    ch.start();
    const s = handshake();
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.sent.at(-1)).toEqual({ type: 'ping', id: 1 });
    await vi.advanceTimersByTimeAsync(2000); // two more ticks: no second ping while the first is unanswered
    expect(s.sent.filter((m) => m.type === 'ping')).toHaveLength(1);
    expect(s.closedWith).toBeNull();
    await vi.advanceTimersByTimeAsync(500); // 2500 ms after the unanswered ping
    expect(s.closedWith).toBe(4000);
    ch.stop();
  });

  it('ignores anything a replaced socket delivers late', async () => {
    const ch = channel();
    ch.start();
    const old = handshake();
    const reply = ch.request({ type: 'approve', step_id: 'po', approved: true });
    old.drop(1006);
    await vi.advanceTimersByTimeAsync(0);
    expect(sockets).toHaveLength(2);
    old.reply({ type: 'ready', run_id: 'r1', status: 'running' }); // late frames from the dead connection
    old.reply({ type: 'ack', request_id: 'req-1', result: 'ok' });
    expect(ch.status).toBe('reconnecting');
    const fresh = handshake();
    expect(fresh.sent.at(-1)).toMatchObject({ type: 'approve', request_id: 'req-1' }); // resent on the new socket
    fresh.reply({ type: 'ack', request_id: 'req-1', result: 'duplicate' });
    await expect(reply).resolves.toEqual({ type: 'ack', request_id: 'req-1', result: 'duplicate' });
    ch.stop();
  });

  it('rejects requests that get no reply in time', async () => {
    const ch = channel({ requestTimeoutMs: 2000 });
    ch.start();
    handshake();
    const reply = ch.request({ type: 'cancel' });
    const settled = expect(reply).rejects.toThrow('no reply to cancel');
    await vi.advanceTimersByTimeAsync(2000);
    await settled;
    ch.stop();
  });

  it('stop() closes the socket and rejects anything pending', async () => {
    const ch = channel();
    ch.start();
    const s = handshake();
    const reply = ch.request({ type: 'cancel' });
    ch.stop();
    await expect(reply).rejects.toThrow('channel stopped');
    expect(s.closedWith).toBe(1000);
    expect(ch.status).toBe('closed');
  });
});
