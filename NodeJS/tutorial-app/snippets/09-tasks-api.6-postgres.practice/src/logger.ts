import { pino, type DestinationStream, type Logger } from 'pino';
import { currentRequestId } from './request-context.ts';

export type { Logger };

/**
 * One JSON object per line, on stdout. Tests pass their own destination to
 * read what was logged.
 */
export function createLogger(level: string, destination?: DestinationStream): Logger {
  return pino(
    {
      level,
      base: { service: 'tasks-api' },
      timestamp: pino.stdTimeFunctions.isoTime,
      // Never write secrets to logs, even by accident.
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', 'password', '*.password', '*.token'],
        censor: '[redacted]',
      },
      // Runs for every line: inside a request, add its id.
      mixin() {
        const requestId = currentRequestId();
        return requestId ? { requestId } : {};
      },
    },
    destination,
  );
}
