import { JobQueue } from './job-queue.ts';
import { waitForJob } from './wait-for-job.ts';

const queue = new JobQueue();
queue.on('added', (job) => console.log(`added    ${job.name} (queue start is deferred)`));
queue.on('retry', (job, attempt, error) => console.log(`retry    ${job.name} attempt ${attempt} after: ${error.message}`));
queue.on('done', (job, ms) => console.log(`done     ${job.name} in ${ms} ms`));
queue.on('failed', (job, error) => console.log(`failed   ${job.name}: ${error.message}`));

queue.add({ id: 'a', name: 'flaky-upload', steps: 2, failAt: 1, failTimes: 1, retries: 2 });
queue.add({ id: 'b', name: 'broken-export', steps: 2, failAt: 2, retries: 1 });

const ms = await waitForJob(queue, 'a');
console.log(`waitForJob(a) resolved: ${ms} ms`);
try {
  await waitForJob(queue, 'b');
} catch (error) {
  console.log(`waitForJob(b) rejected: ${(error as Error).message}`);
}
console.log(`done listeners left: ${queue.listenerCount('done')}, failed listeners left: ${queue.listenerCount('failed')}`);
