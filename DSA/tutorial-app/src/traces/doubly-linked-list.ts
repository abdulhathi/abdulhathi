// Walkthrough frames for the doubly linked lists chapter, produced by running a real LRU cache.
import type { Cell, Frame, Tone } from '../viz/types';

type Node = { key: number; value: number; prev: Node | null; next: Node | null };

export type CacheOp = ['put', number, number] | ['get', number];

/** An LRU cache: a map from key to node, and a doubly linked list ordered from most to least recently used. */
export function lruCache(capacity: number, ops: CacheOp[]): { frames: Frame[]; results: (number | null)[] } {
  const head: Node = { key: -1, value: -1, prev: null, next: null };
  const tail: Node = { key: -1, value: -1, prev: head, next: null };
  head.next = tail;
  const map = new Map<number, Node>();
  const results: (number | null)[] = [];
  const frames: Frame[] = [];

  const unlink = (n: Node) => {
    n.prev!.next = n.next;
    n.next!.prev = n.prev;
  };
  const pushFront = (n: Node) => {
    n.prev = head;
    n.next = head.next;
    head.next!.prev = n;
    head.next = n;
  };
  const view = (note: string, hot: { key: number; tone: Tone } | null, gone?: string): Frame => {
    const items: Cell[] = ['H'];
    for (let n = head.next; n && n !== tail; n = n.next) items.push(`${n.key}:${n.value}`);
    items.push('T');
    const at = hot ? items.indexOf(`${hot.key}:${map.get(hot.key)?.value}`) : -1;
    const keys = [...map.keys()];
    return {
      note,
      parts: [
        {
          kind: 'list',
          label: 'most recent ⇄ least recent (H and T are sentinels)',
          items,
          doubly: true,
          tones: { 0: 'dim', [items.length - 1]: 'dim', ...(at > 0 ? { [at]: hot!.tone } : {}) },
        },
        {
          kind: 'map',
          label: 'map',
          keyTitle: 'key',
          valueTitle: 'node',
          entries: keys.map((k) => [k, `→ ${k}:${map.get(k)!.value}`] as [Cell, Cell]),
          tones: hot && map.has(hot.key) ? { [keys.indexOf(hot.key)]: hot.tone } : {},
        },
        { kind: 'vars', items: [['capacity', capacity], ['size', map.size], ...(gone ? [['evicted', gone] as [string, Cell]] : [])] },
      ],
    };
  };

  frames.push(view('Two sentinel nodes, H and T, mark the ends, so every real node always has a prev and a next. The map finds a node by key in O(1); the list keeps the usage order.', null));
  for (const op of ops) {
    if (op[0] === 'get') {
      const key = op[1];
      const n = map.get(key);
      if (!n) {
        results.push(-1);
        frames.push(view(`get(${key}): not in the map, return −1. Nothing moves.`, null));
        continue;
      }
      unlink(n);
      pushFront(n);
      results.push(n.value);
      frames.push(view(`get(${key}) = ${n.value}. Unlink the node (its neighbours now point at each other) and reinsert it right after H: it is now the most recent.`, { key, tone: 'match' }));
    } else {
      const [, key, value] = op;
      results.push(null);
      const existing = map.get(key);
      if (existing) {
        existing.value = value;
        unlink(existing);
        pushFront(existing);
        frames.push(view(`put(${key}, ${value}): the key exists. Update its value and move it to the front.`, { key, tone: 'active' }));
        continue;
      }
      let gone: string | undefined;
      if (map.size === capacity) {
        const lru = tail.prev!;
        unlink(lru);
        map.delete(lru.key);
        gone = `${lru.key}:${lru.value}`;
      }
      const n: Node = { key, value, prev: null, next: null };
      pushFront(n);
      map.set(key, n);
      frames.push(
        view(
          gone
            ? `put(${key}, ${value}): the cache is full. The least recent node sits just before T, so evict ${gone} in O(1), then insert ${key}:${value} after H.`
            : `put(${key}, ${value}): a new key. Create a node, insert it right after H, and record it in the map.`,
          { key, tone: 'active' },
          gone,
        ),
      );
    }
  }
  frames.push(view('Every operation touched only a constant number of pointers and one map entry: O(1) each.', null));
  return { frames, results };
}
