import { EventEmitter, once } from 'node:events';
import os from 'node:os';
import { Worker } from 'node:worker_threads';

/** What a pool worker posts back for each task. */
export type Reply<R> = { ok: true; value: R } | { ok: false; message: string };

type Job<T, R> = { task: T; resolve: (value: R) => void; reject: (error: Error) => void };

/**
 * A fixed number of worker threads sharing one queue of tasks.
 * Each worker runs one task at a time; extra tasks wait in the queue.
 */
export class WorkerPool<T, R> {
  #file: URL;
  #idle: Worker[] = [];
  #busy = new Map<Worker, Job<T, R>>();
  #queue: Job<T, R>[] = [];
  #closing = false;
  #events = new EventEmitter();

  // Leave one core for the main thread, which still handles every request.
  constructor(file: URL, size = Math.max(1, os.availableParallelism() - 1)) {
    this.#file = file;
    for (let i = 0; i < size; i++) this.#spawn();
  }

  get size() {
    return this.#idle.length + this.#busy.size;
  }

  get running() {
    return this.#busy.size;
  }

  get queued() {
    return this.#queue.length;
  }

  run(task: T): Promise<R> {
    if (this.#closing) return Promise.reject(new Error('The pool is closing'));
    return new Promise((resolve, reject) => {
      this.#queue.push({ task, resolve, reject });
      this.#dispatch();
    });
  }

  /** Stops accepting tasks, lets queued and running tasks finish, then stops every worker. */
  async close(): Promise<void> {
    this.#closing = true;
    while (this.#queue.length > 0 || this.#busy.size > 0) await once(this.#events, 'idle');
    await Promise.all(this.#idle.map((worker) => worker.terminate()));
  }

  #spawn() {
    const worker = new Worker(this.#file);

    worker.on('message', (reply: Reply<R>) => {
      const job = this.#busy.get(worker);
      this.#busy.delete(worker);
      if (reply.ok) job?.resolve(reply.value);
      else job?.reject(new Error(reply.message));
      this.#idle.push(worker);
      this.#dispatch();
    });

    // The worker crashed (an uncaught exception, not a task error it reported).
    worker.on('error', (error) => {
      this.#busy.get(worker)?.reject(error);
      this.#busy.delete(worker);
    });

    // A dead thread never comes back: replace it, unless we are shutting down.
    worker.on('exit', () => {
      this.#busy.get(worker)?.reject(new Error('Worker exited during a task'));
      this.#busy.delete(worker);
      this.#idle = this.#idle.filter((w) => w !== worker);
      if (!this.#closing) this.#spawn();
      this.#dispatch();
    });

    this.#idle.push(worker);
  }

  #dispatch() {
    for (;;) {
      const worker = this.#idle.at(-1);
      const job = this.#queue[0];
      if (!worker || !job) break;
      this.#idle.pop();
      this.#queue.shift();
      this.#busy.set(worker, job);
      worker.postMessage(job.task);
    }
    if (this.#queue.length === 0 && this.#busy.size === 0) this.#events.emit('idle');
  }
}
