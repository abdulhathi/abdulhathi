import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.ts';

/** A "browser": keeps cookies and does not follow redirects, so a test can walk the sign-in one hop at a time. */
export class Browser {
  private base: string;
  private jar = new Map<string, string>();
  constructor(base: string) {
    this.base = base;
  }

  async open(url: string, method = 'GET') {
    const cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(new URL(url, this.base), { method, redirect: 'manual', headers: cookie ? { cookie } : {} });
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const eq = pair.indexOf('=');
      this.jar.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
    return res;
  }

  async visit(url: string, method = 'GET') {
    const res = await this.open(url, method);
    return { status: res.status, location: res.headers.get('location') ?? '' };
  }

  /** /login, then the provider's /authorize: returns the callback URL the provider sent the browser to. */
  async startSignIn() {
    const { location: authorize } = await this.visit('/login');
    return (await this.visit(authorize)).location;
  }
}

/** Starts the app (relying party plus mock provider) on a free port. The base URL must be known first. */
export async function startLab() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const { app, idp, signInErrors } = await createApp({ baseUrl: base });
  server.on('request', app);
  const close = () => {
    server.closeAllConnections(); // the client library keeps connections alive; end them so the test exits at once
    server.close();
  };
  return { base, idp, signInErrors, browser: () => new Browser(base), close };
}

export const query = (url: string) => Object.fromEntries(new URL(url).searchParams);
