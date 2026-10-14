// Walkthrough frames for chapter 35 (Tries), produced by running each algorithm for real.
import type { Frame, GraphViz, Tone } from '../viz/types';

type TNode = { id: string; ch: string; children: Map<string, TNode>; end: boolean };

const GAP_X = 50;
const GAP_Y = 62;

class Trie {
  root: TNode = { id: 'n0', ch: '·', children: new Map(), end: false };
  private next = 1;

  /** Insert a word; report which nodes were already there and which were created. */
  insert(word: string): { path: string[]; created: string[] } {
    let node = this.root;
    const path: string[] = [];
    const created: string[] = [];
    for (const ch of word) {
      let child = node.children.get(ch);
      if (!child) {
        child = { id: `n${this.next++}`, ch, children: new Map(), end: false };
        node.children.set(ch, child);
        created.push(child.id);
      }
      path.push(child.id);
      node = child;
    }
    node.end = true;
    return { path, created };
  }

  /** Walk a prefix from the root. `found` is false if some character has no child. */
  walk(prefix: string): { path: string[]; found: boolean; last: TNode | null } {
    let node = this.root;
    const path: string[] = [];
    for (const ch of prefix) {
      const child = node.children.get(ch);
      if (!child) return { path, found: false, last: null };
      path.push(child.id);
      node = child;
    }
    return { path, found: true, last: node };
  }

  /** Draw the trie: leaves get consecutive columns, a parent sits above the middle of its children. */
  draw(label: string, tones: Partial<Record<string, Tone>> = {}): GraphViz {
    const nodes: GraphViz['nodes'] = [];
    const edges: GraphViz['edges'] = [];
    const notes: Partial<Record<string, string>> = {};
    let leaf = 0;
    const place = (n: TNode, depth: number): number => {
      const kids = [...n.children.values()].sort((a, b) => (a.ch < b.ch ? -1 : 1));
      let x: number;
      if (kids.length === 0) x = leaf++ * GAP_X;
      else {
        const xs = kids.map((k) => place(k, depth + 1));
        x = (xs[0] + xs[xs.length - 1]) / 2;
        for (const k of kids) edges.push({ from: n.id, to: k.id, tone: tones[k.id] && tones[k.id] !== 'dim' ? tones[k.id] : undefined });
      }
      nodes.push({ id: n.id, x, y: depth * GAP_Y, label: n.ch });
      if (n.end) notes[n.id] = 'end';
      return x;
    };
    place(this.root, 0);
    return { kind: 'graph', label, directed: true, nodes, edges, tones, notes };
  }
}

/** Build a trie word by word, then answer search and prefix questions on it. */
export function trieBuildAndSearch(words: string[], queries: { kind: 'search' | 'prefix'; text: string }[]) {
  const trie = new Trie();
  const frames: Frame[] = [];
  const answers: boolean[] = [];
  frames.push({
    note: 'An empty trie is just a root node. Each edge below it will stand for one character.',
    parts: [trie.draw('trie')],
  });
  for (const word of words) {
    const { path, created } = trie.insert(word);
    const tones: Partial<Record<string, Tone>> = {};
    for (const id of path) tones[id] = created.includes(id) ? 'warn' : 'active';
    tones[path[path.length - 1]] = 'match';
    const shared = path.length - created.length;
    frames.push({
      note:
        created.length === 0
          ? `Insert "${word}": every character is already on a path, so no node is created. Just mark the last node as the end of a word.`
          : shared > 0
            ? `Insert "${word}": the first ${shared} character${shared > 1 ? 's are' : ' is'} already there (a shared prefix), so only ${created.length} new node${created.length > 1 ? 's are' : ' is'} created. The last node is marked as the end of a word.`
            : `Insert "${word}": nothing shares its first character yet, so a new branch of ${created.length} nodes grows from the root.`,
      parts: [trie.draw('trie', tones), { kind: 'vars', items: [['inserted', word]] }],
    });
  }
  for (const q of queries) {
    const { path, found, last } = trie.walk(q.text);
    const tones: Partial<Record<string, Tone>> = {};
    for (const id of path) tones[id] = 'active';
    let answer: boolean;
    let note: string;
    if (!found) {
      answer = false;
      note = `${q.kind === 'search' ? 'Search for' : 'Any word starting with'} "${q.text}"? After "${q.text.slice(0, path.length)}" there is no edge for "${q.text[path.length]}", so the answer is no. The walk stopped after ${path.length} step${path.length === 1 ? '' : 's'}, no matter how many words are stored.`;
    } else if (q.kind === 'prefix') {
      answer = true;
      if (path.length) tones[path[path.length - 1]] = 'match';
      note = `Any word starting with "${q.text}"? The whole walk succeeds, so yes: every word below this node starts with "${q.text}".`;
    } else {
      answer = last!.end;
      if (path.length) tones[path[path.length - 1]] = answer ? 'match' : 'bad';
      note = answer
        ? `Search for "${q.text}": the walk succeeds and the last node is marked "end", so "${q.text}" was inserted.`
        : `Search for "${q.text}": the walk succeeds, but the last node is not marked "end". "${q.text}" is only a prefix of other words, so the answer is no.`;
    }
    answers.push(answer);
    frames.push({ note, parts: [trie.draw('trie', tones), { kind: 'vars', items: [[q.kind === 'search' ? 'search' : 'starts with', q.text], ['answer', answer ? 'yes' : 'no']], tones: { 1: answer ? 'match' : 'bad' } }] });
  }
  return { frames, answers };
}

