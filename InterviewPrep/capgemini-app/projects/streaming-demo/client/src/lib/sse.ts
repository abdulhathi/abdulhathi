// A text/event-stream parser that follows the WHATWG rules and never assumes a network chunk holds whole lines:
// a chunk can end in the middle of a line, a field, or even between the \r and \n of a line break.
//
// The rules that are easy to get wrong:
// - An id: line only fills a buffer. The last event id is committed when the event is dispatched (the blank
//   line), so a connection that drops mid-event cannot advance the resume point past an event never delivered.
//   A block with an id but no data still commits it.
// - One leading byte order mark is ignored.
// - A \r at the end of a chunk may be half of \r\n, so it waits for the next non-empty chunk (or the end).
// - At the end of the stream, an event without its closing blank line is incomplete and is discarded.

export type SSEMessage = {
  event: string; // "message" when the server sent no event: line
  data: string; // data: lines joined with \n
  id: string; // the last event id as of this message (it persists across messages, as in EventSource)
};

export class SSEParser {
  private buffer = '';
  private data: string[] = [];
  private event = '';
  private idBuffer = '';
  private started = false;
  /** The last event id, committed at dispatch. This is what a reconnect should send as Last-Event-ID. */
  lastEventId = '';
  /** The server's reconnection hint (a retry: field) in milliseconds. It applies at once, even without data. */
  reconnectMs: number | undefined;
  /** Comments (": ping") seen so far; useful for "last heard from the server" heartbeat checks. */
  comments = 0;

  feed(chunk: string): SSEMessage[] {
    if (!this.started && chunk.length > 0) {
      this.started = true;
      if (chunk.startsWith('\uFEFF')) chunk = chunk.slice(1);
    }
    this.buffer += chunk;
    const out: SSEMessage[] = [];
    let start = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      const ch = this.buffer[i];
      if (ch !== '\n' && ch !== '\r') continue;
      // A lone \r at the very end might be the first half of \r\n: wait for more input to decide.
      if (ch === '\r' && i === this.buffer.length - 1) break;
      this.line(this.buffer.slice(start, i), out);
      if (ch === '\r' && this.buffer[i + 1] === '\n') i++;
      start = i + 1;
    }
    this.buffer = this.buffer.slice(start);
    return out;
  }

  /** Call when the stream ends: a pending \r is a complete line break, and an unfinished event is dropped. */
  end(): SSEMessage[] {
    const out: SSEMessage[] = [];
    if (this.buffer.endsWith('\r')) this.line(this.buffer.slice(0, -1), out);
    this.buffer = '';
    this.data = [];
    this.event = '';
    this.idBuffer = this.lastEventId; // an id from the unfinished event is never committed
    return out;
  }

  private line(line: string, out: SSEMessage[]) {
    if (line === '') return this.dispatch(out);
    if (line.startsWith(':')) {
      this.comments++;
      return;
    }
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') this.data.push(value);
    else if (field === 'event') this.event = value;
    else if (field === 'id' && !value.includes('\0')) this.idBuffer = value;
    else if (field === 'retry' && /^\d+$/.test(value)) this.reconnectMs = Number(value);
    // Any other field is ignored, as the spec says.
  }

  private dispatch(out: SSEMessage[]) {
    this.lastEventId = this.idBuffer; // committed here, even if there is no data to dispatch
    if (this.data.length > 0) {
      out.push({ event: this.event || 'message', data: this.data.join('\n'), id: this.lastEventId });
    }
    this.data = [];
    this.event = '';
  }
}

/** Reads a fetch() body as SSE messages. Stopping early (break, an abort) releases the connection. */
export async function* readSSE(body: ReadableStream<Uint8Array>, parser = new SSEParser()): AsyncGenerator<SSEMessage> {
  const reader = body.getReader();
  const decoder = new TextDecoder(); // { stream: true } below keeps multi-byte characters split across chunks intact
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      yield* parser.feed(decoder.decode(value, { stream: true }));
    }
    yield* parser.feed(decoder.decode());
    yield* parser.end();
  } finally {
    await reader.cancel().catch(() => {});
  }
}
