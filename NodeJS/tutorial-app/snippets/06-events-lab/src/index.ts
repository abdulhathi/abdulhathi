import { once } from 'node:events';
import { JobQueue } from './job-queue.ts';

const queue = new JobQueue();

queue.add({ id: '1', name: 'resize-avatar', steps: 2 });
queue.add({ id: '2', name: 'send-invoice', steps: 3, failAt: 2 });
queue.add({ id: '3', name: 'backup-db', steps: 4 });

// Listeners attached after add() still catch everything: the queue starts on the next tick.
queue.on('start', (job) => console.log(`start    ${job.name}`));
queue.on('progress', (job, percent) => console.log(`progress ${job.name} ${percent}%`));
queue.on('done', (job, ms) => console.log(`done     ${job.name} in ${ms} ms`));
queue.on('failed', (job, error) => console.log(`failed   ${job.name}: ${error.message}`));

// A second, independent listener: the queue does not know or care that it exists.
const totals = { done: 0, failed: 0 };
queue.on('done', () => totals.done++);
queue.on('failed', () => totals.failed++);

await once(queue, 'idle');
console.log(`idle: ${totals.done} done, ${totals.failed} failed`);
