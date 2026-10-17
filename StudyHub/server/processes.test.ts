// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { HubApp } from '../src/apps';
import { isAlive, isPortOpen, ProcessManager } from './processes';

const root = mkdtempSync(join(tmpdir(), 'study-hub-test-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const listen = (host = '127.0.0.1') =>
  new Promise<Server>((done) => {
    const server = createServer();
    server.listen(0, host, () => done(server));
  });
const portOf = (s: Server) => (s.address() as { port: number }).port;
const freePort = async () => {
  const s = await listen();
  const port = portOf(s);
  await new Promise((r) => s.close(r));
  return port;
};
async function waitFor(check: () => Promise<boolean> | boolean, ms = 8000) {
  for (let t = 0; t < ms; t += 100) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

describe('isPortOpen', () => {
  it('sees a listener on IPv4 and on IPv6, and nothing after it closes', async () => {
    for (const host of ['127.0.0.1', '::1']) {
      const server = await listen(host);
      const port = portOf(server);
      expect(await isPortOpen(port)).toBe(true);
      await new Promise((r) => server.close(r));
      expect(await isPortOpen(port)).toBe(false);
    }
  });
});

describe('ProcessManager', () => {
  // A tiny "app": an HTTP server on the port given after --port.
  writeFileSync(
    join(root, 'app.mjs'),
    "import { createServer } from 'node:http';\n" +
      "const port = Number(process.argv[process.argv.indexOf('--port') + 1]);\n" +
      "createServer((_, res) => res.end('ok')).listen(port, '127.0.0.1', () => console.log('listening on', port));\n",
  );
  const make = (port: number, extra: Partial<HubApp> = {}): HubApp => ({
    id: 'fake',
    name: 'Fake app',
    group: 'Demos and APIs',
    description: '',
    port,
    dir: '.',
    command: [process.execPath, 'app.mjs', '--port', String(port)],
    pages: { type: 'static', pages: [] },
    ...extra,
  });

  it('starts an app, reports it, shows its output, and stops it and its process group', async () => {
    const port = await freePort();
    const pm = new ProcessManager([make(port)], root, join(root, 'state1'));
    const started = await pm.start('fake');
    expect(started.ok).toBe(true);
    expect(await waitFor(() => isPortOpen(port))).toBe(true);
    const [status] = await pm.status();
    expect(status).toMatchObject({ id: 'fake', up: true, managed: true });
    expect(await waitFor(() => pm.logs('fake').includes(`listening on ${port}`))).toBe(true);

    expect((await pm.start('fake')).message).toMatch(/already running/);
    const stopped = await pm.stop('fake');
    expect(stopped).toEqual({ ok: true, message: 'Stopped Fake app.' });
    expect(isAlive(status.pid!)).toBe(false);
    expect(await isPortOpen(port)).toBe(false);
    expect((await pm.status())[0]).toMatchObject({ up: false, managed: false });
  });

  it('leaves alone an app it did not start', async () => {
    const outside = await listen();
    const pm = new ProcessManager([make(portOf(outside))], root, join(root, 'state2'));
    expect(await pm.stop('fake')).toMatchObject({ ok: false, message: expect.stringMatching(/not started by the hub/) });
    expect(await isPortOpen(portOf(outside))).toBe(true);
    await new Promise((r) => outside.close(r));
  });

  it('refuses to start an app that is not set up, and says how to set it up', async () => {
    const pm = new ProcessManager(
      [make(await freePort(), { needs: { path: 'node_modules', fix: 'npm install' } })],
      root,
      join(root, 'state3'),
    );
    expect(await pm.start('fake')).toEqual({ ok: false, message: 'Fake app is not set up yet. Run: npm install' });
    expect((await pm.status())[0].setup).toBe('npm install');
  });

  it('reports a command that does not exist instead of throwing', async () => {
    const pm = new ProcessManager([make(await freePort(), { command: ['no-such-command-xyz'] })], root, join(root, 'state4'));
    const result = await pm.start('fake');
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Could not start Fake app/);
    expect(pm.logs('fake')).toMatch(/Could not start/);
  });

  it('starts required apps first and rejects unknown ids', async () => {
    const [a, b] = [await freePort(), await freePort()];
    const api = { ...make(a), id: 'api', name: 'API' };
    const web = { ...make(b), id: 'web', name: 'Web', requires: ['api'] };
    const pm = new ProcessManager([api, web], root, join(root, 'state5'));
    expect((await pm.start('web')).ok).toBe(true);
    expect(await waitFor(async () => (await isPortOpen(a)) && (await isPortOpen(b)))).toBe(true);
    expect((await pm.stopAll()).message).toBe('Stopped 2 app(s) the hub started.');
    expect(await isPortOpen(a)).toBe(false);
    expect(await pm.start('nope')).toEqual({ ok: false, message: 'Unknown app "nope".' });
  });
});
