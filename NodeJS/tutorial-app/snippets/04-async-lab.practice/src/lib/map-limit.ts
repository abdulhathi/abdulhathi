/**
 * Calls fn for every item, with at most `limit` calls running at once.
 * Results come back in input order, like Promise.all.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  // Each worker takes the next unclaimed index until none are left. Reading and
  // incrementing `next` happen with no await in between, so two workers can never
  // claim the same item: JavaScript only switches tasks at an await.
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!, index);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
