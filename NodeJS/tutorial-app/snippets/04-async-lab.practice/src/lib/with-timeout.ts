/**
 * Runs a cancellable task with a deadline. Passing the signal in means the task
 * really stops, instead of carrying on in the background after we give up.
 */
export function withTimeout<T>(task: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  return task(AbortSignal.timeout(ms));
}
