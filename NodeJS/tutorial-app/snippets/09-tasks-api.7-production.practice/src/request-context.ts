import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

type RequestContext = { requestId: string };

// Like a thread-local variable, but for one request's whole chain of
// callbacks and awaits. Each request sees only its own store.
const storage = new AsyncLocalStorage<RequestContext>();

export const currentRequestId = (): string | undefined => storage.getStore()?.requestId;

const SAFE_ID = /^[\w-]{1,64}$/;

/** Gives every request an id, reusing a sane X-Request-Id from a proxy, and returns it to the client. */
export const requestContext: RequestHandler = (req, res, next) => {
  const incoming = req.get('x-request-id');
  const requestId = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('x-request-id', requestId);
  storage.run({ requestId }, next);
};
