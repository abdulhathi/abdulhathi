import { readFile } from 'node:fs/promises';

// The parts of a .heapsnapshot file this script reads. Nodes are stored as one flat array
// of numbers, a fixed number of fields per node, described by snapshot.meta.
type HeapSnapshot = {
  snapshot: { meta: { node_fields: string[]; node_types: [string[], ...unknown[]] } };
  nodes: number[];
  strings: string[];
};
type Group = { count: number; bytes: number };

async function summarise(file: string): Promise<Map<string, Group>> {
  const heap = JSON.parse(await readFile(file, 'utf8')) as HeapSnapshot;
  const fields = heap.snapshot.meta.node_fields;
  const typeNames = heap.snapshot.meta.node_types[0];
  const [TYPE, NAME, SIZE] = ['type', 'name', 'self_size'].map((f) => fields.indexOf(f)) as [number, number, number];

  const groups = new Map<string, Group>();
  for (let i = 0; i < heap.nodes.length; i += fields.length) {
    const type = typeNames[heap.nodes[i + TYPE]!] ?? '?';
    // Objects are grouped by constructor name; everything else by its kind, e.g. (string).
    const key = type === 'object' || type === 'closure' ? (heap.strings[heap.nodes[i + NAME]!] ?? '?') : `(${type})`;
    const group = groups.get(key) ?? { count: 0, bytes: 0 };
    group.count++;
    group.bytes += heap.nodes[i + SIZE]!;
    groups.set(key, group);
  }
  return groups;
}

// Usage: node src/heap-diff.ts before.heapsnapshot after.heapsnapshot
const [beforeFile, afterFile] = process.argv.slice(2);
if (!beforeFile || !afterFile) {
  console.error('usage: node src/heap-diff.ts <before.heapsnapshot> <after.heapsnapshot>');
  process.exit(1);
}
const before = await summarise(beforeFile);
const after = await summarise(afterFile);

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);
const growth = [...after].map(([key, a]) => {
  const b = before.get(key) ?? { count: 0, bytes: 0 };
  return { key, count: a.count - b.count, bytes: a.bytes - b.bytes };
});

console.log('   +objects       +MB  what');
for (const g of growth.sort((x, y) => y.bytes - x.bytes).slice(0, 6)) {
  console.log(`${g.count.toLocaleString('en').padStart(11)} ${mb(g.bytes).padStart(9)}  ${g.key}`);
}
