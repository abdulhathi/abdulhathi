import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/heap';
import { heapOps, kthLargest, twoHeapMedian } from '../traces/heap';
import { Walkthrough } from '../viz/Walkthrough';

const ops = heapOps([5, 3, 8, 1, 2], 2);
const topK = kthLargest([7, 4, 9, 1, 6, 3], 2);
const median = twoHeapMedian([5, 15, 1, 3, 8]);

export default function Heap() {
  return (
    <>
      <TopicIntro
        id="heap"
        time="4–5 hours, plus problems"
        before={['array', 'binary-tree', 'sorting']}
        learn={[
          'How a binary heap stores a tree in an array, and how sift up and sift down keep it valid',
          'Why building a heap from n items is O(n), and how to write your own heap in TypeScript',
          'Top K, k-way merge, two heaps for medians, and scheduling with a heap',
          "A first look at Dijkstra's algorithm, which is a heap at heart",
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          In a hospital emergency room, patients are not seen in the order they arrive. The most urgent patient goes next, and
          new patients keep arriving. The waiting room needs two fast operations: <b>add a patient</b>, and <b>take the most
          urgent one</b>. That is a <b>priority queue</b>, and a <b>heap</b> is the standard way to build one.
        </p>
        <p>
          Why not a sorted list? Taking the most urgent is instant, but every new arrival must be slotted into place, which
          costs <Cost>O(n)</Cost>. An unsorted list adds instantly but must scan everything to find the most urgent. A heap does
          both in <Cost>O(log n)</Cost> by keeping only a <i>partial</i> order: every parent is more urgent than its children,
          and nothing else is promised. That is just enough to keep the best item at the top.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Structure</th>
            <th>Add an item</th>
            <th>Look at the best</th>
            <th>Remove the best</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Unsorted array</td><td>O(1)</td><td>O(n)</td><td>O(n)</td></tr>
          <tr><td>Sorted array</td><td>O(n)</td><td>O(1)</td><td>O(1) from the end</td></tr>
          <tr><td>Binary heap</td><td>O(log n)</td><td>O(1)</td><td>O(log n)</td></tr>
          <tr><td>Balanced BST / ordered set</td><td>O(log n)</td><td>O(log n)</td><td>O(log n), and it can also remove any item</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>How a heap works</h2>
        <p>
          A binary heap is a <b>complete</b> binary tree: every level is full except possibly the last, which fills from the
          left. Complete trees fit perfectly in an array with no gaps and no pointers. The node at index i has its children at{' '}
          <b>2i + 1</b> and <b>2i + 2</b>, and its parent at <b>(i − 1) ÷ 2</b>, rounded down. In a <b>min-heap</b> every
          parent is at most its children, so the minimum sits at index 0 (a <b>max-heap</b> flips the comparison).
        </p>
        <p>
          To <b>push</b>, put the new item in the next free slot at the end, then <b>sift up</b>: swap it with its parent while
          it is smaller. To <b>pop</b> the minimum, take index 0, move the last item into its place, then <b>sift down</b>: swap
          it with its smaller child while that child is smaller. Either way the item travels at most the height of the tree,
          which is about log₂ n.
        </p>
      </div>
      <Walkthrough
        title="A min-heap: push 5, 3, 8, 1, 2, then pop twice"
        frames={ops.frames}
        caption={`The tree and the array are the same data. Popped in order: ${ops.popped.join(', ')}.`}
      />

      <Box kind="key" label="Key idea">
        <p>
          A heap promises only one thing: the top is the smallest (or largest). It does <b>not</b> keep the rest sorted, and it
          cannot find or remove an item in the middle quickly. Reach for it when a problem repeatedly asks for "the best one
          right now" while items keep arriving, and remember the size trick: to keep the <b>k largest</b>, use a heap of size k
          whose top is the <b>smallest</b> of them, the one to throw out.
        </p>
      </Box>

      <div className="prose">
        <h2>Building a heap in O(n), and writing your own</h2>
        <p>
          Pushing n items one by one costs <Cost>O(n log n)</Cost>. If you already have all n items, you can do better: put them
          in an array as they are, then sift down every node that has children, starting from the last one and moving back to
          the root. Half the nodes are leaves and need no work; a quarter can move down at most one level; an eighth at most
          two; and so on. The total work adds up to less than 2n, so <b>heapify is O(n)</b>.
        </p>
        <p>
          <b>TypeScript has no built-in heap.</b> In interviews you write a small class yourself, and it is worth practising
          until it takes five minutes. It needs: an array, a comparison (so one class serves as min-heap or max-heap, and can
          order pairs such as [distance, node] by their first element), and four operations: <b>size</b>, <b>peek</b> (index 0),{' '}
          <b>push</b> (append, then sift up) and <b>pop</b> (take index 0, move the last item there, sift down). LeetCode's
          JavaScript and TypeScript environment also provides a priority queue library you may use there, but do not rely on it
          in an interview.
        </p>
      </div>

      <div className="prose">
        <h2>When to use it</h2>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
      </div>
      <Structures
        items={[
          { name: 'Binary heap', ts: 'your own class around a number[] (or [key, value][]) and a compare function', ops: 'push and pop O(log n), peek O(1), build from n items O(n)', use: 'Any repeated "give me the best" question.' },
          { name: 'Min-heap of size k', ts: 'the same class, popping whenever size exceeds k', ops: 'O(log k) per item', use: 'The k largest items: the top is the k-th largest and the first to be evicted.' },
          { name: 'Max-heap', ts: 'reverse the comparison, or push negated numbers into a min-heap', ops: 'O(log n)', use: 'The k smallest items, the lower half of a median split, greedy picks of the largest.' },
          { name: 'Heap of tuples', ts: '[priority, id, …][] compared by priority first', ops: 'O(log n)', use: 'Dijkstra (distance, node), k-way merge (value, list, index), scheduling (end time, room).' },
          { name: 'Hash map of delayed deletions', ts: 'Map<number, number>', ops: 'O(1)', use: 'Lazy deletion: remove an item only when it reaches the top.' },
          { name: 'Sorted array of events', ts: 'tasks sorted by start time', ops: 'sort once O(n log n)', use: 'Releasing items into the heap as the clock passes their start time.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Repeated minimum or maximum</h2>
        <p>
          The plainest use: you take the largest item, change it, and put it back, again and again (smash two stones, shrink the
          richest pile, hand out the lowest free seat). Re-sorting after every change costs <Cost>O(n log n)</Cost> per step; a
          heap costs <Cost>O(log n)</Cost>.
        </p>
      </div>
      <Recipe
        name="Heap simulation"
        when="each step takes the current best item and may put a changed item back."
        steps={[
          'Put all items into a heap (heapify in O(n), or push them one by one).',
          'Each step: pop the best item (or two of them).',
          'Compute the result and push any changed or new item back.',
          'Stop when the heap is empty or the required number of steps is done.',
        ]}
        why="after every change the heap property is restored, so the top is always the true current best."
        time="O(n + steps × log n)"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 2: Top K</h2>
        <p>
          To find the k largest of n items, you do not need to sort them all. Keep a <b>min-heap of size k</b>. Each new item is
          pushed; if the heap grows past k, pop the smallest. Whatever is popped can never be in the top k, because k larger
          items are already kept. At the end the heap holds the k largest, and its top is the k-th largest. It costs{' '}
          <Cost>O(n log k)</Cost> and only <Cost>O(k)</Cost> memory, which matters when n is huge or the data is a stream.
        </p>
      </div>
      <Walkthrough title="The 2nd largest with a min-heap of size 2" frames={topK.frames} caption={`The heap never holds more than k = 2 values. Answer: ${topK.answer}.`} />
      <Recipe
        name="Size-k heap"
        when="you need the k largest, k smallest, k most frequent or k closest items."
        steps={[
          'Choose the opposite heap: a min-heap to keep the k largest, a max-heap to keep the k smallest.',
          'For each item, push it.',
          'If the heap now holds more than k items, pop the top: the worst of the ones you keep.',
          'At the end the heap holds the answer; its top is the k-th best.',
        ]}
        why="an item is popped only when k better items are already in the heap, so it can never belong to the top k."
        time="O(n log k)"
        space="O(k)"
      />

      <div className="prose">
        <h2>Pattern 3: K-way merge</h2>
        <p>
          Merging two sorted lists needs one comparison per step. Merging k lists needs the smallest of k heads, and a min-heap
          of the heads gives it in <Cost>O(log k)</Cost>. Pop the smallest head, output it, and push the next item from the same
          list. The same idea finds the k-th smallest in a sorted matrix (rows are lists), the k pairs with smallest sums (each
          row of the pair grid is a list), and the smallest range covering every list.
        </p>
      </div>
      <Recipe
        name="Merge k sorted sources"
        when="the next item must come from one of k sorted lists, arrays or rows."
        steps={[
          'Push the first item of each source into a min-heap, remembering which source and position it came from.',
          'Pop the smallest; that is the next item of the merged order.',
          'Push the next item from the same source, if there is one.',
          'Repeat until you have enough items or the heap is empty.',
        ]}
        why="each source is sorted, so the smallest remaining item overall must be one of the k current heads."
        time="O(N log k) for N items in total"
        space="O(k)"
      />

      <div className="prose">
        <h2>Pattern 4: Two heaps</h2>
        <p>
          The median is the middle of the sorted order, and a heap only knows one end. Two heaps together know the middle: a{' '}
          <b>max-heap</b> holds the lower half (its top is the largest of the small numbers) and a <b>min-heap</b> holds the
          upper half (its top is the smallest of the large numbers). Keep their sizes equal, or the lower half one bigger, and
          the median is right at the tops. The same two-sided split appears in greedy problems: projects you cannot afford yet
          (sorted by cost) and projects you can (a max-heap of profit), as in IPO.
        </p>
      </div>
      <Walkthrough
        title="Running median with two heaps"
        frames={median.frames}
        caption={`Each half is drawn sorted so its top is easy to see; in code each half is a heap with the same top. Medians: ${median.medians.join(', ')}.`}
      />
      <Recipe
        name="Two heaps for the middle"
        when="you need the median (or another split point) of a growing collection."
        steps={[
          'Push a new number into the lower max-heap if it is at most that heap\'s top (or the heap is empty); otherwise into the upper min-heap.',
          'Rebalance: if the lower heap has two more items, move its top up; if the upper heap has more items, move its top down.',
          'The median is the lower top when the count is odd, or the average of both tops when it is even.',
          'If items can also leave (a sliding window), delete them lazily: note them in a map and discard them when they reach a top.',
        ]}
        why="every number in the lower heap is at most every number in the upper heap, and the sizes differ by at most one, so the tops are the middle values."
        time="O(log n) per insertion, O(1) per median"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 5: Scheduling with a heap</h2>
        <p>
          Many simulation problems have the same shape: things become available over time (tasks arrive, meetings start, you
          drive past gas stations), and at each moment you pick the best available one (the shortest task, the room that frees
          first, the station with the most fuel). <b>Sort by availability</b> so you can release items as the clock moves, and
          keep the released items in a <b>heap ordered by "best"</b>. When nothing is available, jump the clock to the next
          release instead of ticking one unit at a time.
        </p>
      </div>
      <Recipe
        name="Sort by start, heap by priority"
        when="items become available over time and you repeatedly choose the best available one."
        steps={[
          'Sort the items by the time they become available (keep their original indices if the output needs them).',
          'Keep a clock. Move every item whose time has come from the sorted list into a heap ordered by priority.',
          'If the heap is empty, jump the clock to the next item\'s time and release it.',
          'Pop the best item, process it, and move the clock forward by its duration (or update the state).',
        ]}
        why="the sorted list guarantees nothing is released early, and the heap guarantees the choice among released items is the best."
        time="O(n log n)"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 6: Dijkstra preview</h2>
        <p>
          Shortest paths with non-negative edge weights use a min-heap of (distance, node). The node with the smallest distance
          in the heap is final: any other route to it would pass through nodes that are already at least as far. So you pop it,
          settle it, and push improved distances for its neighbours. When the problem has extra rules (at most k turns, at most
          k stops), add that information to the state you push. The full treatment is in <See id="shortest-path" />.
        </p>
      </div>

      <div className="prose">
        <h2>Worked example: Merge k Sorted Lists</h2>
        <Step n={1}>Brute force first</Step>
        <p>
          Merge the first two lists, then merge the result with the third, and so on. Each merge copies everything merged so
          far, so with N nodes in total it costs about <Cost>O(N · k)</Cost>. Collecting every node and sorting is{' '}
          <Cost>O(N log N)</Cost>.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          At any moment the next node of the answer is the smallest of the k current heads; nothing deeper in any list can be
          smaller than its own head. Rescanning all k heads each time is <Cost>O(k)</Cost> per node.
        </p>
        <Step n={3}>Prove a rule</Step>
        <p>
          Keep the k heads in a min-heap. Pop the smallest, attach it to the result, and push its successor from the same list.
          The heap always holds exactly the current heads (at most k nodes), so each step is <Cost>O(log k)</Cost>.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          N pops and at most N pushes: <Cost>O(N log k)</Cost> time, <Cost>O(k)</Cost> memory. Skip empty lists when filling
          the heap. With no lists at all, return an empty list. A dummy head node avoids a special case for the first node.
        </p>
      </div>

      <div className="prose">
        <h2>Heap, sorting, quickselect or ordered set?</h2>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Situation</th>
            <th>Best tool</th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>All data known, need the k-th or top k once</td><td>Quickselect (<See id="quickselect" />) or a size-k heap</td><td>O(n) average, or O(n log k)</td></tr>
          <tr><td>Data arrives as a stream; always know the best or the k-th</td><td>Heap</td><td>O(log n) or O(log k) per item</td></tr>
          <tr><td>Need everything in order anyway</td><td>Sort (<See id="sorting" />)</td><td>O(n log n)</td></tr>
          <tr><td>Need to delete arbitrary items, or ask "next larger than x"</td><td>Ordered set (<See id="ordered-set" />), or a heap with lazy deletion</td><td>O(log n)</td></tr>
          <tr><td>Maximum of a sliding window</td><td>Monotonic deque (<See id="monotonic-queue" />)</td><td>O(n) total</td></tr>
        </tbody>
      </TableWrap>

      <Pitfalls
        items={[
          <>Using the wrong kind of heap for top k. To keep the k <b>largest</b>, use a <b>min</b>-heap: its top is the one to evict.</>,
          <>Expecting a heap to be sorted. Only the top is guaranteed; reading the array from left to right is not sorted order.</>,
          <>Using Array.prototype.sort after every insertion instead of a heap: O(n log n) per step.</>,
          <>Forgetting stale entries in Dijkstra-style loops: a node may be in the heap several times; skip it if its distance is already better.</>,
          <>Comparing tuples carelessly. Decide the full order, including tie-breaks (Single-Threaded CPU breaks ties by index; Meeting Rooms III by room number).</>,
          <>Trying to delete from the middle of a heap. Either use lazy deletion or a different structure.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Push 7, 2, 9, 4, 1 into an empty min-heap. Write the array after each push.',
            solution: '[7] → [2, 7] → [2, 7, 9] → [2, 4, 9, 7] → [1, 2, 9, 7, 4]. The last push puts 1 at index 4, swaps it with its parent 4 at index 1, then with 2 at the root.',
          },
          {
            task: 'Pop the minimum from [1, 2, 9, 7, 4]. Show the sift-down steps.',
            solution: 'Remove 1, move 4 to the root: [4, 2, 9, 7]. Its smaller child is 2, so swap: [2, 4, 9, 7]. 4\'s only child is 7, which is larger, so stop.',
          },
          {
            task: 'Which heap, and of what size, finds the 3 smallest of a million numbers with the least memory?',
            solution: 'A max-heap of size 3. Its top is the largest of the three smallest so far; any number smaller than it replaces it.',
          },
          {
            task: 'For the stream 2, 8, 4, 6, give the contents of both heaps and the median after each number.',
            solution: 'After 2: lower {2}, upper {}, median 2. After 8: lower {2}, upper {8}, median 5. After 4: lower {4, 2}, upper {8}, median 4. After 6: lower {4, 2}, upper {6, 8}, median 5.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'In a heap stored in an array, where are the children of the node at index 4?',
            options: ['5 and 6', '8 and 9', '9 and 10', '3 and 5'],
            answer: 2,
            why: 'Children of i are at 2i + 1 and 2i + 2: 9 and 10.',
          },
          {
            q: 'You need the 10 most frequent words from a stream of 10⁸ words with few distinct values. What keeps the "top 10" step cheapest?',
            options: ['Sort all distinct words by count', 'A min-heap of size 10 ordered by count', 'A max-heap of all distinct words', 'A sorted array of size 10 with binary search'],
            answer: 1,
            why: 'A size-10 min-heap costs O(log 10) per distinct word and its top is the weakest of the current ten.',
          },
          {
            q: 'Why is building a heap from n items with heapify O(n) rather than O(n log n)?',
            options: [
              'Because the items are already sorted',
              'Because most nodes are near the bottom and can only move down a few levels',
              'Because sift up is faster than sift down',
              'It is O(n log n)',
            ],
            answer: 1,
            why: 'Half the nodes are leaves (no work), a quarter move at most one level, and so on; the sum stays below 2n.',
          },
          {
            q: 'In Find Median from Data Stream, which heap holds the lower half?',
            options: ['A min-heap', 'A max-heap, so its top is the largest of the lower half', 'Either; it does not matter', 'A sorted array'],
            answer: 1,
            why: 'The median needs the largest of the lower half and the smallest of the upper half, so the lower half is a max-heap.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          Write your own heap class once, test it on Last Stone Weight and Kth Largest Element in an Array, and reuse it for the
          rest. For each problem, decide what goes in the heap (numbers, pairs, nodes) and what order puts the item you want on
          top.
        </p>
      </div>
      <ProblemSet id="heap" />

      <Recap>
        <ul>
          <li>A heap is a complete tree in an array (children at 2i + 1 and 2i + 2) where each parent beats its children; only the top is guaranteed.</li>
          <li>Push sifts up, pop sifts down, both O(log n); heapify builds a heap from n items in O(n).</li>
          <li>Top k uses the opposite heap of size k; k-way merge keeps one head per source; two heaps keep the median at their tops.</li>
          <li>Scheduling problems sort by availability and pick the best available item from a heap; Dijkstra is a heap of distances.</li>
          <li>TypeScript has no heap: practise writing one with a comparison function until it is quick.</li>
        </ul>
      </Recap>
    </>
  );
}
