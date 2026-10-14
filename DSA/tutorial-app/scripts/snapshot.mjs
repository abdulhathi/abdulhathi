// Refresh src/data/leetcode.json from LeetCode's public GraphQL API:
// every problem's number, slug, title, difficulty, premium flag and topic tags.
// Usage: npm run snapshot   (about 45 requests, one per second)
import { writeFileSync } from 'node:fs';

const QUERY = `query list($skip: Int, $limit: Int) {
  questionList(categorySlug: "", skip: $skip, limit: $limit, filters: {}) {
    totalNum
    data { questionFrontendId title titleSlug difficulty isPaidOnly topicTags { name } }
  }
}`;

async function page(skip) {
  const res = await fetch('https://leetcode.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Referer: 'https://leetcode.com/problemset/', 'User-Agent': 'Mozilla/5.0' },
    body: JSON.stringify({ query: QUERY, variables: { skip, limit: 100 } }),
  });
  if (!res.ok) throw new Error(`LeetCode answered ${res.status}`);
  return (await res.json()).data.questionList;
}

const first = await page(0);
const all = [...first.data];
for (let skip = 100; skip < first.totalNum; skip += 100) {
  await new Promise((r) => setTimeout(r, 1000));
  all.push(...(await page(skip)).data);
  process.stdout.write(`\r${all.length}/${first.totalNum}`);
}

const byId = new Map(all.map((q) => [Number(q.questionFrontendId), q]));
const tags = [...new Set(all.flatMap((q) => q.topicTags.map((t) => t.name)))].sort();
const index = new Map(tags.map((t, i) => [t, i]));
const D = { Easy: 0, Medium: 1, Hard: 2 };
const problems = {};
for (const [id, q] of [...byId].sort((a, b) => a[0] - b[0])) {
  problems[id] = [q.titleSlug, q.title, D[q.difficulty], q.isPaidOnly ? 1 : 0, q.topicTags.map((t) => index.get(t.name))];
}
const date = new Date().toISOString().slice(0, 10);
writeFileSync(new URL('../src/data/leetcode.json', import.meta.url), JSON.stringify({ date, total: byId.size, tags, problems }));
console.log(`\nSaved ${byId.size} problems and ${tags.length} tags (${date}).`);