/** Maximum XOR of two numbers with a binary trie: walk towards the opposite bit whenever it exists. */
export function maxXor(nums: number[], bits: number) {
  const trie = new Trie();
  const frames: Frame[] = [];
  const bin = (x: number) => x.toString(2).padStart(bits, '0');
  let best = 0;
  let bestPair: [number, number] | null = null;
  const insert = (x: number) => trie.insert(bin(x));

  const first = insert(nums[0]);
  frames.push({
    note: `Write each number in ${bits} bits, highest bit first, and store it as a path in a trie of 0s and 1s. Insert ${nums[0]} = ${bin(nums[0])}.`,
    parts: [trie.draw('binary trie', Object.fromEntries(first.path.map((id) => [id, 'warn' as Tone]))), { kind: 'vars', items: [['best', best]] }],
  });

  for (const x of nums.slice(1)) {
    // Query: at each bit, prefer the child with the opposite bit.
    let node = trie.root;
    const tones: Partial<Record<string, Tone>> = {};
    let partner = '';
    let xor = 0;
    const steps: string[] = [];
    for (const b of bin(x)) {
      const want = b === '0' ? '1' : '0';
      const go = node.children.get(want) ?? node.children.get(b)!;
      const gotWanted = go.ch === want;
      tones[go.id] = gotWanted ? 'match' : 'warn';
      partner += go.ch;
      xor = xor * 2 + (gotWanted ? 1 : 0);
      steps.push(gotWanted ? '1' : '0');
      node = go;
    }
    const p = parseInt(partner, 2);
    const improved = xor > best;
    if (improved) {
      best = xor;
      bestPair = [p, x];
    }
    frames.push({
      note: `Query ${x} = ${bin(x)}. At each level take the opposite bit if that branch exists (green), otherwise the same bit (amber). The path spells ${partner} = ${p}, so ${x} XOR ${p} = ${xor}.${improved ? ' A new best.' : ''}`,
      parts: [trie.draw('binary trie', tones), { kind: 'vars', items: [['x', `${x} = ${bin(x)}`], ['partner', `${p} = ${partner}`], ['x XOR partner', xor], ['best', best]], tones: improved ? { 3: 'match' } : {} }],
    });
    const ins = insert(x);
    frames.push({
      note: `Now insert ${x} = ${bin(x)} so later numbers can pair with it.`,
      parts: [trie.draw('binary trie', Object.fromEntries(ins.path.map((id) => [id, ins.created.includes(id) ? ('warn' as Tone) : ('active' as Tone)]))), { kind: 'vars', items: [['best', best]] }],
    });
  }
  frames.push({
    note: `Every number has been queried against all the numbers before it. The maximum XOR is ${best}${bestPair ? ` (${bestPair[0]} XOR ${bestPair[1]})` : ''}. Each query took ${bits} steps, whatever the number of values.`,
    parts: [trie.draw('binary trie'), { kind: 'vars', items: [['best', best]], tones: { 0: 'match' } }],
  });
  return { frames, best };
}
