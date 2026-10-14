import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/design';
import { lruCache, randomizedSet } from '../traces/design';
import { Walkthrough } from '../viz/Walkthrough';

const lru = lruCache(3, [['put', 1, 10], ['put', 2, 20], ['put', 3, 30], ['get', 1], ['put', 4, 40], ['get', 2], ['get', 3], ['put', 3, 33]]);
const rset = randomizedSet([['insert', 5], ['insert', 8], ['insert', 2], ['insert', 8], ['remove', 5], ['insert', 7], ['remove', 7]]);

export default function Design() {
  return (
    <>
      <TopicIntro
        id="design"
        time="4–5 hours, plus problems"
        before={['hash-table', 'doubly-linked-list', 'heap', 'binary-search']}
        learn={[
          'A method for any "design a class" problem: operations, required costs, then structures',
          'The classic combinations: map + linked list (LRU, LFU), array + map (random access), stacks with bookkeeping',
          'Version history with binary search, heaps with lazy deletion, and running aggregates',
          'Amortised cost: why a queue made of two stacks is O(1) per operation on average',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          A carpenter does not have one perfect tool; they pick two or three that together do the job. Design problems work the
          same way. Every data structure is fast at some operations and slow at others: an array finds the i-th item instantly
          but deletes from the middle slowly; a linked list deletes instantly but cannot find anything; a hash map finds by key
          but has no order. A design problem lists several operations and a cost for each, and the answer is a{' '}
          <b>combination</b> of structures where every operation is cheap in at least one of them, and the structures stay in
          sync.
        </p>
        <p>
          The naive approach is usually one structure that is slow at something: a list scanned for the minimum, an array
          shifted on every delete. That is <Cost>O(n)</Cost> per call, and with 2 × 10⁵ calls it is too slow. The goal is{' '}
          <Cost>O(1)</Cost> or <Cost>O(log n)</Cost> per call.
        </p>
      </div>

      <Walkthrough
        title="LRU cache with capacity 3: map + doubly linked list"
        frames={lru.frames}
        caption="The map finds a key's node directly; the list keeps the order of use. Both are updated together on every call."
      />

      <Box kind="key" label="Key idea">
        <p>
          Write down every operation and the cost it must meet. For each operation, name the structure that does it fastest.
          Then make those structures point at the same items (a map whose values are list nodes, a map from value to array
          index) so that updating one never requires a search in another.
        </p>
      </Box>

      <div className="prose">
        <h2>When to use it</h2>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
        <p>Your toolbox. Most designs combine two or three of these.</p>
      </div>
      <Structures
        items={[
          { name: 'Hash map', ts: 'Map<K, V>', ops: 'find, insert, delete by key O(1) average', use: 'Locating anything by key; pointing at nodes or indices in another structure.' },
          { name: 'Doubly linked list', ts: 'nodes { key, val, prev, next } with dummy head and tail', ops: 'remove or move a known node O(1)', use: 'Keeping an order that changes: recency, frequency buckets.' },
          { name: 'Dynamic array', ts: 'T[] with push and pop', ops: 'index O(1); push and pop at the end O(1)', use: 'Random access and random picks; stacks.' },
          { name: 'Deque / ring buffer', ts: 'array with head index and count', ops: 'add and remove at both ends O(1)', use: 'Queues, sliding windows, snake bodies.' },
          { name: 'Heap', ts: 'array-based binary heap (write one; none is built in)', ops: 'push and pop O(log n); peek O(1)', use: 'Best item of a changing group; k-way merges.' },
          { name: 'Ordered set or map', ts: 'none built in: sorted array + binary search, or a balanced tree', ops: 'insert, delete, next above or below O(log n)', use: 'Sorted views that change.' },
          { name: 'Trie', ts: 'nodes with Map children', ops: 'O(length) per word or path', use: 'Paths, prefixes, autocomplete.' },
        ]}
      />

      <div className="prose">
        <h2>The design method</h2>
      </div>
      <Recipe
        name="Designing a data structure"
        when="a problem says 'design', 'implement the class' or lists several operations with required costs."
        steps={[
          'List every operation and its required cost. Note the limits: number of calls, key ranges, capacity.',
          'For each operation, write the structure that makes it cheapest (find by key: map; order: list or heap; random pick: array).',
          'Combine them so they share items: map values are list nodes or array indices.',
          'Walk through each operation and make sure every structure is updated (insert, move, delete in all of them).',
          'Test the edge cases on paper: empty, full, a single item, duplicates, removing the last element.',
        ]}
        why="each operation is then served by a structure that is good at it, and the links between structures turn every lookup into a direct jump."
        time="whatever each operation needs, usually O(1) or O(log n)"
        space="O(n)"
      />
      <TableWrap>
        <thead>
          <tr>
            <th>Need</th>
            <th>Combination</th>
            <th>Example</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Find by key + evict oldest</td><td>Map + doubly linked list</td><td>LRU Cache</td></tr>
          <tr><td>Find by key + evict least frequent</td><td>Map + list per frequency + minFreq</td><td>LFU Cache</td></tr>
          <tr><td>Insert, delete, random pick</td><td>Array + map value → index</td><td>Insert Delete GetRandom O(1)</td></tr>
          <tr><td>Min or max of a stack</td><td>Stack of (value, min so far)</td><td>Min Stack</td></tr>
          <tr><td>Value at a past time</td><td>Map key → sorted history + binary search</td><td>Time Based Key-Value Store, Snapshot Array</td></tr>
          <tr><td>Best item per group, with updates</td><td>Heap per group with lazy deletion</td><td>Design a Food Rating System</td></tr>
          <tr><td>Counts that change by ±1, min and max key</td><td>Linked list of count buckets + map</td><td>All O`one Data Structure</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Pattern 1: Stacks and queues with bookkeeping</h2>
        <p>
          Small additions keep simple structures fast. A min stack stores, next to each value, the minimum of everything below
          it. A stack with "add to the bottom k" stores the increment once and pushes it down lazily on pop. A queue made of two
          stacks pours one into the other only when the output stack is empty.
        </p>
        <h3>Amortised cost</h3>
        <p>
          A single pop from the two-stack queue can move n elements, which sounds like <Cost>O(n)</Cost>. But every element is
          pushed once, poured once and popped once, so n operations do at most 3n steps in total: <Cost>O(1)</Cost> each{' '}
          <b>amortised</b> (averaged over a sequence of operations). Problems that say "amortised O(1)" are asking for exactly
          this kind of argument.
        </p>

        <h2>Pattern 2: Hash map plus linked list</h2>
        <p>
          A linked list can move or delete a node in <Cost>O(1)</Cost>, but only if you already have the node. A map from key to
          node gives you the node. Together they keep an order that changes with every access, which is exactly what caches
          need. Use sentinel (dummy) head and tail nodes so inserting and removing never need special cases.
        </p>

        <h2>Pattern 3: Array plus hash map</h2>
        <p>
          A uniformly random element needs an array (pick a random index). Deleting from the middle of an array is slow, unless
          order does not matter: then copy the last element into the gap and pop. A map from value to index tells you where the
          gap is and must be updated for the moved element.
        </p>
      </div>
      <Walkthrough
        title="Insert, delete and getRandom in O(1)"
        frames={rset.frames}
        caption="The swap with the last element is what keeps deletion O(1). The map must learn the moved value's new index."
      />

      <div className="prose">
        <h2>Pattern 4: History per key with binary search</h2>
        <p>
          When values change over time and queries ask about the past, never copy everything at each snapshot. Append (time,
          value) to the key's history instead. Times only increase, so each history is sorted for free, and "the value as of time
          t" is a binary search for the last entry at or before t (<See id="binary-search" />).
        </p>

        <h2>Pattern 5: Heaps and sorted views</h2>
        <p>
          A heap gives the best item quickly but cannot change an entry in the middle. <b>Lazy deletion</b> solves this: when an
          item changes, push a new entry and leave the old one in place. When you read the top, discard entries that no longer
          match the item's current state. Each entry is pushed and popped once, so the cost stays <Cost>O(log n)</Cost> amortised.
          For merging several sorted lists (like a news feed), push the head of each list and pop the best k times
          (<See id="heap" />).
        </p>

        <h2>Pattern 6: Records and aggregates</h2>
        <p>
          Store only what the queries ask for. If a query wants an average, keep a running sum and count per key, not every
          value. If a record is opened and closed (check-in, check-out), keep only the open records.
        </p>

        <h2>Pattern 7: Trees inside a design</h2>
        <p>
          Paths and hierarchies are trees: a trie keyed by path parts answers "does the parent exist?" by walking down. To store a
          tree as text, write it in preorder with a marker for every missing child; reading the tokens back in the same order
          rebuilds it exactly.
        </p>

        <h3>JavaScript notes</h3>
        <ul>
          <li><b>Map and Set keep insertion order.</b> Deleting and re-inserting a key moves it to the end, and the first key is the oldest. That gives a quick LRU, and LFU groups.</li>
          <li><b>There is no built-in heap or ordered set.</b> Write a binary heap (about 30 lines), or use the priority queue package LeetCode preinstalls for JavaScript (check its language notes before relying on it in TypeScript).</li>
          <li><b>Array.prototype.shift is O(n).</b> For queues, keep a head index or a ring buffer.</li>
        </ul>
      </div>

      <div className="prose">
        <h2>Worked example: LFU cache</h2>
        <p>
          <b>LFU Cache</b> evicts the least frequently used key, breaking ties by least recent use, with get and put in{' '}
          <Cost>O(1)</Cost>.
        </p>
        <Step n={1}>Brute force first</Step>
        <p>
          Store key → (value, count, last use time) and scan all keys to evict: <Cost>O(capacity)</Cost> per eviction, up to
          10⁴ × 2 × 10⁵ steps. Too slow.
        </p>
        <Step n={2}>List the operations and costs</Step>
        <p>
          Find a key: O(1), so a map. Find the least frequent key: we need the lowest count that exists. Among keys with that
          count, the least recent one: an LRU order per count.
        </p>
        <Step n={3}>Combine the structures</Step>
        <p>
          Map key → (value, count). Map count → an LRU-ordered group of keys (a doubly linked list, or a JavaScript Set). A
          counter minFreq. On every access a key moves from group f to group f + 1, at the end (most recent). Counts only change
          by one, so if group f empties and f was minFreq, the new minimum is f + 1. A brand-new key has count 1, so minFreq
          becomes 1.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          Every step is a map lookup or an O(1) list change: <Cost>O(1)</Cost>. Updating an existing key's value also counts as a
          use. Evict before inserting a new key, and only when the cache is full.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Updating one structure and forgetting the other (deleting from the list but not the map, or the reverse).</>,
          <>Losing a node's neighbours: in a doubly linked list, relink prev and next before reusing the node.</>,
          <>In the array + map design, forgetting to update the moved element's index, or mishandling removal of the last element.</>,
          <>Using shift on arrays as a queue: it copies the whole array each time.</>,
          <>A single "current minimum" variable in a min stack; it is wrong as soon as the minimum is popped.</>,
          <>Heaps without lazy deletion when items change; searching a heap for an entry is O(n).</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'An LRU cache of capacity 2 receives put(1), put(2), get(1), put(3). Which key is evicted?',
            solution: 'Key 2. After get(1), the order from most to least recent is 1, 2, so put(3) evicts 2.',
          },
          {
            task: 'A min stack holds (5, 5), (3, 3), (7, 3) from bottom to top. What does getMin return after one pop? After two?',
            solution: 'After one pop the top is (3, 3): minimum 3. After two pops the top is (5, 5): minimum 5.',
          },
          {
            task: 'A two-stack queue gets push 1, push 2, push 3, pop, push 4, pop, pop, pop. Count how many element moves (pours) happen in total.',
            solution: 'The first pop pours 1, 2, 3 (three moves). Later pops use out until it is empty; the last pop pours 4 (one move). Four moves for four elements.',
          },
          {
            task: 'Values [4, 9, 6] are stored with their indices. Remove 4 using the swap trick. Show the array and map afterwards.',
            solution: 'Copy the last value 6 into index 0 and pop: array [6, 9]; map 6 → 0, 9 → 1 (4 deleted).',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'Which pair of structures gives an LRU cache with O(1) get and put?',
            options: ['Array + binary search', 'Hash map + doubly linked list', 'Heap + set', 'Two stacks'],
            answer: 1,
            why: 'The map finds the node; the doubly linked list moves it to the front and removes the tail in O(1).',
          },
          {
            q: 'Why does Insert Delete GetRandom need an array at all?',
            options: ['To keep values sorted', 'To pick a uniformly random element in O(1)', 'To save memory', 'To allow duplicates'],
            answer: 1,
            why: 'A random index into an array is a uniform random pick. Maps and sets cannot do that in O(1).',
          },
          {
            q: 'A queue built from two stacks sometimes moves n elements in one pop. What is its cost per operation?',
            options: ['O(n) worst case, O(1) amortised', 'Always O(n)', 'O(log n)', 'Always O(1)'],
            answer: 0,
            why: 'Each element is moved at most once over its lifetime, so n operations cost O(n) in total.',
          },
          {
            q: 'Set calls arrive with increasing timestamps. How do you answer "value as of time t"?',
            options: ['Scan the whole history', 'Binary search the key\'s history for the last time ≤ t', 'Keep a heap of times', 'Store a copy of everything at every time'],
            answer: 1,
            why: 'Increasing timestamps keep each history sorted, so binary search finds the answer in O(log n).',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          For each design problem, write the operation list and the costs before anything else. Many of these also appear in
          the chapters for their main structure; here the lesson is the combination.
        </p>
      </div>
      <ProblemSet id="design" />

      <Recap>
        <ul>
          <li>List operations and required costs first; pick the fastest structure for each; link them so they share items.</li>
          <li>Map + doubly linked list gives O(1) ordered caches (LRU, and LFU with one list per frequency).</li>
          <li>Array + map value → index gives O(1) insert, delete (swap with last) and random pick.</li>
          <li>Histories with increasing times are sorted for free: answer "as of" queries with binary search.</li>
          <li>Heaps with lazy deletion handle changing items; amortised analysis explains structures like the two-stack queue.</li>
        </ul>
      </Recap>
    </>
  );
}
