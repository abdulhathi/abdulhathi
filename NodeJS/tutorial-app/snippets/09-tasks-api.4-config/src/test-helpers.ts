import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { Express } from 'express';

export type TestServer = { url: string; close: () => Promise<void> };

/** Starts the app on a free port chosen by the OS (port 0), so tests never clash. */
export async function startServer(app: Express): Promise<TestServer> {
  const server = app.listen(0);
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

/** fetch with JSON in and out. Returns the status, headers and parsed body. */
export async function request(url: string, init: { method?: string; body?: unknown } = {}) {
  const res = await fetch(url, {
    method: init.method ?? 'GET',
    headers: init.body === undefined ? {} : { 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : undefined };
}
