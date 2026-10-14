import type { Job, JobQueue } from './job-queue.ts';

/** Resolves with the job's duration when it finishes, or rejects with its error. */
export function waitForJob(queue: JobQueue, id: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const onDone = (job: Job, ms: number) => {
      if (job.id !== id) return;
      cleanup();
      resolve(ms);
    };
    const onFailed = (job: Job, error: Error) => {
      if (job.id !== id) return;
      cleanup();
      reject(error);
    };
    // Remove both listeners whichever way it ends, or every call would leak two.
    const cleanup = () => {
      queue.off('done', onDone);
      queue.off('failed', onFailed);
    };
    queue.on('done', onDone);
    queue.on('failed', onFailed);
  });
}
