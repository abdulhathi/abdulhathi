import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/iterator';
import { bstIterator, flattenNested } from '../traces/iterator';
import { Walkthrough } from '../viz/Walkthrough';

const bst = bstIterator([8, 3, 10, 1, 6, null, 14, null, null, 4, 7]);
const nested = flattenNested([[5, [2]], 9, [], [[3]]]);

export default function Iterator() {
  return (
    <>
      <TopicIntro
        id="iterator"
        time="2 hours, plus problems"
        before={['stack', 'queue', 'bst', 'design']}
        learn={[
          'What an iterator is (next and hasNext) and why it should be lazy',
          'Look-ahead buffers for peek',
          'Turning a recursive traversal into an explicit stack that pauses between calls',
          'Cursors over compressed or nested data, round-robin queues, and generating the next item from the current one',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          A bookmark does not copy the book; it remembers where you are. An <b>iterator</b> is a bookmark for a data structure:
          next() returns the next item and moves on, hasNext() says whether anything is left. The point is to produce items{' '}
          <b>lazily</b>, one at a time, without building the whole output first.
        </p>
        <p>
          The easy way to write any iterator is to flatten everything into an array at the start. That costs{' '}
          <Cost>O(n)</Cost> time and memory before the first item, and it is useless for huge or endless sources. A good iterator
          keeps only the state needed to find the next item: an index, a buffer, or a stack of pending work. Each call is{' '}
          <Cost>O(1)</Cost>, or <Cost>O(1)</Cost> amortised.
        </p>
      </div>

      <Walkthrough
        title="BST iterator: an explicit stack instead of recursion"
        frames={bst.frames}
        caption={`Values come out in sorted order: ${bst.output.join(', ')}. Blue nodes are on the stack, grey nodes are already returned.`}
      />

      <Box kind="key" label="Key idea">
        <p>
          A recursive traversal keeps its "where was I?" on the call stack, and cannot stop halfway to hand you one item. Put that
          same information in a stack you own, and the traversal can pause after every item. The stack holds exactly the work that
          is still pending, no more.
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
          { name: 'Buffer', ts: 'one variable plus a boolean "has value"', ops: 'O(1)', use: 'Peeking: read one item ahead.' },
          { name: 'Stack', ts: 'T[] with push and pop', ops: 'O(1)', use: 'Pending work in tree and nested-list traversals.' },
          { name: 'Queue', ts: 'array with a head index', ops: 'O(1)', use: 'Round-robin between several sources.' },
          { name: 'Indices and counters', ts: 'number', ops: 'O(1)', use: 'Cursors: row and column, current run and how much of it is left.' },
        ]}
      />
      <div className="prose">
        <p>
          TypeScript itself has <b>generator functions</b>, which pause at each yield and resume on the next call: the language
          keeps the state for you. LeetCode's iterator problems ask you to write that pausing by hand, which is exactly the skill
          this chapter trains.
        </p>

        <h2>Pattern 1: Look-ahead buffer</h2>
        <p>
          If the source cannot show you an item without consuming it, read one item early and keep it. peek returns the buffered
          item; next returns it and refills the buffer. Keep a separate flag for "the buffer is empty", because any value, even 0
          or null, might be a real item.
        </p>

        <h2>Pattern 2: Explicit stack for lazy traversal</h2>
      </div>
      <Recipe
        name="Pausable in-order traversal"
        when="you must return a tree's (or nested structure's) items one at a time, in a depth-first order."
        steps={[
          'On construction, push the root and keep going left, pushing each node.',
          'next: pop the top node; that is the answer.',
          'Before returning, push the popped node\'s right child and its whole left spine.',
          'hasNext: the stack is not empty.',
        ]}
        why="the stack always holds the ancestors whose left subtree is finished but who have not been returned, which is what recursion would hold at that moment."
        time="O(1) amortised per call"
        space="O(h)"
      />
      <Walkthrough
        title="Flatten a nested list lazily"
        frames={nested.frames}
        caption={`Output: ${nested.output.join(', ')}. The empty list was skipped inside hasNext, so next always has an integer ready.`}
      />

      <div className="prose">
        <h2>Pattern 3: Cursor over a structure</h2>
        <p>
          For a list of lists, keep (row, column). For run-length encoded data, keep the current run and how much of it is left.
          Before answering, <b>advance</b> the cursor past anything finished or empty, in a loop. Never expand compressed input: a
          run of 10⁹ copies must be skipped in one subtraction.
        </p>

        <h2>Pattern 4: Round-robin and generated sequences</h2>
        <p>
          To alternate between several sources, keep a queue of the ones that still have items: take from the front and put it
          back at the end if it is not finished. And when the items follow a rule, compute the next one from the current one: the
          next combination in dictionary order comes from moving the rightmost index that still has room.
        </p>
      </div>

      <TableWrap>
        <thead>
          <tr>
            <th>Approach</th>
            <th>Before the first item</th>
            <th>Per call</th>
            <th>Memory</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Flatten everything first (eager)</td><td>O(n)</td><td>O(1)</td><td>O(n)</td></tr>
          <tr><td>Explicit stack (lazy)</td><td>O(h)</td><td>O(1) amortised</td><td>O(h) for trees, O(depth) with (list, index) pairs</td></tr>
          <tr><td>Cursor with indices</td><td>O(1)</td><td>O(1) amortised</td><td>O(1)</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Worked example: flatten a nested list</h2>
        <p>
          <b>Flatten Nested List Iterator</b> must return all integers of a nested list in order.
        </p>
        <Step n={1}>Brute force first</Step>
        <p>
          Recursively copy every integer into an array, then hand them out with an index. Correct, but eager:{' '}
          <Cost>O(n)</Cost> work and memory up front.
        </p>
        <Step n={2}>Find the pending work</Step>
        <p>
          At any moment, what is left is "the rest of this list, then the rest of its parent list, …". Put those items on a stack
          with the next one on top (push lists in reverse).
        </p>
        <Step n={3}>Decide where the work happens</Step>
        <p>
          Unpack lists in <b>hasNext</b>, not next: while the top is a list, replace it with its items. Then hasNext can truthfully
          answer "is there another integer?" even when the remaining items are only empty lists, such as [[], [[]]].
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          Each list is unpacked once and each integer popped once: <Cost>O(1)</Cost> amortised per call. next simply calls hasNext
          first, then pops.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Flattening everything in the constructor when the problem (or the interviewer) expects a lazy iterator.</>,
          <>Using a sentinel value for "no buffered item" that could be a real value; use a boolean.</>,
          <>Unpacking nested lists in next instead of hasNext, which makes hasNext wrong when only empty lists remain.</>,
          <>Advancing a cursor with a single if when several empty rows or zero-count runs can follow each other.</>,
          <>Expanding run-length data (counts up to 10⁹) into real arrays.</>,
          <>Using shift on an array as a queue; it is O(n) per call.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'For the BST [5, 2, 8, 1, 3], what is on the stack right after construction, and after the first next()?',
            solution: 'After construction: 5, 2, 1 (1 on top). The first next() returns 1; 1 has no right child, so the stack is 5, 2.',
          },
          {
            task: 'Run the lazy flattening on [[1, [2]], [], 3]. List the stack after each hasNext step until 2 is returned.',
            solution: 'Start: [1,[2]] on top of [], 3. Unpack: 1 on top of [2], [], 3. Return 1. Top [2] is a list: unpack to 2. Return 2.',
          },
          {
            task: 'An RLE iterator holds [3, 7, 2, 4]. Calls: next(2), next(2), next(5). What do they return?',
            solution: 'next(2) → 7 (one 7 left). next(2) uses the last 7 and one 4 → 4. next(5): only one 4 remains → −1.',
          },
          {
            task: 'Letters "abcd", k = 2. What comes after the combination "ad"?',
            solution: 'Indices (0, 3). The rightmost index 3 cannot move; index 0 can: move it to 1 and reset the next to 2. Answer "bc".',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'What does the BST iterator\'s stack hold?',
            options: ['All nodes', 'Nodes whose left subtree is done but that have not been returned yet', 'Only leaves', 'The returned values'],
            answer: 1,
            why: 'That is exactly the pending part of an in-order traversal, at most the height of the tree.',
          },
          {
            q: 'Why is a single next() of the BST iterator O(1) amortised, although it can push h nodes?',
            options: ['Because h is small', 'Every node is pushed and popped exactly once over all calls', 'Because of caching', 'It is not'],
            answer: 1,
            why: 'n calls do O(n) work in total, so the average per call is O(1).',
          },
          {
            q: 'How do you add peek to an iterator that only has next and hasNext?',
            options: ['Call next and then undo it', 'Keep a one-item look-ahead buffer', 'Copy everything to an array', 'Use recursion'],
            answer: 1,
            why: 'Read ahead once and keep the value; peek reads the buffer, next returns and refills it.',
          },
          {
            q: 'Where should the nested-list iterator unpack lists?',
            options: ['In the constructor, all at once', 'In hasNext, until an integer is on top', 'In next only', 'Nowhere'],
            answer: 1,
            why: 'hasNext must know whether an integer exists; only empty lists might remain.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          These pair well with <See id="design" />: an iterator is a small data structure whose only operations are next and
          hasNext.
        </p>
      </div>
      <ProblemSet id="iterator" />

      <Recap>
        <ul>
          <li>An iterator remembers where it is and produces items lazily: small state, O(1) or amortised O(1) per call.</li>
          <li>peek needs a one-item buffer plus an "is empty" flag.</li>
          <li>Recursive traversals become pausable with an explicit stack of pending work.</li>
          <li>Cursors (indices and counters) walk compressed or 2D data without expanding it; advance past empties in a loop.</li>
          <li>Round-robin uses a queue of active sources; ordered sequences can compute "next from current".</li>
        </ul>
      </Recap>
    </>
  );
}
