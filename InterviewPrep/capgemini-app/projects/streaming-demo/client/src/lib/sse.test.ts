// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readSSE, SSEParser, type SSEMessage } from './sse';

const WIRE = 'event: token\nid: 7\ndata: {"text":"Hel"}\n\n: ping\n\nevent: token\nid: 8\ndata: {"text":"lo"}\n\n';

const feedAll = (parser: SSEParser, chunks: string[]) => chunks.flatMap((c) => parser.feed(c));

describe('SSEParser', () => {
  it('parses named events with ids and skips comments', () => {
    const parser = new SSEParser();
    expect(parser.feed(WIRE)).toEqual([
      { event: 'token', id: '7', data: '{"text":"Hel"}' },
      { event: 'token', id: '8', data: '{"text":"lo"}' },
    ]);
    expect(parser.comments).toBe(1);
  });

  it('gives the same result however the stream is split, even one character at a time', () => {
    const whole = new SSEParser().feed(WIRE);
    expect(feedAll(new SSEParser(), [...WIRE])).toEqual(whole);
    for (let cut = 1; cut < WIRE.length; cut++) {
      expect(feedAll(new SSEParser(), [WIRE.slice(0, cut), WIRE.slice(cut)])).toEqual(whole);
    }
  });

  it('handles CRLF and CR line endings, including a CRLF split across chunks', () => {
    expect(feedAll(new SSEParser(), ['data: a\r', '\n\r', '\n'])).toEqual([{ event: 'message', id: '', data: 'a' }]);
    expect(new SSEParser().feed('data: b\r\rdata: c\n\n')).toEqual([
      { event: 'message', id: '', data: 'b' },
      { event: 'message', id: '', data: 'c' },
    ]);
  });

  it('joins multi-line data, keeps the last id, and strips only one leading space', () => {
    const out = new SSEParser().feed('id: 3\ndata: line one\ndata:  indented\n\ndata: no id here\n\n');
    expect(out).toEqual([
      { event: 'message', id: '3', data: 'line one\n indented' },
      { event: 'message', id: '3', data: 'no id here' },
    ]);
  });

  it('commits the last event id only at dispatch, so a mid-event drop cannot skip that event', () => {
    const parser = new SSEParser();
    expect(parser.feed('id: 1\ndata: a\n\nid: 2\ndata: b\n')).toEqual([{ event: 'message', id: '1', data: 'a' }]);
    expect(parser.lastEventId).toBe('1'); // id 2 arrived, but its event has not been dispatched yet
    expect(parser.end()).toEqual([]); // the stream ended mid-event: the event is discarded
    expect(parser.lastEventId).toBe('1'); // so a reconnect asks for everything after 1, including event 2
  });

  it('commits an id from a block that has no data', () => {
    const parser = new SSEParser();
    expect(parser.feed('id: 4\n\n')).toEqual([]);
    expect(parser.lastEventId).toBe('4');
    expect(parser.feed('data: x\n\n')).toEqual([{ event: 'message', id: '4', data: 'x' }]);
  });

  it('ignores one leading BOM and keeps a pending \\r across empty chunks', () => {
    expect(new SSEParser().feed('﻿data: a\n\n')).toEqual([{ event: 'message', id: '', data: 'a' }]);
    // If the empty chunk wrongly ended the line at the \r, the \n would become a blank line and split the event.
    expect(feedAll(new SSEParser(), ['data: a\r', '', '\ndata: b\n\n'])).toEqual([{ event: 'message', id: '', data: 'a\nb' }]);
  });

  it('treats a final \\r as a line break at the end of the stream', () => {
    const parser = new SSEParser();
    expect(parser.feed('data: x\r\r')).toEqual([]); // the second \r might still be half of \r\n
    expect(parser.end()).toEqual([{ event: 'message', id: '', data: 'x' }]);
  });

  it('applies retry at once and does not dispatch a block without data', () => {
    const parser = new SSEParser();
    expect(parser.feed(': stream open\nretry: 2000\n\n')).toEqual([]);
    expect(parser.reconnectMs).toBe(2000);
    expect(parser.feed('retry: soon\n\n')).toEqual([]);
    expect(parser.reconnectMs).toBe(2000); // not a number: ignored
  });
});

describe('readSSE', () => {
  it('decodes multi-byte characters split across network chunks', async () => {
    const bytes = new TextEncoder().encode('data: {"text":"café ✓"}\n\n');
    const split = bytes.indexOf(0xc3) + 1; // cut inside the two bytes of "é"
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, split));
        c.enqueue(bytes.slice(split));
        c.close();
      },
    });
    const seen: SSEMessage[] = [];
    for await (const m of readSSE(body)) seen.push(m);
    expect(JSON.parse(seen[0].data).text).toBe('café ✓');
  });
});
