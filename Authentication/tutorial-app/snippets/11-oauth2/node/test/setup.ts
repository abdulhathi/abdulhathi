import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { GenerateKeyPairResult } from 'jose';
import { createApp } from '../src/app.ts';

export const ISSUER = 'http://localhost:3000';

/** Starts the app on a free port with a clock the test can move forward (and, if given, the server's own keys). */
export async function startApp(keys?: GenerateKeyPairResult) {
  let now = Date.parse('2026-10-17T12:00:00Z');
  const { app } = await createApp({ issuer: ISSUER, now: () => now, keys });
  const server = app.listen(0);
  await once(server, 'listening');
  return {
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    now: () => now,
    advance: (ms: number) => (now += ms),
    close: () => server.close(),
  };
}

export const bearer = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });
