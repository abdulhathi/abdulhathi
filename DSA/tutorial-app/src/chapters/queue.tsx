import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/queue';
import { recentCalls, ringBuffer, twoStackQueue } from '../traces/queue';
import { VizFigure } from '../viz/Viz';
import { Walkthrough } from '../viz/Walkthrough';

const ring = ringBuffer(4, [['enqueue', 7], ['enqueue', 2], ['enqueue', 9], ['dequeue'], ['dequeue'], ['enqueue', 4], ['enqueue', 6], ['enqueue', 1], ['enqueue', 8]]);
const stacks = twoStackQueue([['push', 1], ['push', 2], ['push', 3], ['pop'], ['push', 4], ['pop'], ['pop'], ['pop']]);
const calls = recentCalls([500, 2000, 3600, 4100, 7200]);

export default function Queue() {
  return (
    <>
      <TopicIntro
        id="queue"
        time="3–4 hours, plus problems"
        before={['array', 'stack']}
        learn={[
          'What "first in, first out" means, and which problems have that shape',
          'Why Array.prototype.shift is a trap, and the head-index and ring-buffer fixes',
          'Four patterns: process in arrival order, expire old items, build a queue, pending effects',
          'How a deque works at both ends, and how two stacks make a queue',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          A queue is a line at a ticket office. New people join at the <b>back</b> (<b>enqueue</b>), and the person at the{' '}
          <b>front</b> is served next (<b>dequeue</b>). Nobody cuts in. Whoever has waited longest goes first: <b>first in, first
          out</b>, the mirror image of a stack.
        </p>
        <p>
          Queues appear whenever order of arrival matters: tasks to process, people taking turns, events in a time window, and
          the nodes waiting to be explored in a breadth-first search. A <b>deque</b> (double-ended queue, said "deck") lets you add
          and remove at both ends, which makes it the most flexible of the three.
        </p>
        <p>
          The catch in TypeScript is that arrays are cheap to change at the end but expensive at the front. Removing the first
          element with <b>shift</b> moves every other element one place left, which is <Cost>O(n)</Cost>. A queue that calls
          shift in a loop quietly becomes <Cost>O(n²)</Cost>. The fix is to stop moving the elements and move an index instead.
        </p>
      </div>

      <VizFigure
        parts={[
          { kind: 'queue', label: 'a queue: join at the back, leave from the front', items: ['Ann', 'Ben', 'Cho', 'Dev'], tones: { 0: 'active', 3: 'match' } },
          { kind: 'stack', label: 'a stack, for comparison', items: ['Ann', 'Ben', 'Cho', 'Dev'], tones: { 3: 'active' } },
        ]}
        caption="Both hold the same four people, added in the same order. The queue serves Ann next; the stack serves Dev."
      />

      <div className="prose">
        <h3>The head-index trick and the ring buffer</h3>
        <p>
          The simplest fix keeps a <b>head</b> index: dequeue reads the element at head and moves head forward by one; the array is
          never shifted. The queue is everything from head to the end. That is <Cost>O(1)</Cost> per operation, but the used-up
          cells at the front are wasted.
        </p>
        <p>
          A <b>ring buffer</b> (circular queue) reuses them. Give the array a fixed capacity and let indices wrap around with
          modulo: the next write goes to <b>(head + count) mod capacity</b>. When the back reaches the end of the array, it
          continues at slot 0, filling the space the front has freed.
        </p>
      </div>
      <Walkthrough
        title="A ring buffer with capacity 4"
        frames={ring.frames}
        caption={`Blue cells are in the queue. Notice the writes that wrap around to slot 0, and the enqueue that fails because the ring is full. Final contents: ${ring.contents.join(', ')}.`}
      />

      <Box kind="key" label="Key idea">
        <p>
          A queue never needs to move its elements. Track where the front is (and how many items there are), and let the indices
          do the moving. That one idea gives O(1) queues, ring buffers and deques.
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
          { name: 'Array with a head index', ts: 'number[] plus a head index starting at 0', ops: 'enqueue (push) O(1); dequeue (read at head, then move head forward) O(1)', use: 'The everyday queue in TypeScript, for example in BFS. Memory is not reused, which rarely matters in interviews.' },
          { name: 'Ring buffer', ts: 'fixed-size array, head, count, indices mod capacity', ops: 'all O(1)', use: 'A bounded queue that reuses memory: designs, streams, the last k items.' },
          { name: 'Deque', ts: 'no built-in; a ring buffer with both ends movable, or two stacks', ops: 'add or remove at either end O(1)', use: 'Monotonic queues, front-middle-back designs, 0-1 BFS.' },
          { name: 'Queue from two stacks', ts: 'two number[] used only with push and pop', ops: 'O(1) amortised', use: 'When only stack operations are allowed, and a classic interview question.' },
          { name: 'Array with shift()', ts: 'arr.shift()', ops: 'O(n) per dequeue', use: 'Avoid in loops. Fine only for tiny inputs.' },
        ]}
      />
      <Box kind="tip" label="TypeScript tip">
        <p>
          LeetCode's JavaScript and TypeScript runtimes include a few helper libraries, such as queue classes from the
          datastructures-js packages; check the language notes in LeetCode's help centre before relying on one. In an interview,
          be ready to explain how such a class works underneath: a head index or a ring buffer.
        </p>
      </Box>

      <div className="prose">
        <h2>Pattern 1: Process in arrival order</h2>
        <p>
          Many simulations are just a line of people or tasks. Take from the front, do one unit of work, and if the item needs
          more, add it to the back. Taking from the front and adding to the back also models a <b>circle</b>, which is how the
          Josephus game (Find the Winner of the Circular Game) and turn-based games like Dota2 Senate are solved.
        </p>
        <p>
          Before simulating, check whether you even need to. Simulation can be slow when items go round many times. Often you can
          count instead: in Time Needed to Buy Tickets, each person's purchases before person k finishes can be computed
          directly, with no queue at all.
        </p>
      </div>
      <Recipe
        name="Simulate a line"
        when="items are served in the order they arrive, and some rejoin the line."
        steps={[
          'Put the initial items in a queue, in order.',
          'While the queue is not empty (or until a stopping condition): take the front item.',
          'Do one unit of work on it. If it needs more, add it at the back.',
          'Record whatever the problem asks for: a time, an order, a winner.',
        ]}
        why="the queue preserves arrival order, so every item gets its turns exactly as in the story."
        time="O(total turns)"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 2: Expire old items</h2>
        <p>
          When events arrive in time order and you only care about the last T units of time, the events that have expired are
          always the oldest ones, so they sit at the front. Add each new event at the back and drop expired ones from the front.
          Each event is added once and dropped once, so the cost is <Cost>O(1)</Cost> amortised per event.
        </p>
      </div>
      <Walkthrough
        title="Count the calls in the last 3000 ms"
        frames={calls.frames}
        caption={`Answers after each call: ${calls.counts.join(', ')}. Old calls only ever leave from the front.`}
      />
      <Recipe
        name="Sliding time window with a queue"
        when="events arrive in increasing time and you need what happened in the last T units."
        steps={[
          'Add the new event at the back.',
          'While the front event is older than (now − T), remove it.',
          'The queue now holds exactly the events in the window: use its size or its contents.',
        ]}
        why="times only increase, so once an event is too old it stays too old, and the oldest event is always at the front."
        time="O(1) amortised per event"
        space="O(events in the window)"
      />
      <div className="prose">
        <p>
          This is a <See id="sliding-window" /> whose edges are timestamps. If you also need the largest or smallest value inside
          the window, keep the deque sorted: that is the <See id="monotonic-queue" />.
        </p>
      </div>

      <div className="prose">
        <h2>Pattern 3: Build a queue</h2>
        <p>
          Design problems ask you to build a queue or deque from simpler parts. The ring buffer above is one answer. Another is two
          stacks: push new items onto an <b>in</b> stack; to dequeue, pop from an <b>out</b> stack, and when out is empty, pour all
          of in into it. Pouring reverses the order, so the oldest item ends up on top.
        </p>
      </div>
      <Walkthrough
        title="A queue made of two stacks"
        frames={stacks.frames}
        caption={`Items come out in the order they went in: ${stacks.popped.join(', ')}.`}
      />
      <Recipe
        name="Queue from two stacks"
        when="only stack operations are allowed, or you want O(1) amortised operations from the simplest parts."
        steps={[
          'Enqueue: push onto the in stack.',
          'Dequeue or peek: if the out stack is empty, pop every item off in and push it onto out.',
          'Then pop (or read) the top of out.',
          'The queue is empty when both stacks are empty.',
        ]}
        why="each item is moved from in to out at most once, so over many operations the cost per operation averages to O(1)."
        time="O(1) amortised per operation"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 4: Pending effects</h2>
        <p>
          Some problems apply an action to the next k positions: flip k bits, light up k lamps, heal k turns. Applying the action to
          all k cells each time costs <Cost>O(n · k)</Cost>. Instead, remember <i>where</i> each action started in a queue. At
          position i, drop the starts that are k or more positions behind; whatever remains is exactly the set of actions that
          still affect i. Its size (or just whether the size is odd) tells you the current state in <Cost>O(1)</Cost>.
        </p>
      </div>
      <Recipe
        name="Queue of active effects"
        when="each action affects a fixed number of upcoming positions or steps."
        steps={[
          'Scan the positions from left to right, with a queue of start positions of active effects.',
          'At position i, remove starts from the front while they are at most i − k.',
          'Work out the current state from the number of active effects.',
          'If a new effect must start here, push i onto the queue.',
        ]}
        why="effects start in increasing order and all last the same length, so they also expire in that order, from the front."
        time="O(n)"
        space="O(k)"
      />

      <div className="prose">
        <h2>Worked example: Dota2 Senate</h2>
        <p>
          Senators from two parties, Radiant and Dire, act in a fixed order round after round. On their turn, a senator can ban one
          other senator for the rest of the game. Who wins if everyone plays perfectly?
        </p>
        <Step n={1}>Brute force first</Step>
        <p>
          Simulate rounds on the string, and on each turn search forward (wrapping around) for an opponent to ban. Each search can
          take <Cost>O(n)</Cost>, so a full game is <Cost>O(n²)</Cost>.
        </p>
        <Step n={2}>Find the best move</Step>
        <p>
          Which opponent should you ban? The one who would act next. Any other choice lets that opponent act first and ban one of
          your own senators. So every turn is a duel between the next Radiant senator and the next Dire senator.
        </p>
        <Step n={3}>Choose the structure</Step>
        <p>
          Keep two queues of turn positions, one per party. Compare the fronts: the smaller position acts first and bans the
          other. The winner is not finished: it will act again next round, after everyone still waiting this round, so it rejoins
          its queue at position + n. The banned senator is simply dropped.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          Each duel removes one senator, so there are at most n duels, each <Cost>O(1)</Cost>: <Cost>O(n)</Cost> in total. When one
          queue is empty, the other party wins. A single senator wins immediately.
        </p>
      </div>

      <div className="prose">
        <h2>Queue, stack or deque?</h2>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>You need</th>
            <th>Use</th>
            <th>Example</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>The oldest waiting item</td>
            <td>Queue</td>
            <td>Turn-taking, BFS (<See id="bfs" />), recent events</td>
          </tr>
          <tr>
            <td>The newest unfinished item</td>
            <td>Stack (<See id="stack" />)</td>
            <td>Brackets, undo, depth-first traversal</td>
          </tr>
          <tr>
            <td>Both ends</td>
            <td>Deque</td>
            <td>Window maximum, 0-1 BFS, front-middle-back designs</td>
          </tr>
          <tr>
            <td>The smallest or largest item, whatever its age</td>
            <td>Heap (<See id="heap" />)</td>
            <td>Scheduling by priority, top K</td>
          </tr>
        </tbody>
      </TableWrap>

      <Pitfalls
        items={[
          <>Calling <b>shift()</b> in a loop. It is O(n) per call; use a head index, a ring buffer or a deque class.</>,
          <>In a ring buffer, not being able to tell <b>empty from full</b>: keep a count (or leave one slot unused).</>,
          <>Negative remainders: in JavaScript <b>−1 % k</b> is −1. Write <b>(i − 1 + k) % k</b> when moving backwards.</>,
          <>Refilling the out stack of a two-stack queue while it still holds items, which breaks the order.</>,
          <>Simulating when a formula exists: check whether you can count turns directly before writing a long simulation.</>,
          <>Forgetting that expiry windows are often inclusive: "the last 3000 ms" includes time t − 3000.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'A ring buffer has capacity 5, head = 3 and count = 4. Which slots hold the queue, front to back, and where does the next enqueue write?',
            solution: 'Slots 3, 4, 0, 1 hold the queue. The next write goes to (3 + 4) mod 5 = 2, which is the last free slot.',
          },
          {
            task: 'Using two stacks, run: push 1, push 2, pop, push 3, push 4, pop, pop. Which values come out, and how many times is each value moved between stacks?',
            hint: 'The out stack is only refilled when it is empty.',
            solution: 'Out come 1, 2, 3. Values 1 and 2 move to out at the first pop; 3 and 4 move at the third pop. Each value moves at most once.',
          },
          {
            task: 'Four friends sit in a circle and every second friend counted leaves (k = 2). Use a queue to find the winner.',
            solution: 'Queue 1 2 3 4. Move 1 to the back, remove 2: 3 4 1. Move 3, remove 4: 1 3. Move 1, remove 3: 1. Friend 1 wins.',
          },
          {
            task: 'Why is "read the element at head, then move head forward one place" O(1), while arr.shift() is O(n)?',
            solution: 'shift removes the first cell and moves every remaining element one place to the left. The head index leaves the elements where they are and just remembers where the queue now starts.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'You enqueue 3, 1, 4, then dequeue once, then enqueue 5. What is at the front?',
            options: ['3', '1', '4', '5'],
            answer: 1,
            why: 'The dequeue removed 3, the oldest item. The front is now 1.',
          },
          {
            q: 'Your BFS on 10⁵ nodes is too slow, and it removes items with arr.shift(). What is the most likely cause?',
            options: ['BFS is O(n²) by nature', 'shift() is O(n), so the loop is O(n²)', 'Arrays are slow in TypeScript', 'Recursion depth'],
            answer: 1,
            why: 'Each shift moves every element. Switch to a head index and the BFS becomes O(n + edges).',
          },
          {
            q: 'In a two-stack queue, when should you move items from the in stack to the out stack?',
            options: ['After every push', 'Only when the out stack is empty and you need to pop or peek', 'Whenever in has more items than out', 'Never; pop from in'],
            answer: 1,
            why: 'Moving only when out is empty keeps the oldest item on top of out and moves each item at most once.',
          },
          {
            q: 'Calls arrive at times 100, 2000, 3500 and 3600. How many count for the call at 3600 in a 3000 ms inclusive window?',
            options: ['2', '3', '4', '1'],
            answer: 1,
            why: 'The window is [600, 3600]. 100 is too old; 2000, 3500 and 3600 count: 3 calls.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          Breadth-first search is the biggest use of queues, and it has its own chapter, <See id="bfs" />. The problems here train
          the queue itself: order of arrival, expiry, and building queues from parts. Try each one for 20–30 minutes before opening
          a hint.
        </p>
      </div>
      <ProblemSet id="queue" />

      <Recap>
        <ul>
          <li>A queue serves the oldest item first; a deque works at both ends; a stack serves the newest item.</li>
          <li>In TypeScript, never dequeue with shift() in a loop. Move a head index, or use a ring buffer with indices mod capacity.</li>
          <li>Time windows: add at the back, expire from the front, because old events are always at the front.</li>
          <li>Two stacks make a queue with O(1) amortised operations; a ring buffer makes a bounded queue or deque with O(1) operations.</li>
          <li>Effects that last k steps can live in a queue of start positions instead of being applied cell by cell.</li>
        </ul>
      </Recap>
    </>
  );
}
