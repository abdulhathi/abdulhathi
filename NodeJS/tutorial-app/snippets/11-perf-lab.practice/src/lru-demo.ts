import { setTimeout as sleep } from 'node:timers/promises';
import { LruCache } from './lru.ts';

const cache = new LruCache<string, number>(2, 100);
cache.set('a', 1);
cache.set('b', 2);
cache.get('a'); // a is now the most recently used
cache.set('c', 3); // over the limit: evicts b, the least recently used
console.log('after eviction:', cache.get('a'), cache.get('b'), cache.get('c'));

await sleep(150);
console.log('after 150 ms:', cache.get('a'), cache.get('c'), `size ${cache.size}`);
