import { setTimeout as sleep } from 'node:timers/promises';

type Page = { page: number; items: string[]; hasMore: boolean };

// Pretend API: three pages of results, 100 ms each.
async function fetchPage(page: number): Promise<Page> {
  await sleep(100);
  const items = [1, 2, 3].map((i) => `item ${(page - 1) * 3 + i}`);
  return { page, items, hasMore: page < 3 };
}

// An async generator: `async function*` can await, and yield values one at a time.
async function* allItems(): AsyncGenerator<string> {
  let page = 1;
  try {
    while (true) {
      const result = await fetchPage(page);
      console.log(`  (fetched page ${result.page})`);
      yield* result.items;
      if (!result.hasMore) return;
      page += 1;
    }
  } finally {
    console.log('  (generator cleaned up)'); // runs on completion, error or break
  }
}

// for await pulls one value at a time; pages are fetched only when needed.
for await (const item of allItems()) {
  console.log(item);
}

console.log('--- stop early: only the pages you need are fetched');
for await (const item of allItems()) {
  console.log(item);
  if (item === 'item 4') break;
}
