import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors.ts';

type ErrorBody = { error: { code: string; message: string; details?: unknown } };

/** Runs when no route matched. */
export const notFound: RequestHandler = (req, res) => {
  const body: ErrorBody = { error: { code: 'not_found', message: `No route for ${req.method} ${req.path}` } };
  res.status(404).json(body);
};

// Errors from express.json() carry a status and say whether their message is safe to show.
const isHttpError = (err: unknown): err is { status: number; type?: string; message: string } =>
  err instanceof Error && 'status' in err && typeof err.status === 'number' && 'expose' in err && err.expose === true;

/**
 * The one place errors become responses. Express recognises error middleware
 * by its four parameters, so _next must stay even though it is unused.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let status = 500;
  let body: ErrorBody;

  if (err instanceof ZodError) {
    status = 400;
    const details = err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
    body = { error: { code: 'validation_failed', message: 'The request is not valid', details } };
  } else if (err instanceof AppError) {
    status = err.status;
    body = { error: { code: err.code, message: err.message } };
  } else if (isHttpError(err)) {
    status = err.status;
    body = { error: { code: err.type ?? 'bad_request', message: err.message } };
  } else {
    // A bug or an outage: log everything, tell the client nothing internal.
    console.error(err);
    body = { error: { code: 'internal_error', message: 'Something went wrong' } };
  }

  res.status(status).json(body);
};
