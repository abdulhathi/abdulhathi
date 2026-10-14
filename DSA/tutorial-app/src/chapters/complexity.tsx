import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/complexity';
import { binarySearchSteps, dynamicArray, fibCallTree } from '../traces/complexity';
import { Walkthrough } from '../viz/Walkthrough';

const search = binarySearchSteps(Array.from({ length: 15 }, (_, i) => i * 3 + 2), 29);
const fib = fibCallTree(5);
const growth = dynamicArray(9);

export default function Complexity() {
  return (
    <>
      <TopicIntro
        id="complexity"
        time="3–4 hours, plus problems"
        before={['method']}
        learn={[
          'What Big-O measures, and why constants and smaller terms are dropped',
          'The common classes from O(1) to O(n!), and what each looks like in a solution',
          'Space complexity, the call stack, and amortized cost',
          'How to read the input limits and know the target complexity before you start',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          Two solutions can both be correct and still differ by hours. Complexity analysis is how you tell, before running
          anything, how the running time and the memory grow as the input grows. You do not count seconds, which depend on the
          machine. You count <b>steps as a function of the input size n</b>, and you care about the shape of that growth: does
          doubling n double the work, quadruple it, or barely change it?
        </p>
        <p>
          Think of finding a name in a printed phone book. Reading every name from the first page is <b>linear</b>: a book twice
          as thick takes twice as long. Opening at the middle and throwing away the half that cannot contain the name is{' '}
          <b>logarithmic</b>: a book twice as thick costs just one extra look. For a million names, that is the difference
          between a million looks and twenty.
        </p>
        <p>
          On LeetCode this is not theory. Every problem lists limits such as "1 ≤ n ≤ 10⁵", and the judge allows roughly a second,
          which is about 10⁷ to 10⁸ simple steps. If your idea is O(n²) and n is 10⁵, that is 10¹⁰ steps: it will time out, so you
          know to look for something better before you write a line.
        </p>
      </div>

      <Walkthrough
        title="Binary search: about log₂ n looks instead of n"
        frames={search.frames}
        caption={`15 values, found in ${search.steps} looks. With a million values binary search needs at most 20; a linear scan could need a million.`}
      />

      <div className="prose">
        <h2>The rules of Big-O</h2>
        <p>
          Big-O describes an <b>upper bound on growth</b>, usually for the worst case. Writing that an algorithm is O(n²) means
          that for large n its step count is at most some constant times n². Three rules cover nearly everything:
        </p>
        <ul>
          <li>
            <b>Drop constants.</b> 3n + 5 steps is O(n). The constant matters in practice, but it does not change the shape of the
            growth, and it depends on the machine and the language.
          </li>
          <li>
            <b>Keep only the biggest term.</b> n² + n log n + n is O(n²), because for large n the n² term dwarfs the rest.
          </li>
          <li>
            <b>Separate inputs keep separate letters.</b> Looping over an array of length m and a string of length n is O(m + n),
            not O(n). Comparing every element of one with every element of the other is O(m · n).
          </li>
        </ul>
        <p>And the patterns that produce each shape:</p>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Class</th>
            <th>Name</th>
            <th>Typical shape</th>
            <th>Steps at n = 10⁶</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>O(1)</td><td>Constant</td><td>A formula, an index lookup, a hash map lookup</td><td>1</td></tr>
          <tr><td>O(log n)</td><td>Logarithmic</td><td>Halve the range each step: binary search, fast power</td><td>about 20</td></tr>
          <tr><td>O(n)</td><td>Linear</td><td>One pass, or a constant number of passes</td><td>10⁶</td></tr>
          <tr><td>O(n log n)</td><td>Linearithmic</td><td>Sorting; n operations on a heap or a balanced tree</td><td>2 × 10⁷</td></tr>
          <tr><td>O(n²)</td><td>Quadratic</td><td>Every pair; a loop inside a loop over the same input</td><td>10¹² (too slow)</td></tr>
          <tr><td>O(n³)</td><td>Cubic</td><td>Every triple; three nested loops</td><td>10¹⁸ (far too slow)</td></tr>
          <tr><td>O(2ⁿ)</td><td>Exponential</td><td>Every subset; a recursion that branches twice with depth n</td><td>impossible past n ≈ 30</td></tr>
          <tr><td>O(n!)</td><td>Factorial</td><td>Every ordering (permutation)</td><td>impossible past n ≈ 11</td></tr>
        </tbody>
      </TableWrap>

      <Box kind="key" label="Key idea">
        <p>
          Before solving, estimate. Look at n in the constraints, pick the largest complexity that fits, and let that choice
          steer you toward the technique. "n ≤ 20" quietly says "try every subset". "n ≤ 10⁵" says "sort, one pass, or a heap,
          but never every pair".
        </p>
      </Box>

      <div className="prose">
        <h2>Read the limits: constraints to complexity</h2>
        <p>
          This table is the most useful thing in the chapter. Memorise it. It assumes roughly 10⁸ simple steps per second, which
          is a fair rule of thumb for LeetCode's judge, including JavaScript and TypeScript.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Largest n</th>
            <th>Fastest growth you can afford</th>
            <th>Techniques that fit</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>n ≤ 10</td><td>O(n!) or O(n · n!)</td><td>Try every permutation (<See id="backtracking" />)</td></tr>
          <tr><td>n ≤ 20</td><td>O(2ⁿ) or O(2ⁿ · n)</td><td>Every subset, bitmask DP (<See id="bitmask" />)</td></tr>
          <tr><td>n ≤ 500</td><td>O(n³)</td><td>Three nested loops, interval DP, Floyd–Warshall</td></tr>
          <tr><td>n ≤ 5,000</td><td>O(n²)</td><td>Every pair, a 2D DP table</td></tr>
          <tr><td>n ≤ 10⁶</td><td>O(n log n) or O(n)</td><td>Sorting, heaps, hash maps, two pointers, sliding window, prefix sums</td></tr>
          <tr><td>n larger, or a single big number</td><td>O(log n) or O(1)</td><td>Binary search, math formulas, fast power</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>The same idea, written as clues you will meet in problem statements:</p>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
        <p>
          The complexity of your solution is the sum of the costs of the operations you call, so you need to know what the
          built-ins cost. These are the ones that surprise people most often.
        </p>
      </div>
      <Structures
        items={[
          { name: 'Array by index', ts: 'arr[i], arr[i] = v', ops: 'O(1)', use: 'Reading and writing any position.' },
          { name: 'Array ends', ts: 'push, pop', ops: 'O(1) amortized', use: 'A stack. Growing an array occasionally copies it, but rarely enough to average out.' },
          { name: 'Array front', ts: 'shift, unshift, splice', ops: 'O(n)', use: 'Avoid in loops: every element moves. Use a head index or a deque instead.' },
          { name: 'Array search', ts: 'includes, indexOf, find', ops: 'O(n)', use: 'Fine once; inside a loop it makes the loop O(n²). Use a Set for repeated membership tests.' },
          { name: 'Copies', ts: 'slice, concat, spread [...a]', ops: 'O(n)', use: 'Each copy touches every element. Copying inside a loop is a hidden extra factor of n.' },
          { name: 'Sorting', ts: 'Array.prototype.sort', ops: 'O(n log n)', use: 'Pass a comparator for numbers: the default sorts as strings.' },
          { name: 'Hash map and set', ts: 'Map, Set', ops: 'get, set, has, delete O(1) average', use: 'Turning "search for x" into one lookup.' },
          { name: 'Strings', ts: 'string (immutable)', ops: 'slice O(k); building by repeated + can cost O(n) per step', use: 'Collect pieces in an array and join once at the end.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Count the loops</h2>
        <p>
          For loop-based code, the cost is mostly arithmetic. Statements one after another <b>add</b>. A loop <b>multiplies</b> the
          cost of its body by how many times it runs. So a loop over n items with an O(1) body is O(n), and the same loop with an
          inner loop over n items is O(n²).
        </p>
        <p>
          The useful habit is to ask what the inner loop is <i>for</i>. Usually it searches for something: a partner value, the
          minimum so far, a match. If a hash map, a running variable or the sorted order can answer that search in O(1), the
          whole factor of n goes away. That is how Two Sum drops from O(n²) to O(n).
        </p>
      </div>
      <Recipe
        name="Estimate the cost of loop-based code"
        when="you have an idea for a solution and want to know whether it will pass before writing it."
        steps={[
          'Write down how many times each loop runs, in terms of the input sizes.',
          'Multiply nested loops; add loops that come one after another.',
          'Add the cost of every built-in you call inside the loops (includes, slice, shift and sort are not free).',
          'Keep the largest term and drop constants.',
          'Compare with the limits: about 10⁸ simple steps is the budget.',
        ]}
        why="the total work is the sum, over every line, of how often it runs times what it costs."
      />

      <div className="prose">
        <h2>Pattern 2: Halving gives a logarithm</h2>
        <p>
          log₂ n is the number of times you can halve n before reaching 1. It grows extremely slowly: 10 for a thousand, 20 for a
          million, 30 for a billion. Whenever each step of an algorithm discards a constant fraction of what remains, the number
          of steps is logarithmic. Binary search halves a range; fast power halves an exponent; a balanced tree halves the
          candidates at each level. The base of the logarithm never matters in Big-O, because logs in different bases differ only
          by a constant factor.
        </p>
      </div>
      <Recipe
        name="Spot a logarithm"
        when="a loop variable is halved or doubled each round, or each step throws away a fraction of the candidates."
        steps={[
          'Find the quantity that shrinks: a range length, an exponent, the number of candidates.',
          'Check that each step divides it by a constant (2, 3, 10...), not subtracts a constant from it.',
          'The number of steps is then O(log n).',
          'Multiply by the work done in each step: a heap operation inside a loop over n items gives O(n log n).',
        ]}
        why="dividing by 2 each step reaches 1 after log₂ n steps; subtracting 1 each step takes n steps."
        time="O(log n) per halving loop"
        space="O(1)"
      />

      <div className="prose">
        <h2>Pattern 3: Recursion trees</h2>
        <p>
          A recursive function's cost is hard to see from the code, so draw it. Each call is a node; the calls it makes are its
          children. Total work = (number of nodes) × (work per node, not counting the children). If every call makes two calls
          and the depth is n, the tree has up to 2ⁿ nodes. Watch the naive Fibonacci recursion build its tree, and notice how much
          of it repeats.
        </p>
      </div>
      <Walkthrough
        title="Naive Fibonacci: the call tree of f(5)"
        frames={fib.frames}
        caption={`${fib.calls} calls for ${fib.distinct} distinct values. Red marks a call whose answer was already known: that is the waste that memoization removes.`}
      />
      <div className="prose">
        <p>These recursion shapes come up again and again. Learn them as facts:</p>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Shape of the recursion</th>
            <th>Example</th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>One call on half the input, O(1) extra work</td><td>Binary search, fast power</td><td>O(log n)</td></tr>
          <tr><td>Two calls on halves, O(n) work to combine</td><td>Merge sort</td><td>O(n log n): log n levels, O(n) work per level</td></tr>
          <tr><td>One call on n − 1, O(1) extra work</td><td>Summing a list recursively</td><td>O(n) time and O(n) stack space</td></tr>
          <tr><td>Two calls on n − 1 and n − 2</td><td>Naive Fibonacci</td><td>O(2ⁿ); O(n) once each answer is remembered</td></tr>
          <tr><td>One branch per choice, depth n</td><td>Every subset, every permutation</td><td>O(2ⁿ) or O(n!)</td></tr>
        </tbody>
      </TableWrap>
      <Recipe
        name="Find the cost of a recursive function"
        when="the code calls itself and you need its time and space."
        steps={[
          'Count how many calls each call makes (the branching factor b).',
          'Find how deep the recursion goes before reaching a base case (the depth d).',
          'Count the work each call does outside its recursive calls.',
          'If the input shrinks by a constant amount, the tree has about bᵈ nodes; if it halves, add up the work level by level.',
          'Space is the maximum depth of the call stack, not the number of calls.',
        ]}
        why="every call costs its own work once, and only the calls on the current path are on the stack at the same time."
      />

      <div className="prose">
        <h2>Pattern 4: Amortized cost</h2>
        <p>
          Some operations are usually cheap and occasionally expensive. A TypeScript array is the everyday example: when it runs
          out of room, the engine allocates a bigger block and copies everything across. If the capacity doubles each time, the
          copies add up to fewer than 2n over n pushes. So push is <b>O(1) amortized</b>: averaged over any sequence of
          operations, each costs a constant, even though one push in the sequence is slow.
        </p>
      </div>
      <Walkthrough
        title="A doubling array: rare expensive pushes, cheap on average"
        frames={growth.frames}
        caption={`Amber cells were copied during a resize. ${growth.copies} copies for 9 pushes: the total stays below 2n.`}
      />
      <div className="prose">
        <p>
          The same argument proves a loop inside a loop can still be linear. If you can show that the inner loop, across the{' '}
          <i>whole</i> run, does at most n steps in total (because each element is processed once), the combined cost is O(n).
          Longest Consecutive Sequence, the queue built from two stacks, sliding windows and monotonic stacks all rely on it.
        </p>
      </div>
      <Recipe
        name="Prove an amortized bound"
        when="a single operation can be slow, or an inner loop looks quadratic but feels like it does little."
        steps={[
          'Pick something that is spent: each element entering, moving or leaving a structure.',
          'Show each element can be spent only a constant number of times over the whole run.',
          'The total work is then O(n) for n elements, whatever any single step costs.',
          'Divide by the number of operations to get the amortized cost of each.',
        ]}
        why="if every element is touched a bounded number of times, the total cannot exceed a constant times n."
        time="O(1) amortized per operation"
        space="O(1)"
      />

      <div className="prose">
        <h2>Pattern 5: Space complexity</h2>
        <p>
          Memory gets the same Big-O treatment. Count the <b>extra</b> memory your algorithm uses; the input itself, and usually
          the output, are not counted. A hash map with one entry per element is O(n) space. Two variables are O(1). Recursion
          uses space too: each waiting call keeps its own frame on the call stack, so a recursion of depth n uses O(n) space even
          if it allocates nothing. In JavaScript engines, a recursion several thousand calls deep can overflow the stack, which
          is one reason to know the iterative version of a recursive idea.
        </p>
        <p>
          Time and space often trade against each other. Contains Duplicate is O(n²) time with O(1) space, O(n log n) with sorting,
          or O(n) time with O(n) space using a set. When a problem says "O(1) extra space", it is telling you which side of the trade
          it wants.
        </p>
      </div>

      <div className="prose">
        <h2>Worked example: a nested loop that is still linear</h2>
        <p>
          <b>Longest Consecutive Sequence</b> asks for the longest run of consecutive integers among unsorted values, in O(n) time.
          Watch how the analysis, not only the code, gets you there.
        </p>
        <Step n={1}>Brute force first</Step>
        <p>
          For each value x, count upward while x + 1, x + 2, ... are present, searching the array each time. Each search is O(n)
          and a run can be n long, so this is O(n³). Even with sorting first, the best is O(n log n), and the statement asks for
          O(n).
        </p>
        <Step n={2}>Remove the search</Step>
        <p>
          Put every value in a Set. Now "is x + 1 present?" is O(1), and the cost drops to O(n²): n starting points, each counting a
          run of up to n.
        </p>
        <Step n={3}>Remove the repeated runs</Step>
        <p>
          Most of that counting is repeated. Starting from 2 in the run 1, 2, 3, 4 counts a run that starting from 1 already covers.
          So only start counting at values whose x − 1 is absent: the true starts of runs.
        </p>
        <Step n={4}>Prove the cost</Step>
        <p>
          Each value is counted inside exactly one run, the one that contains it, and each run is counted once, from its start. So the
          inner counting does at most n steps <i>in total</i>, and the outer loop does n checks: <Cost>O(n)</Cost> time,{' '}
          <Cost>O(n)</Cost> space for the set. The nested loop looked quadratic; the amortized argument shows it is linear.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Forgetting that built-ins cost something: <b>includes</b>, <b>indexOf</b>, <b>slice</b>, <b>shift</b> and spreading are O(n) each, so one inside a loop makes it O(n²).</>,
          <>Calling <b>sort</b> inside a loop, which makes a hidden O(n² log n).</>,
          <>Treating two different inputs as one n: a loop over m words inside a loop over n letters is O(m · n).</>,
          <>Counting the number of recursive calls as the space cost. Space is the maximum depth of the stack.</>,
          <>Ignoring the limits. If n ≤ 20, an exponential search is the intended solution, not a mistake.</>,
          <>Assuming average-case hash map speed is guaranteed. It is O(1) on average; deliberately bad inputs can be slower, which rarely matters on LeetCode.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'A loop runs i from 1 while i < n, doubling i each time, and does O(1) work inside. What is its cost?',
            solution: 'O(log n): i takes the values 1, 2, 4, 8, ..., so the loop runs about log₂ n times.',
          },
          {
            task: 'For each of n words of length up to k, you sort the letters to build a key. What is the total cost?',
            hint: 'Sorting k letters costs k log k.',
            solution: 'O(n · k log k). With a 26-letter count array as the key instead, it becomes O(n · k).',
          },
          {
            task: 'The limits say 1 ≤ n ≤ 18. Which complexity is the intended solution most likely to have?',
            solution: 'Exponential in n, such as O(2ⁿ · n): 2¹⁸ is about 260,000, so trying every subset is affordable.',
          },
          {
            task: 'A function on an array of length n calls itself on the left half and the right half, and does O(1) work itself. What is its time cost, and how deep is the stack?',
            hint: 'Count the nodes of the recursion tree level by level: 1, 2, 4, ... until the pieces have length 1.',
            solution: 'O(n) time, since the tree has about 2n nodes, each doing O(1) work. The stack depth is O(log n).',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'n can be up to 10⁵. Which complexity is too slow?',
            options: ['O(n)', 'O(n log n)', 'O(n²)', 'O(log n)'],
            answer: 2,
            why: '(10⁵)² = 10¹⁰ steps, about a hundred times over the budget of roughly 10⁸ per second.',
          },
          {
            q: 'What is O(3n² + 100n log n + 7)?',
            options: ['O(n log n)', 'O(3n²)', 'O(n²)', 'O(n² + n log n)'],
            answer: 2,
            why: 'Drop constants and keep the biggest term: n² grows faster than n log n.',
          },
          {
            q: 'Why is pushing onto a TypeScript array O(1) amortized and not simply O(1)?',
            options: [
              'Because arrays are hash maps',
              'Because occasionally the array must grow and copy its elements, but doubling keeps the total copying under 2n',
              'Because the garbage collector runs sometimes',
              'It is O(log n)',
            ],
            answer: 1,
            why: 'A single push can trigger an O(n) copy, but those copies are rare enough that n pushes cost O(n) in total.',
          },
          {
            q: 'A recursive function makes one call on n − 1 and does O(1) work otherwise. What is its space cost?',
            options: ['O(1)', 'O(log n)', 'O(n)', 'O(2ⁿ)'],
            answer: 2,
            why: 'n calls are waiting on the call stack at the deepest point, each holding a frame.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          These problems are not hard; the lesson is the analysis. For each one, write down the brute-force complexity, check it
          against the limits, then find the better version and state its time and space before you code it.
        </p>
      </div>
      <ProblemSet id="complexity" />

      <Recap>
        <ul>
          <li>Big-O counts how steps and memory grow with n: drop constants, keep the biggest term, keep separate inputs separate.</li>
          <li>Nested loops multiply, halving gives log n, branching recursion gives exponential trees, and repeated work can be removed by remembering answers.</li>
          <li>Amortized analysis averages over a whole run: rare expensive steps, and inner loops that touch each element once, can still add up to O(n).</li>
          <li>Read the limits before solving. n ≤ 20 means subsets, n ≤ 5,000 means pairs, n ≤ 10⁶ means n log n or better.</li>
        </ul>
      </Recap>
    </>
  );
}
