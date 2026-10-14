import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors.ts';
import type { Logger } from '../logger.ts';
import { currentRequestId } from '../request-context.ts';

type ErrorBody = { error: { code: string; message: string; details?: unknown; requestId?: string } };

/** Runs when no route matched. */
export const notFound: RequestHandler = (req, res) => {
  const body: ErrorBody = { error: { code: 'not_found', message: `No route for ${req.method} ${req.path}` } };
  res.status(404).json(body);
};

// Errors from express.json() carry a status and say whether their message is safe to show.
const isHttpError = (err: unknown): err is { status: number; type?: string; message: string } =>
  err instanceof Error && 'status' in err && typeof err.status === 'number' && 'expose' in err && err.expose === true;

/**
 * Operational errors (bad input, missing task, conflicts) are expected: answer
 * them. Anything else is a programmer error or an outage: log it in full and
 * give the client only a request id to quote. Keep all four parameters.
 */
export function errorHandler(log: Logger): ErrorRequestHandler {
  return (err, _req, res, next) => {
    if (res.headersSent) return next(err); // too late to send JSON; let Express close the connection

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
      log.error({ err }, 'unhandled error');
      body = { error: { code: 'internal_error', message: 'Something went wrong', requestId: currentRequestId() } };
    }

    res.status(status).json(body);
  };
}
