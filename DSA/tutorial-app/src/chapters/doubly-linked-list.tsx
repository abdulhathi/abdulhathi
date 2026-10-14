import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/doubly-linked-list';
import { lruCache } from '../traces/doubly-linked-list';
import { VizFigure } from '../viz/Viz';
import { Walkthrough } from '../viz/Walkthrough';

const lru = lruCache(2, [
  ['put', 5, 50],
  ['put', 7, 70],
  ['get', 5],
  ['put', 9, 90],
  ['get', 7],
  ['put', 5, 55],
  ['put', 3, 30],
  ['get', 9],
  ['get', 5],
  ['get', 3],
]);

export default function DoublyLinkedList() {
  return (
    <>
      <TopicIntro
        id="doubly-linked-list"
        time="2–3 hours, plus problems"
        before={['linked-list', 'hash-table']}
        learn={[
          'Why a prev pointer turns "remove this node" from O(n) into O(1)',
          'Sentinel nodes, and the four pointer changes behind every insert and delete',
          'The map-plus-list design behind LRU, LFU and similar caches',
          'Cursors that move both ways, and lists built over array indices',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          In a singly linked list, each node knows only the node after it. To remove a node you must change its predecessor's next
          pointer, and the only way to find the predecessor is to walk from the head: <Cost>O(n)</Cost>. A <b>doubly linked list</b>{' '}
          gives every node a second pointer, <b>prev</b>, to the node before it. Now a node you are holding can be removed on the
          spot: tell its previous node to point past it, tell its next node to point back past it, done. <Cost>O(1)</Cost>.
        </p>
        <p>
          Think of people standing in a queue, each holding the shoulder of the person in front <i>and</i> the person behind. If
          someone leaves, their two neighbours simply take each other's shoulders. Nobody else moves, and nobody had to search the
          line to find the neighbours.
        </p>
        <p>
          On its own, a doubly linked list is rarely the whole answer. Its power appears when you combine it with a hash map that
          jumps straight to any node. Then you can find a node in O(1) <i>and</i> move or remove it in O(1), which is exactly what a
          cache needs.
        </p>
      </div>

      <VizFigure
        parts={[
          { kind: 'list', label: 'before: remove B', items: ['H', 'A', 'B', 'C', 'T'], doubly: true, tones: { 0: 'dim', 2: 'bad', 4: 'dim' } },
          { kind: 'list', label: 'after: A and C point at each other', items: ['H', 'A', 'C', 'T'], doubly: true, tones: { 0: 'dim', 1: 'match', 2: 'match', 3: 'dim' } },
        ]}
        caption="Unlinking B changes two pointers: A's next becomes C, and C's prev becomes A. The sentinels H and T mean A and C always exist, even when B is the first or last real node."
      />

      <Box kind="key" label="Key idea">
        <p>
          If a design question demands O(1) for "find by key" <i>and</i> "move or remove from an ordering", combine a hash map (key →
          node) with a doubly linked list (the ordering). The map gives you the node; the prev and next pointers let you unlink it
          without searching.
        </p>
      </Box>

      <div className="prose">
        <h2>When to use it</h2>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
      </div>
      <Structures
        items={[
          { name: 'Doubly linked node', ts: 'class with key, value, prev and next', ops: 'unlink or insert next to it O(1)', use: 'Anything that must leave the middle of an ordering in O(1).' },
          { name: 'Sentinels', ts: 'two dummy nodes, head and tail, linked to each other', ops: 'O(1)', use: 'Removing every "is this the first or last node?" special case.' },
          { name: 'Hash map of nodes', ts: 'Map<number, Node>', ops: 'O(1) average', use: 'Jumping straight to the node for a key.' },
          { name: 'Index-based list', ts: 'two number arrays, prev and next', ops: 'O(1) per link change', use: 'Merging or deleting neighbours in an array without shifting (Minimum Pair Removal II).' },
          { name: 'Two stacks', ts: 'two arrays used with push and pop', ops: 'O(1) per character moved', use: 'A text cursor or browser history: what lies left of the cursor and what lies right.' },
        ]}
      />

      <TableWrap>
        <thead>
          <tr>
            <th>Operation, given the node</th>
            <th>Singly linked</th>
            <th>Doubly linked</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Insert after it</td>
            <td><Cost>O(1)</Cost></td>
            <td><Cost>O(1)</Cost></td>
          </tr>
          <tr>
            <td>Insert before it</td>
            <td><Cost>O(n)</Cost>: find the predecessor</td>
            <td><Cost>O(1)</Cost></td>
          </tr>
          <tr>
            <td>Remove it</td>
            <td><Cost>O(n)</Cost>: find the predecessor</td>
            <td><Cost>O(1)</Cost></td>
          </tr>
          <tr>
            <td>Remove the last node</td>
            <td><Cost>O(n)</Cost></td>
            <td><Cost>O(1)</Cost> with a tail sentinel</td>
          </tr>
          <tr>
            <td>Walk backwards</td>
            <td>Impossible without reversing</td>
            <td><Cost>O(1)</Cost> per step</td>
          </tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Pattern 1: Sentinels and O(1) unlink</h2>
        <p>
          Every operation on a doubly linked list is one of two moves. <b>Unlink</b> node X: X.prev.next becomes X.next, and X.next.prev
          becomes X.prev. <b>Insert</b> X between A and B: set X's prev to A and its next to B, then point A's next and B's prev at X. Without sentinels, A or
          B might not exist (X is the first or last node), and each move grows special cases. With a head sentinel and a tail sentinel
          that are never removed, every real node always has two neighbours, so these two moves are the entire implementation.
        </p>
      </div>
      <Recipe
        name="Unlink and insert with sentinels"
        when="you implement any structure built on a doubly linked list: caches, deques, editors, ordered buckets."
        steps={[
          'Create head and tail sentinels pointing at each other. The list is empty when head.next is tail.',
          'To unlink X: point X\'s previous node forward to X\'s next node, and X\'s next node back to X\'s previous node.',
          'To insert X after A: set X\'s prev to A and X\'s next to A\'s old next; then point that old next back at X, and A forward at X.',
          'The first real node is head.next and the last is tail.prev, both in O(1).',
        ]}
        why="sentinels guarantee that every real node has a previous and a next node, so the same four pointer changes work in every position."
        time="O(1) per operation"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 2: Map plus list</h2>
        <p>
          An <b>LRU cache</b> keeps the most recently used items and evicts the least recently used one when full. You need to find an
          item by key (a map), know which item is oldest (an ordering), and move an item to "newest" whenever it is used (a fast
          move). The design: a map from key to node, and a doubly linked list with the most recent node right after head and the
          least recent right before tail. Watch a sequence of operations on a cache of capacity 2, including an update of a key that is already cached.
        </p>
      </div>
      <Walkthrough
        title="LRU cache: a map for lookup, a doubly linked list for order"
        frames={lru.frames}
        caption={`Results of the get calls, in order: ${lru.results.filter((r) => r !== null).join(', ')}. The node to evict is always tail.prev.`}
      />
      <div className="prose">
        <p>
          The same shape solves many design problems once you ask what the list should be ordered by. Order by <b>recency</b> and you
          have LRU. Keep one LRU list per use <b>count</b>, plus the smallest count, and you have LFU. Order by <b>expiry</b>, and
          since times only grow, renewing a token just moves it to the back (Design Authentication Manager). Order <b>buckets of keys
          by count</b>, and a ±1 change only ever moves a key to the neighbouring bucket (All O`one). These are expanded in{' '}
          <See id="design" />.
        </p>
      </div>
      <Recipe
        name="Hash map plus doubly linked list"
        when="every operation must be O(1), and items must be found by key and also moved or removed within an ordering."
        steps={[
          'Decide what the list is ordered by (recency, expiry, count) and which end is "oldest".',
          'Keep a map from key to node; store the key inside the node too.',
          'On access: find the node through the map, unlink it, and reinsert it at the "newest" end.',
          'On eviction: take the node at the "oldest" end, unlink it, and delete its key from the map.',
        ]}
        why="the map removes the search, and the doubly linked list removes the shifting; both remaining steps are constant time."
        time="O(1) per operation"
        space="O(number of items)"
      />

      <div className="prose">
        <h2>Pattern 3: Moving both ways</h2>
        <p>
          A browser's back and forward buttons, an undo history, and a text cursor all keep a <b>current position</b> that steps
          backwards and forwards. A doubly linked list with a current node does this directly. Often two stacks are simpler: the items
          left of the cursor in one, the items right of it in the other, and moving the cursor pops from one and pushes onto the
          other. Flatten a Multilevel Doubly Linked List uses the both-ways links differently: a child list is spliced between a node
          and its next, which needs the child list's tail, found by a depth-first walk.
        </p>

        <h2>Pattern 4: Removing neighbours</h2>
        <p>
          When elements of an array repeatedly merge with or vanish next to their neighbours, shifting the array costs{' '}
          <Cost>O(n)</Cost> per change. Instead, keep two arrays, prev[i] and next[i], that link each surviving position to its current
          neighbours. Removing position j means linking its two neighbours to each other: the position before j now points forward
          to the one after j, and that one points back to the position before j. It is a doubly linked list over indices. Minimum Pair Removal to Sort Array II combines this with a heap of pair sums and lazy deletion, and you will see the
          same trick in problems that delete elements by value order.
        </p>

        <h2>Worked example: LRU Cache</h2>
        <p>Design a cache of fixed capacity with get and put in O(1), evicting the least recently used key when full.</p>
        <Step n={1}>Brute force first</Step>
        <p>
          Keep an array of (key, value) pairs in usage order. get searches the array (<Cost>O(n)</Cost>), moves the pair to the end
          (<Cost>O(n)</Cost> shift), and put evicts from the front (<Cost>O(n)</Cost> shift). Correct, but every operation is linear.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          Two separate costs: searching for the key, and shifting elements to keep the order. A map removes the search. The shifting
          disappears if the order is kept by pointers instead of by positions.
        </p>
        <Step n={3}>Prove a rule</Step>
        <p>
          With a map from key to node, the node is found in O(1). To move it to the front, it must be unlinked from the middle of the
          list. A singly linked list cannot do that without finding the predecessor, but a doubly linked list can, using the node's
          own prev pointer. Sentinels make the front (head.next) and the least recent node (tail.prev) available in O(1).
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          Each operation is one map lookup plus at most two unlinks and one insert: <Cost>O(1)</Cost>. Updating an existing key must
          also move it to the front. Evicting needs the evicted node's key to delete the map entry, so store the key in the node.
          Capacity 1 works without special cases thanks to the sentinels.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Updating only one direction: every link change needs both next and prev set, or backwards walks go wrong.</>,
          <>Forgetting to store the key in the node, so eviction cannot remove the matching map entry.</>,
          <>Not moving a key to the front when put updates an existing value.</>,
          <>Leaving empty frequency lists or count buckets in place, so the minimum or maximum points at nothing.</>,
          <>Writing first-node and last-node special cases instead of using sentinels. One missed case is enough to fail.</>,
          <>Using shift and splice on arrays inside loops when the problem asks for O(1) operations.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'In the list H ⇄ A ⇄ B ⇄ C ⇄ T, list every pointer that changes when B is removed, and every pointer that changes when D is inserted between A and C afterwards.',
            solution: 'Removing B: A\'s next becomes C, and C\'s prev becomes A. Inserting D: D\'s prev becomes A and its next C; then A\'s next and C\'s prev both become D.',
          },
          {
            task: 'An LRU cache of capacity 2 receives put(1), put(2), get(1), put(3). Which key is evicted, and what is the order afterwards?',
            solution: 'After get(1) the order is 1 (newest), 2 (oldest). put(3) evicts 2. The order is 3, 1.',
          },
          {
            task: 'Why does Design Authentication Manager not need sorting to find expired tokens?',
            solution: 'Times only increase and every token lives the same length of time, so the most recently touched token always expires last. Keeping tokens in touch order keeps them in expiry order, and expired ones are always at the front.',
          },
          {
            task: 'In an index-based list with prev = [−1, 0, 1, 2] and next = [1, 2, 3, −1], position 2 is removed. What are the new values?',
            solution: 'next[1] becomes 3 and prev[3] becomes 1. Position 2 is no longer reachable.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'Why does an LRU cache use a doubly linked list rather than a singly linked one?',
            options: ['It uses less memory', 'It can unlink a node found through the map without searching for its predecessor', 'It keeps the keys sorted', 'It makes the map faster'],
            answer: 1,
            why: 'The map returns the node itself. Only a prev pointer lets you remove that node in O(1).',
          },
          {
            q: 'What do sentinel nodes buy you?',
            options: ['Faster lookups by key', 'Every real node always has a previous and a next node, so there are no special cases', 'Automatic sorting', 'Less memory'],
            answer: 1,
            why: 'With head and tail sentinels, inserting at the front, removing the last node and every other position use the same pointer changes.',
          },
          {
            q: 'In LFU Cache, a key with count 3 is used. The list for count 3 becomes empty and minCount was 3. What happens to minCount?',
            options: ['It stays 3', 'It becomes 4', 'It becomes 1', 'It must be recomputed by scanning'],
            answer: 1,
            why: 'The key moved to count 4, and no key has count 3 any more, so the smallest count present is now 4.',
          },
          {
            q: 'A text editor with a cursor supports add, delete-left and move. Which simple structure gives O(k) per operation?',
            options: ['One string, sliced on every call', 'Two stacks: text left of the cursor and text right of it', 'A hash map of positions', 'A heap'],
            answer: 1,
            why: 'Every operation touches only characters next to the cursor, which are the tops of the two stacks.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          These are mostly design problems. Before coding, write the fields of your class and, for each operation, the exact pointer
          changes it makes. LeetCode has only a handful of problems with this tag, and every good one is here.
        </p>
      </div>
      <ProblemSet id="doubly-linked-list" />

      <Recap>
        <ul>
          <li>A prev pointer lets you insert before or remove a node you hold in O(1).</li>
          <li>Sentinel head and tail nodes remove every edge case: unlink and insert are always four pointer changes or fewer.</li>
          <li>Hash map plus doubly linked list gives O(1) lookup and O(1) reordering: LRU, LFU, expiry lists, count buckets.</li>
          <li>Cursors that move both ways are a current node, or two stacks.</li>
          <li>prev and next arrays turn an array into a list over indices, so neighbours can merge or vanish in O(1).</li>
        </ul>
      </Recap>
    </>
  );
}
