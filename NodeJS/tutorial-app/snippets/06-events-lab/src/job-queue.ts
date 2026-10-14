import { EventEmitter } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';

export type Job = {
  id: string;
  name: string;
  steps: number;
  failAt?: number; // simulate a failure at this step
};

// Event name -> the arguments every listener for it receives.
export type JobEvents = {
  start: [job: Job];
  progress: [job: Job, percent: number];
  done: [job: Job, ms: number];
  failed: [job: Job, error: Error];
  idle: [];
};

/** Runs jobs one at a time and reports what happens through events. */
export class JobQueue extends EventEmitter<JobEvents> {
  #pending: Job[] = [];
  #running = false;

  add(job: Job): void {
    this.#pending.push(job);
    if (this.#running) return;
    this.#running = true;
    // Start on the next tick, so code that calls add() and only then
    // attaches listeners still sees the first 'start' event.
    process.nextTick(() => void this.#runAll());
  }

  get size(): number {
    return this.#pending.length;
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
    try {
      for (let step = 1; step <= job.steps; step++) {
        await sleep(50); // pretend to work
        if (step === job.failAt) throw new Error(`step ${step} of ${job.steps} failed`);
        this.emit('progress', job, Math.round((step / job.steps) * 100));
      }
      this.emit('done', job, Math.round(performance.now() - started));
    } catch (error) {
      this.emit('failed', job, error instanceof Error ? error : new Error(String(error)));
    }
  }
}
