import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/recursion';
import { grammarRows, powerCallStack, reverseListRecursive } from '../traces/recursion';
import { VizFigure } from '../viz/Viz';
import { Walkthrough } from '../viz/Walkthrough';

const power = powerCallStack(2, 13);
const reversal = reverseListRecursive([1, 2, 3, 4]);
const rows = grammarRows(4);

export default function Recursion() {
  return (
    <>
      <TopicIntro
        id="recursion"
        time="4–5 hours, plus problems"
        before={['complexity']}
        learn={[
          'How a function that calls itself solves a problem by trusting a smaller copy of it',
          'Base cases, the call stack, and what happens when the recursion goes too deep',
          'Five shapes: shrink by one, split in half, self-similar sequences, nested structure, try every split',
          'When recursion is the wrong tool, and how to turn it into a loop',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          Some problems contain smaller copies of themselves. A linked list is a node followed by a shorter linked list. A tree is a
          node with smaller trees hanging off it. x¹⁰ is x⁵ squared. Recursion means writing a solution that, for a big input, asks
          the same solution for the answer to a smaller input, and builds its own answer from that.
        </p>
        <p>
          Think of a queue of people in a dark cinema, and you want to know your row number. You ask the person in front: "Which
          row are you in?" They do not know either, so they ask the person in front of them, and so on, until someone in the front
          row says "1". The answers travel back: 2, 3, 4... Nobody needed to see the whole cinema. Each person did one small step
          and trusted the answer from in front.
        </p>
        <p>Every recursive solution answers three questions:</p>
        <ol>
          <li><b>Base case:</b> what is the smallest input, whose answer you know without asking anyone?</li>
          <li><b>Smaller problem:</b> how do you shrink the input, so every chain of calls is guaranteed to reach a base case?</li>
          <li><b>Combine:</b> given the answer for the smaller input, how do you build the answer for this one?</li>
        </ol>
        <p>
          Watch the three questions at work in fast power. Each call waits on the <b>call stack</b> until the call it made returns.
        </p>
      </div>

      <Walkthrough
        title="pow(2, 13): calls pile up, then answers flow back"
        frames={power.frames}
        caption={`The stack never held more than ${power.depth} calls, because the exponent halves each time: 13, 6, 3, 1, 0.`}
      />

      <Box kind="key" label="Key idea">
        <p>
          <b>Trust the recursive call.</b> When you write the combine step, do not trace the calls in your head. Assume the call
          returns the correct answer for the smaller input, and ask only: "given that, how do I finish?" If the base case is right
          and every call shrinks the input, the whole thing is right. This is proof by induction, used as a design tool.
        </p>
      </Box>

      <div className="prose">
        <h2>The call stack</h2>
        <p>
          Each call gets a <b>frame</b>: its own parameters and local variables, plus the place to continue when the inner call
          returns. Frames are stacked: the newest call is on top, and only the top one runs. When it returns, its frame is removed
          and the one below continues. That is why recursion costs memory even if you allocate nothing: a recursion n calls deep
          holds n frames at once, so it uses <Cost>O(n)</Cost> space.
        </p>
        <p>
          The stack is also limited. JavaScript engines throw a "Maximum call stack size exceeded" error after roughly ten thousand
          nested calls (the exact number depends on the engine and the frame size). So a recursion over a linked list of 10⁵ nodes
          can crash where a loop would not. Recursion that halves its input is never a problem: 2⁶⁰ items is still only 60 deep.
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
          { name: 'Call stack', ts: 'implicit: every function call', ops: 'push and pop O(1) each; depth limited to thousands', use: 'Holding each waiting call. Free to use, but its depth is your space cost.' },
          { name: 'Explicit stack', ts: 'array with push and pop', ops: 'O(1) amortized', use: 'Replacing recursion when it would go too deep, or when you want to pause and resume.' },
          { name: 'Memo table', ts: 'Map<string, T> or an array', ops: 'get and set O(1)', use: <>Remembering answers to repeated subproblems. See <See id="memoization" />.</> },
          { name: 'Linked list and tree nodes', ts: '{ val, next } or { val, left, right }', ops: 'follow a pointer O(1)', use: 'The recursive structures that recursion fits most naturally.' },
          { name: 'Shared position', ts: 'a number in an outer scope or an object', ops: 'O(1)', use: 'Parsers: every call reads from the same position and moves it forward.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Shrink by one</h2>
        <p>
          Handle the first element yourself and let the recursive call handle the rest. On linked lists this is the natural shape,
          because "the rest of the list" is literally <i>head.next</i>. The interesting part is whether you work <b>before</b> the
          call (on the way down, like printing in order) or <b>after</b> it (on the way back up, like reversing). Reversal works
          on the way back: once the rest is reversed, the current node is attached to its end.
        </p>
      </div>
      <Walkthrough
        title="Reverse a linked list recursively"
        frames={reversal.frames}
        caption="Going down, nothing changes. All the rewiring happens as the calls return, one node per return."
      />
      <Recipe
        name="Shrink by one"
        when="the input is a sequence or list and the answer for the whole follows easily from the answer for everything after the first element."
        steps={[
          'Base case: the empty input, or a single element.',
          'Recursively solve the input without its first element (on a list, the list starting at head.next).',
          'Combine: attach, compare with or add the first element to that answer.',
          'Return the result.',
        ]}
        why="each call removes one element, so after n calls you reach the base case; the combine step is correct by trusting the smaller answer."
        time="O(n) when the combine step is O(1)"
        space="O(n) for the call stack"
      />

      <div className="prose">
        <h2>Pattern 2: Split in half</h2>
        <p>
          If the answer for n can be built from the answer for n / 2, the recursion is only log n deep. Fast power is the model:
          xⁿ = (x^(n/2))², with one extra × x when n is odd. The crucial detail is to make the half-size call <b>once</b> and reuse
          its result. Calling it twice doubles the work at every level and brings back O(n). The same halving powers binary search
          and the divide-and-conquer algorithms of <See id="divide-and-conquer" />.
        </p>
      </div>
      <Recipe
        name="Split in half"
        when="the answer for n can be computed from the answer for about n / 2, as with powers and repeated operations on huge n."
        steps={[
          'Base case: n = 0 or n = 1.',
          'Make one recursive call for floor(n / 2) and store the result.',
          'Combine it with itself (and fix up the odd case).',
          'Return the combined result.',
        ]}
        why="n halves on every call, so it reaches the base case after about log₂ n calls."
        time="O(log n)"
        space="O(log n) for the call stack"
      />

      <div className="prose">
        <h2>Pattern 3: Self-similar sequences</h2>
        <p>
          Some problems build row n from row n − 1 and then ask for one position in row 30, which would have half a billion symbols.
          Do not build it. Find where position k in row n <i>came from</i> in row n − 1, and recurse on that position. In the 0 → 01,
          1 → 10 grammar, each symbol produces two children, so position k comes from position ceil(k / 2), and the second child is the
          parent flipped.
        </p>
      </div>
      <VizFigure
        parts={rows.map((row, i) => ({ kind: 'array', label: `row ${i + 1}`, items: row, indices: false }))}
        caption="Each symbol produces two symbols in the next row: 0 becomes 01 and 1 becomes 10. Position k in a row comes from position ceil(k / 2) one row up."
      />
      <Recipe
        name="Walk a self-similar definition backwards"
        when="the n-th object is defined from the (n − 1)-th and you are asked for one position or one value of it."
        steps={[
          'Write down how the n-th object is built from the (n − 1)-th: copied, mirrored, doubled, shifted.',
          'For position k in object n, work out which position in object n − 1 it came from, and whether it was changed (flipped, offset).',
          'Recurse on that position; apply the change to the returned value.',
          'Base case: the first object, given directly.',
        ]}
        why="each call goes one level down the definition, never building the exponentially long object."
        time="O(n) for n levels"
        space="O(n) for the call stack, often O(1) as a loop"
      />

      <div className="prose">
        <h2>Pattern 4: Nested structure</h2>
        <p>
          Expressions with brackets inside brackets are recursive by definition, so a recursive parser is the most natural way to
          read them. The trick is one <b>shared reading position</b>. A call reads from the current position, handles what it finds,
          calls itself when it meets an opening bracket, and returns when it meets the matching closing bracket. The caller then
          continues exactly where the inner call stopped. Every recursive parser can also be written with an explicit stack, which
          you will do in <See id="stack" />.
        </p>
      </div>
      <Recipe
        name="Recursive parser"
        when="the input is a nested expression: k[...] repeats, operators with bracketed arguments, nested lists."
        steps={[
          'Keep one reading position shared by every call.',
          'A call reads tokens and builds its result until the input ends or a closing bracket appears.',
          'On an opening bracket, skip it, make a recursive call for the inside, skip the closing bracket, and use the returned value.',
          'Return the result; the caller continues from the updated position.',
        ]}
        why="each call consumes exactly one balanced piece of the input, so the nesting of the calls matches the nesting of the brackets."
        time="O(n) to read the input"
        space="O(depth of nesting)"
      />

      <div className="prose">
        <h2>Pattern 5: Try every split</h2>
        <p>
          "Return all the ways to group this" problems split the input at every possible point, solve each side recursively and
          combine every left answer with every right answer. The number of results grows very fast (these counts are the Catalan
          numbers), so these problems always have small limits. Many splits repeat the same sub-input, so remembering results by
          sub-input pays off: that is <See id="memoization" />, the bridge to dynamic programming.
        </p>
      </div>
      <Recipe
        name="Try every split and combine"
        when="every answer has a top-level split (a last operator, a root), and you need all answers or the best one."
        steps={[
          'Base case: an input too small to split, with a known answer list.',
          'For each possible split point, solve the left part and the right part recursively.',
          'Combine every left answer with every right answer and collect the results.',
          'Remember the results for each sub-input in a map, so repeated sub-inputs are solved once.',
        ]}
        why="every grouping is counted exactly once, by its top-level split."
        time="exponential in n, so n is always small"
        space="the size of the output"
      />

      <div className="prose">
        <h2>Recursion or a loop?</h2>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Situation</th>
            <th>Prefer</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Trees, nested expressions, all groupings</td><td>Recursion</td><td>The code mirrors the structure, and the depth is usually small.</td></tr>
          <tr><td>Linked list of up to 10⁵ nodes</td><td>A loop</td><td>Recursion would be 10⁵ calls deep and may overflow the stack.</td></tr>
          <tr><td>Halving problems (power, binary search)</td><td>Either</td><td>Depth is only log n; the loop saves the stack space.</td></tr>
          <tr><td>Fibonacci-like recurrences</td><td>A loop building upwards</td><td>The plain recursion repeats work exponentially (see <See id="complexity" />).</td></tr>
          <tr><td>Deep search where you must pause and resume</td><td>An explicit stack</td><td>You control the memory and can stop at any time.</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Worked example: K-th Symbol in Grammar</h2>
        <Step n={1}>Brute force first</Step>
        <p>
          Build row 1, then row 2, and so on to row n, and read position k. Row n has 2ⁿ⁻¹ symbols, so row 30 needs about 537 million
          characters. That is O(2ⁿ) time and memory: far too much.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          You need one symbol, yet you build every symbol of every row. Which symbols does position k actually depend on? Only its
          parent in row n − 1, and that parent's parent, and so on: a single chain of n symbols.
        </p>
        <Step n={3}>Find the rule</Step>
        <p>
          Each symbol in row n − 1 produces positions 2j − 1 and 2j in row n. So position k comes from parent position ceil(k / 2).
          A 0 produces 01 and a 1 produces 10, so the first child (odd k) equals its parent and the second child (even k) is the
          parent flipped. Base case: row 1 is 0.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          One call per row: <Cost>O(n)</Cost> time and <Cost>O(n)</Cost> stack space, at most 30 deep. k = 1 always gives 0, since
          the first child of a first child stays 0 all the way down. Done, without building anything.
        </p>
      </div>

      <Pitfalls
        items={[
          <>A missing or unreachable <b>base case</b>: the recursion never stops and the stack overflows. Check that every call moves toward a base case, including for 0 and negative inputs.</>,
          <>Making the same recursive call twice instead of storing its result, which turns O(log n) into O(n) or O(n) into O(2ⁿ).</>,
          <>Recursing 10⁵ levels deep on a long list in JavaScript, which can overflow the stack. Use a loop.</>,
          <>Forgetting to return the recursive result: the call runs, and its answer is thrown away.</>,
          <>Tracing every call in your head instead of trusting the recursive call. Check the base case and one combine step; that is enough.</>,
          <>Sharing a mutable array between calls and forgetting it is shared, so one call's changes leak into another's.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Describe a recursion that sums the values of a linked list. What are the base case, the smaller problem and the combine step?',
            solution: 'Base case: an empty list sums to 0. Smaller problem: the sum of the list starting at head.next. Combine: head.val plus that sum.',
          },
          {
            task: 'Trace the parent rule for K-th Symbol with n = 4 and k = 6. Which positions does it visit, and what is the answer?',
            hint: 'Position 6 in row 4 comes from position 3 in row 3.',
            solution: 'Row 4, k = 6 → row 3, k = 3 → row 2, k = 2 → row 1, k = 1. Row 1 gives 0; row 2 at k = 2 (second child) flips it to 1; row 3 at k = 3 (first child) keeps 1; row 4 at k = 6 (second child) flips to 0. Row 4 is 01101001 and its 6th symbol is indeed 0.',
          },
          {
            task: 'A recursive pow calls pow(x, n / 2) twice and multiplies the two results. What is its time complexity?',
            solution: 'O(n). The tree doubles at each of the log₂ n levels, giving about 2^(log₂ n) = n calls. Storing the result of one call restores O(log n).',
          },
          {
            task: 'Josephus with n = 7 and k = 3: use winner = (winner + k) mod m for m = 2 to 7, starting from winner = 0. Who wins?',
            solution: 'm = 2: 1; m = 3: 1; m = 4: 0; m = 5: 3; m = 6: 0; m = 7: 3. Seat 3 counting from 0 is friend 4.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'What happens if a recursive function has no reachable base case?',
            options: ['It returns undefined', 'It loops forever without using memory', 'It keeps adding frames until the call stack overflows', 'The engine turns it into a loop'],
            answer: 2,
            why: 'Every call adds a frame and none ever returns, so the stack eventually runs out and the engine throws an error.',
          },
          {
            q: 'A recursion on a list of n nodes makes one call per node. What is its space cost?',
            options: ['O(1)', 'O(log n)', 'O(n)', 'O(n²)'],
            answer: 2,
            why: 'At the deepest point, n frames are waiting on the stack at the same time.',
          },
          {
            q: 'In "reverse a linked list" by recursion, when is head.next.next set to head?',
            options: ['Before the recursive call', 'After the recursive call returns', 'Only in the base case', 'Never: values are swapped instead'],
            answer: 1,
            why: 'The rest must be reversed first; then the old second node, now the tail, is pointed back at the current node.',
          },
          {
            q: 'Why does Pow(x, n) by halving need only about 31 calls for n near two billion?',
            options: ['Because x is small', 'Because each call halves n, and 2³¹ is about two billion', 'Because of memoization', 'Because the judge limits recursion'],
            answer: 1,
            why: 'The depth is the number of halvings needed to reach 0, which is about log₂ n.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          For each problem, write down the three answers (base case, smaller problem, combine) before anything else. The linked list
          problems assume you know what a node is; if not, skim <See id="linked-list" /> first and come back.
        </p>
      </div>
      <ProblemSet id="recursion" />

      <Recap>
        <ul>
          <li>Recursion solves a problem by trusting the answer to a smaller copy of it. Get the base case right and make every call shrink the input.</li>
          <li>The call stack holds one frame per waiting call: recursion depth is space, and very deep recursion overflows.</li>
          <li>Shrink by one fits lists; split in half gives log n depth; self-similar definitions are walked backwards; nested input gets a recursive parser.</li>
          <li>Try-every-split recursions are exponential and often repeat work; remembering results leads straight to dynamic programming.</li>
        </ul>
      </Recap>
    </>
  );
}
