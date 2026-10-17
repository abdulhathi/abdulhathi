// The control socket: approve or cancel a run while it streams. Plain logic with no React, so it is easy to test
// with a fake socket. It authenticates with its first message, keeps a heartbeat, reconnects with backoff, and
// resends unacknowledged requests after a reconnect, which is safe because the server treats approvals idempotently.

import { backoffDelay, type BackoffOptions } from './backoff';

export type ChannelStatus = 'connecting' | 'ready' | 'reconnecting' | 'closed';
export type ControlRequest = { type: 'approve'; step_id: string; approved: boolean } | { type: 'cancel' };
export type ControlReply =
  | { type: 'ack'; request_id: string; result: string }
  | { type: 'error'; request_id?: string; code: string; detail?: string };

/** The parts of the browser WebSocket this class uses, so tests can pass a fake. */
export type SocketLike = {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: Event) => unknown) | null;
  onmessage: ((ev: MessageEvent) => unknown) | null;
  onclose: ((ev: CloseEvent) => unknown) | null;
  onerror: ((ev: Event) => unknown) | null;
};

export type ChannelOptions = {
  url: string;
  token: string;
  onStatus?: (status: ChannelStatus) => void;
  createSocket?: (url: string) => SocketLike;
  heartbeatMs?: number; // how often to ping
  pongTimeoutMs?: number; // no pong this long after a ping → the connection is dead
  requestTimeoutMs?: number;
  maxAttempts?: number;
  backoff?: BackoffOptions;
};

const OPEN = 1;
const FATAL_CLOSE_CODES = new Set([1008, 4404]); // bad auth, unknown run: retrying will not help

type Pending = { message: string; resolve: (r: ControlReply) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };

export class ControlChannel {
  status: ChannelStatus = 'connecting';
  private socket: SocketLike | null = null;
  private pending = new Map<string, Pending>();
  private attempt = 0;
  private stopped = false;
  private nextRequest = 1;
  private nextPing = 1;
  private timers = { heartbeat: undefined as ReturnType<typeof setInterval> | undefined, pong: undefined as ReturnType<typeof setTimeout> | undefined, retry: undefined as ReturnType<typeof setTimeout> | undefined };
  private readonly opts: Required<Omit<ChannelOptions, 'backoff' | 'onStatus'>> & Pick<ChannelOptions, 'backoff' | 'onStatus'>;

  constructor(options: ChannelOptions) {
    this.opts = {
      createSocket: (url) => new WebSocket(url),
      heartbeatMs: 10_000,
      pongTimeoutMs: 5_000,
      requestTimeoutMs: 10_000,
      maxAttempts: 8,
      ...options,
    };
  }

  start() {
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    this.clearTimers();
    clearTimeout(this.timers.retry);
    this.socket?.close(1000, 'client closed');
    this.socket = null;
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error('channel stopped'));
      this.pending.delete(id);
    }
    this.setStatus('closed');
  }

  /** Sends now if the socket is ready, otherwise as soon as it is. Resolves with the server's ack or error reply. */
  request(body: ControlRequest): Promise<ControlReply> {
    if (this.stopped || this.status === 'closed') return Promise.reject(new Error('channel closed'));
    const requestId = `req-${this.nextRequest++}`;
    const message = JSON.stringify({ ...body, request_id: requestId });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`no reply to ${body.type} within ${this.opts.requestTimeoutMs} ms`));
      }, this.opts.requestTimeoutMs);
      this.pending.set(requestId, { message, resolve, reject, timer });
      if (this.status === 'ready') this.socket?.send(message);
    });
  }

  private connect() {
    this.setStatus(this.attempt === 0 ? 'connecting' : 'reconnecting');
    const socket = this.opts.createSocket(this.opts.url);
    this.socket = socket;
    // Every handler checks that this is still the current socket: after a heartbeat timeout we give up on a socket
    // before its close event arrives, and nothing it delivers late may touch the new connection's state.
    socket.onopen = () => {
      if (this.socket === socket) socket.send(JSON.stringify({ type: 'auth', token: this.opts.token }));
    };
    socket.onmessage = (ev) => {
      if (this.socket === socket) this.onMessage(String(ev.data));
    };
    socket.onerror = () => {}; // a close event always follows; handle everything there
    socket.onclose = (ev) => {
      if (this.socket === socket) this.dropped(ev.code);
    };
  }

  private dropped(code: number) {
    this.socket = null;
    this.clearTimers();
    if (this.stopped) return;
    if (FATAL_CLOSE_CODES.has(code) || this.attempt >= this.opts.maxAttempts) return this.fail(`closed with code ${code}`);
    this.setStatus('reconnecting');
    this.timers.retry = setTimeout(() => this.connect(), backoffDelay(this.attempt++, this.opts.backoff));
  }

  private onMessage(raw: string) {
    let msg: { type?: string; request_id?: string };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type === 'ready') {
      this.attempt = 0;
      this.setStatus('ready');
      this.startHeartbeat();
      for (const p of this.pending.values()) this.socket?.send(p.message); // resend anything not acknowledged
    } else if (msg.type === 'pong') {
      clearTimeout(this.timers.pong);
      this.timers.pong = undefined;
    } else if ((msg.type === 'ack' || msg.type === 'error') && msg.request_id && this.pending.has(msg.request_id)) {
      const p = this.pending.get(msg.request_id)!;
      clearTimeout(p.timer);
      this.pending.delete(msg.request_id);
      p.resolve(msg as ControlReply);
    }
  }

  private startHeartbeat() {
    this.clearTimers();
    this.timers.heartbeat = setInterval(() => {
      // One ping in flight at a time. Resetting the pong deadline on every tick would mean a dead socket is never
      // detected whenever pongTimeoutMs is longer than heartbeatMs.
      if (this.socket?.readyState !== OPEN || this.timers.pong !== undefined) return;
      this.socket.send(JSON.stringify({ type: 'ping', id: this.nextPing++ }));
      // No pong in time means the connection is half-open (common after a laptop sleeps). Do not wait for a close
      // event that may take a minute to arrive: give up on this socket now and reconnect.
      this.timers.pong = setTimeout(() => {
        this.timers.pong = undefined;
        this.socket?.close(4000, 'heartbeat timeout');
        this.dropped(4000);
      }, this.opts.pongTimeoutMs);
    }, this.opts.heartbeatMs);
  }

  private clearTimers() {
    clearInterval(this.timers.heartbeat);
    clearTimeout(this.timers.pong);
    this.timers.heartbeat = undefined;
    this.timers.pong = undefined;
  }

  private fail(reason: string) {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error(reason));
      this.pending.delete(id);
    }
    this.setStatus('closed');
  }

  private setStatus(status: ChannelStatus) {
    if (this.status === status) return;
    this.status = status;
    this.opts.onStatus?.(status);
  }
}
