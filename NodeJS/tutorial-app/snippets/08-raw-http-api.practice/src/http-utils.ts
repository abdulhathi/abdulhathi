import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpError } from './http-error.ts';

const MAX_BODY_BYTES = 10 * 1024; // a bookmark never needs more than 10 KiB

export function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json), // bytes, not characters
    ...headers,
  });
  res.end(json);
}

/** Reads the request body as JSON. Refuses the wrong type, oversized bodies and invalid JSON. */
export async function readJson(req: IncomingMessage): Promise<unknown> {
  const type = req.headers['content-type'] ?? '';
  if (!type.startsWith('application/json')) {
    throw new HttpError(415, 'Content-Type must be application/json');
  }
  // Reject early when the client announces a size that is too big...
  if (Number(req.headers['content-length'] ?? 0) > MAX_BODY_BYTES) {
    throw new HttpError(413, `Body must be at most ${MAX_BODY_BYTES} bytes`);
  }
  // ...and keep counting, because the header is optional and can lie.
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, `Body must be at most ${MAX_BODY_BYTES} bytes`);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Body is not valid JSON');
  }
}
