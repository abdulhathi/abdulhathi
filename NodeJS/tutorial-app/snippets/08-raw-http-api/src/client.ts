// A client for the bookmarks API, using the fetch() that is built into Node.
const base = process.env.API_URL ?? 'http://localhost:3000';

async function call(method: string, path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(new URL(path, base), {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? null : JSON.stringify(body),
  });
  // fetch only rejects on network failures. A 404 or 500 is a normal response, so check status yourself.
  const text = await response.text();
  const data: unknown = text ? JSON.parse(text) : undefined;
  console.log(`${method} ${path} -> ${response.status} ${response.statusText}`);
  return data;
}

const created = (await call('POST', '/bookmarks', {
  url: 'https://nodejs.org/api/stream.html',
  title: 'Node.js stream docs',
  tags: ['node', 'streams'],
})) as { id: string };
await call('POST', '/bookmarks', { url: 'https://expressjs.com', title: 'Express', tags: ['web'] });

const tagged = (await call('GET', '/bookmarks?tag=node')) as unknown[];
console.log(`  tagged "node": ${tagged.length}`);

await call('GET', `/bookmarks/${created.id}`);
await call('DELETE', `/bookmarks/${created.id}`);
await call('GET', `/bookmarks/${created.id}`);
console.log(`  ${JSON.stringify(await call('POST', '/bookmarks', { title: '' }))}`);

try {
  await fetch('http://localhost:3999'); // nothing listens on this port
} catch (error) {
  const cause = (error as Error).cause as NodeJS.ErrnoException;
  console.log(`network failure: ${(error as Error).message} (${cause.code})`);
}
