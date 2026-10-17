// Starts, stops and checks the apps. Safety rules:
//   - only commands from src/apps.ts are ever run (nothing comes from the request);
//   - the hub stops only processes it started itself, recorded by PID in .hub/pids.json,
//     and only after checking that the PID still runs the same command (PIDs get reused);
//   - an app started some other way shows as running, but the hub leaves it alone.
import { execFile, spawn } from 'node:child_process';
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { HubApp } from '../src/apps';

const run = promisify(execFile);

export type AppStatus = {
  id: string;
  up: boolean; // something answers on the app's port
  managed: boolean; // the hub started it and the process is alive
  pid?: number;
  startedAt?: number;
  setup?: string; // a missing prerequisite, as the command that fixes it
};

export type Result = { ok: boolean; message: string };

type Started = { pid: number; startedAt: number; hint: string };

function canConnect(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((done) => {
    const socket = createConnection({ host, port });
    const finish = (ok: boolean) => {
      socket.destroy();
      done(ok);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

/** Vite binds "localhost", which is ::1 on macOS, while uvicorn and dotnet use 127.0.0.1, so try both. */
export async function isPortOpen(port: number, timeoutMs = 500): Promise<boolean> {
  const results = await Promise.all(['127.0.0.1', '::1'].map((host) => canConnect(host, port, timeoutMs)));
  return results.some(Boolean);
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function commandOf(pid: number): Promise<string> {
  try {
    return (await run('ps', ['-o', 'command=', '-p', String(pid)])).stdout.trim();
  } catch {
    return '';
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class ProcessManager {
  private readonly pidFile: string;
  private readonly logDir: string;

  constructor(
    private readonly apps: HubApp[],
    private readonly portfolio: string,
    stateDir: string,
  ) {
    this.pidFile = join(stateDir, 'pids.json');
    this.logDir = join(stateDir, 'logs');
  }

  private load(): Record<string, Started> {
    try {
      const all = JSON.parse(readFileSync(this.pidFile, 'utf8')) as Record<string, Started>;
      // Forget processes that have exited since the last look.
      return Object.fromEntries(Object.entries(all).filter(([, s]) => isAlive(s.pid)));
    } catch {
      return {};
    }
  }

  private save(state: Record<string, Started>) {
    mkdirSync(this.logDir, { recursive: true });
    writeFileSync(this.pidFile, JSON.stringify(state, null, 2));
  }

  private app(id: string) {
    return this.apps.find((a) => a.id === id);
  }

  private dirOf(app: HubApp) {
    return join(this.portfolio, app.dir);
  }

  private setupNeeded(app: HubApp) {
    return app.needs && !existsSync(join(this.dirOf(app), app.needs.path)) ? app.needs.fix : undefined;
  }

  logPath(id: string) {
    return join(this.logDir, `${id}.log`);
  }

  async status(): Promise<AppStatus[]> {
    const state = this.load();
    return Promise.all(
      this.apps.map(async (app) => {
        const started = state[app.id];
        return {
          id: app.id,
          up: await isPortOpen(app.port),
          managed: Boolean(started),
          pid: started?.pid,
          startedAt: started?.startedAt,
          setup: this.setupNeeded(app),
        };
      }),
    );
  }

  async start(id: string, chain: string[] = []): Promise<Result> {
    const app = this.app(id);
    if (!app) return { ok: false, message: `Unknown app "${id}".` };
    if (chain.includes(id)) return { ok: false, message: `Circular requirement: ${[...chain, id].join(' → ')}` };

    for (const dep of app.requires ?? []) {
      const r = await this.start(dep, [...chain, id]);
      if (!r.ok) return { ok: false, message: `${app.name} needs ${this.app(dep)?.name ?? dep}: ${r.message}` };
    }
    if (await isPortOpen(app.port)) return { ok: true, message: `${app.name} is already running.` };
    if (this.load()[id]) return { ok: true, message: `${app.name} is starting.` };

    const cwd = this.dirOf(app);
    if (!existsSync(cwd)) return { ok: false, message: `Folder not found: ${app.dir}` };
    const setup = this.setupNeeded(app);
    if (setup) return { ok: false, message: `${app.name} is not set up yet. Run: ${setup}` };

    mkdirSync(this.logDir, { recursive: true });
    const log = this.logPath(id);
    appendFileSync(log, `\n--- ${new Date().toISOString()} starting: ${app.command.join(' ')}\n`);
    const fd = openSync(log, 'a');
    const [cmd, ...args] = app.command;
    // Output goes to a file, not a pipe, so the app keeps running if the hub restarts.
    const child = spawn(cmd.includes('/') ? resolve(cwd, cmd) : cmd, args, {
      cwd,
      detached: true, // its own process group, so stop() can end the app and its helpers together
      stdio: ['ignore', fd, fd],
      env: { ...process.env, BROWSER: 'none', NO_COLOR: '1', FORCE_COLOR: '0' },
    });
    closeSync(fd);
    const outcome = await new Promise<number | Error>((done) => {
      child.once('spawn', () => done(child.pid ?? new Error('no PID')));
      child.once('error', (e) => done(e));
    });
    if (outcome instanceof Error) {
      appendFileSync(log, `Could not start: ${outcome.message}\n`);
      return { ok: false, message: `Could not start ${app.name}: ${outcome.message}` };
    }
    child.unref();
    this.save({ ...this.load(), [id]: { pid: outcome, startedAt: Date.now(), hint: args.join(' ') } });
    return { ok: true, message: `Starting ${app.name} on port ${app.port}.` };
  }

  async stop(id: string): Promise<Result> {
    const app = this.app(id);
    if (!app) return { ok: false, message: `Unknown app "${id}".` };
    const state = this.load();
    const started = state[id];
    if (!started) {
      return (await isPortOpen(app.port))
        ? { ok: false, message: `${app.name} was not started by the hub, so the hub leaves it running.` }
        : { ok: true, message: `${app.name} is not running.` };
    }
    // The PID may have been reused by an unrelated program: only stop it if it still runs our command.
    if (!(await commandOf(started.pid)).includes(started.hint)) {
      delete state[id];
      this.save(state);
      return { ok: true, message: `${app.name} had already exited.` };
    }
    const signal = (sig: NodeJS.Signals) => {
      try {
        process.kill(-started.pid, sig); // the whole process group the hub created
      } catch {
        try {
          process.kill(started.pid, sig);
        } catch {
          /* already gone */
        }
      }
    };
    signal('SIGTERM');
    for (let waited = 0; waited < 5000 && isAlive(started.pid); waited += 100) await sleep(100);
    if (isAlive(started.pid)) signal('SIGKILL');
    delete state[id];
    this.save(state);
    appendFileSync(this.logPath(id), `--- ${new Date().toISOString()} stopped by the hub\n`);
    return { ok: true, message: `Stopped ${app.name}.` };
  }

  async startAll(): Promise<Result> {
    const results = [];
    for (const app of this.apps.filter((a) => !a.archived)) results.push(await this.start(app.id));
    const failed = results.filter((r) => !r.ok);
    return failed.length
      ? { ok: false, message: failed.map((r) => r.message).join('\n') }
      : { ok: true, message: 'Every app is running or starting.' };
  }

  async stopAll(): Promise<Result> {
    const ids = Object.keys(this.load());
    for (const id of ids) await this.stop(id);
    return { ok: true, message: ids.length ? `Stopped ${ids.length} app(s) the hub started.` : 'The hub has not started any apps.' };
  }

  logs(id: string, lines = 150): string {
    try {
      return readFileSync(this.logPath(id), 'utf8').split('\n').slice(-lines).join('\n');
    } catch {
      return '';
    }
  }
}
