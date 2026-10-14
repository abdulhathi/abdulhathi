import { z } from 'zod';

// Every setting the app reads from the environment, with its type and default.
// Environment variables are always strings, so numbers are coerced.
const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DB_FILE: z.string().min(1).default('data/tasks.db'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  BODY_LIMIT: z
    .string()
    .regex(/^\d+(b|kb|mb)$/, 'Use a size such as 500b, 10kb or 1mb')
    .default('10kb'),
});

export type Config = {
  env: 'development' | 'test' | 'production';
  port: number;
  dbFile: string;
  logLevel: z.infer<typeof Env>['LOG_LEVEL'];
  bodyLimit: string;
};

/** Validates an environment. Throws a readable error listing every problem. */
export function parseConfig(env: Record<string, string | undefined>): Config {
  const result = Env.safeParse(env);
  if (!result.success) throw new Error(`Invalid configuration:\n${z.prettifyError(result.error)}`);
  const { NODE_ENV, PORT, DB_FILE, LOG_LEVEL, BODY_LIMIT } = result.data;
  return { env: NODE_ENV, port: PORT, dbFile: DB_FILE, logLevel: LOG_LEVEL, bodyLimit: BODY_LIMIT };
}

/** Reads process.env once at startup. A bad setting stops the process before it serves anything. */
export function loadConfig(): Config {
  try {
    return parseConfig(process.env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
