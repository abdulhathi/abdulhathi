import { EventEmitter } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';

export type Job = {
  id: string;
  name: string;
  steps: number;
  failAt?: number; // simulate a failure at this step
  failTimes?: number; // ...but only on the first N attempts
  retries?: number; // how many times to retry after a failure
};

export type JobEvents = {
  added: [job: Job];
  start: [job: Job];
  progress: [job: Job, percent: number];
  retry: [job: Job, attempt: number, error: Error];
  done: [job: Job, ms: number];
  failed: [job: Job, error: Error];
  idle: [];
};

export class JobQueue extends EventEmitter<JobEvents> {
  #pending: Job[] = [];
  #running = false;

  add(job: Job): void {
    this.#pending.push(job);
    this.emit('added', job); // synchronous: only listeners attached before add() see it
    if (this.#running) return;
    this.#running = true;
    process.nextTick(() => void this.#runAll());
  }

  async #runAll(): Promise<void> {
    let job: Job | undefined;
    while ((job = this.#pending.shift())) {
      await this.#run(job);
    }
    this.#running = false;
    this.emit('idle');
  }

  async #run(job: Job): Promise<void> {
    const started = performance.now();
    this.emit('start', job);
    const attempts = 1 + (job.retries ?? 0);
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await this.#attempt(job, attempt);
        this.emit('done', job, Math.round(performance.now() - started));
        return;
      } catch (caught) {
        const error = caught instanceof Error ? caught : new Error(String(caught));
        if (attempt === attempts) {
          this.emit('failed', job, error);
          return;
        }
        this.emit('retry', job, attempt + 1, error);
      }
    }
  }

  async #attempt(job: Job, attempt: number): Promise<void> {
    for (let step = 1; step <= job.steps; step++) {
      await sleep(50);
      const shouldFail = step === job.failAt && attempt <= (job.failTimes ?? Infinity);
      if (shouldFail) throw new Error(`step ${step} of ${job.steps} failed`);
      this.emit('progress', job, Math.round((step / job.steps) * 100));
    }
  }
}
