import { z } from 'zod';

// Every setting the app reads from the environment, with its type and default.
// Environment variables are always strings, so numbers are coerced.
const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DB_FILE: z.string().min(1).default('data/tasks.db'), // used when DATABASE_URL is not set
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/, error: 'Use a postgres:// URL' }).optional(),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // No default: a server must never run with a guessable signing key.
  JWT_SECRET: z.string().min(32, 'Use at least 32 random characters'),
  TOKEN_TTL: z.string().regex(/^\d+[smhd]$/, 'Use a duration such as 15m, 1h or 7d').default('1h'),
});

export type Config = {
  env: 'development' | 'test' | 'production';
  port: number;
  dbFile: string;
  databaseUrl: string | undefined;
  dbPoolMax: number;
  logLevel: z.infer<typeof Env>['LOG_LEVEL'];
  jwtSecret: string;
  tokenTtl: string;
};

/** Validates an environment. Throws a readable error listing every problem. */
export function parseConfig(env: Record<string, string | undefined>): Config {
  const result = Env.safeParse(env);
  if (!result.success) throw new Error(`Invalid configuration:\n${z.prettifyError(result.error)}`);
  const e = result.data;
  return {
    env: e.NODE_ENV,
    port: e.PORT,
    dbFile: e.DB_FILE,
    databaseUrl: e.DATABASE_URL,
    dbPoolMax: e.DB_POOL_MAX,
    logLevel: e.LOG_LEVEL,
    jwtSecret: e.JWT_SECRET,
    tokenTtl: e.TOKEN_TTL,
  };
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
