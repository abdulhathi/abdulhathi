import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/divide-and-conquer';
import { maxSubarrayDC, sortedToBST } from '../traces/divide-and-conquer';
import { Walkthrough } from '../viz/Walkthrough';

const maxSub = maxSubarrayDC([3, -4, 5, -1, 2, -6, 4, 1]);
const bst = sortedToBST([1, 2, 3, 4, 5, 6, 7]);

export default function DivideAndConquer() {
  return (
    <>
      <TopicIntro
        id="divide-and-conquer"
        time="4–5 hours, plus problems"
        before={['recursion', 'complexity', 'sorting']}
        learn={[
          'The three steps of divide and conquer: split, solve the parts, combine',
          'How to read a recurrence and know its cost without heavy maths',
          'Five patterns: split in half, build a tree from parts, every way to split, split a grid, split at a bad element',
          'When divide and conquer turns into memoisation or dynamic programming',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          Imagine marking a stack of 800 exam papers with three friends. You split the stack into four piles, each person marks a
          pile, and then you put the results together. Divide and conquer is that, applied recursively: <b>split</b> the problem
          into smaller copies of itself, <b>solve</b> each copy the same way (until the copies are trivial), and{' '}
          <b>combine</b> their answers.
        </p>
        <p>
          It pays off when combining is cheap compared with solving from scratch. Merge sort is the classic case: sorting two
          halves and merging them costs <Cost>O(n)</Cost> per level of splitting, and there are only log₂ n levels, so the whole
          sort is <Cost>O(n log n)</Cost> instead of the <Cost>O(n²)</Cost> of simple sorts. The hardest part of most divide and
          conquer solutions is the combine step, especially the answers that <b>cross the middle</b>, which neither half can see
          on its own.
        </p>
      </div>

      <Walkthrough
        title="Maximum subarray: left, right, or crossing the middle"
        frames={maxSub.frames}
        caption="Amber cells are the best range that crosses the middle; green cells are the winner for the current range."
      />

      <div className="prose">
        <p>
          Look at how the crossing case is handled. A subarray that crosses the middle must contain the last element of the left
          half and the first element of the right half. So it is a suffix of the left half joined to a prefix of the right half,
          and the best one is simply the best suffix plus the best prefix: two linear scans outward from the middle.
        </p>
      </div>

      <Box kind="key" label="Key idea">
        <p>
          Before you write any recursion, answer three questions: <i>How do I split? What does each part return? How do I combine
          two returned values, including anything that crosses the split?</i> If the parts are independent and the combine step is
          cheap, divide and conquer works. If the parts overlap and repeat, add memoisation (see <See id="memoization" />).
        </p>
      </Box>

      <div className="prose">
        <h2>When to use it</h2>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
        <p>Divide and conquer is a way of organising work rather than a data structure, so the toolkit is small.</p>
      </div>
      <Structures
        items={[
          { name: 'Index bounds', ts: 'two numbers, lo and hi', ops: 'O(1)', use: 'Describe the current part without copying arrays. Copying at every level adds O(n log n) work.' },
          { name: 'Call stack', ts: 'recursion', ops: 'depth log n for halving', use: 'Holds the pending combine steps. Halving keeps it shallow; splitting off one element at a time makes it n deep.' },
          { name: 'Hash map', ts: 'Map<number, number>', ops: 'get O(1) on average', use: 'Find a value\'s position instantly, for example a root inside an inorder traversal.' },
          { name: 'Memo table', ts: 'Map<string, T>', ops: 'get and set O(1) on average', use: 'Cache results when the same part is solved many times (all groupings, all trees).' },
          { name: 'Temporary buffer', ts: 'number[]', ops: 'O(n) memory, allocated once', use: 'Combine steps that merge two sorted halves.' },
        ]}
      />

      <div className="prose">
        <h2>Reading a recurrence in plain words</h2>
        <p>
          A divide and conquer algorithm's running time is described by a recurrence: the cost T(n) for size n equals the cost of
          the parts plus the cost of splitting and combining. You rarely need the full "master theorem". Picture the recursion
          as a tree of calls and add up the work <b>level by level</b>:
        </p>
        <ul>
          <li>If every level does about the same total work, the answer is that work times the number of levels (log n).</li>
          <li>If the work shrinks quickly from level to level, the top level dominates.</li>
          <li>If the work grows from level to level, the many tiny calls at the bottom dominate.</li>
        </ul>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Recurrence</th>
            <th>Cost</th>
            <th>Example</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>T(n) = 2T(n/2) + O(n)</td><td>O(n log n)</td><td>Merge sort, maximum subarray</td><td>Each of the log n levels does O(n) work in total.</td></tr>
          <tr><td>T(n) = 2T(n/2) + O(1)</td><td>O(n)</td><td>Building a tree from a sorted array</td><td>The bottom level has n calls and dominates.</td></tr>
          <tr><td>T(n) = T(n/2) + O(1)</td><td>O(log n)</td><td>Binary search</td><td>One call per level, log n levels.</td></tr>
          <tr><td>T(n) = T(n/2) + O(n)</td><td>O(n)</td><td>Quickselect (average)</td><td>n + n/2 + n/4 + … adds up to 2n: the top level dominates.</td></tr>
          <tr><td>T(n) = 2T(n/2) + O(n log n)</td><td>O(n log² n)</td><td>Closest pair, re-sorting at each level</td><td>log n levels of O(n log n) each.</td></tr>
          <tr><td>T(n) = 3T(n/2) + O(n)</td><td>O(n^1.585)</td><td>Karatsuba multiplication</td><td>The number of calls grows faster than the work shrinks.</td></tr>
          <tr><td>T(n) = 2T(n − 1) + O(1)</td><td>O(2ⁿ)</td><td>Naive recursion with overlapping parts</td><td>Not really divide and conquer: the parts repeat, so memoise.</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Pattern 1: Split in half and combine</h2>
        <p>
          Cut the range at the middle, solve each half, and combine. The combine step usually needs one extra piece of
          information that crosses the boundary: the best crossing subarray, the pairs with one element on each side, the merged
          order of the two halves.
        </p>
      </div>
      <Recipe
        name="Halve and combine"
        when="the answer for a range is a function of the answers for its halves plus something that crosses the middle."
        steps={[
          'Decide what a call returns for a range (a number, a pair of values, a sorted list).',
          'Handle the smallest ranges directly (one or zero elements).',
          'Split at the middle and solve both halves recursively.',
          'Compute what crosses the middle, using only linear work if possible.',
          'Combine the left answer, the right answer and the crossing part into the answer for the whole range.',
        ]}
        why="every possible answer lies entirely in the left half, entirely in the right half, or across the middle, and each case is covered exactly once."
        time="O(n log n) with a linear combine"
        space="O(log n) stack, plus any buffer"
      />

      <div className="prose">
        <h2>Pattern 2: Build a tree from parts</h2>
        <p>
          Trees are recursive, so building one is natural divide and conquer: pick the root, decide which values belong to its
          left and right subtrees, and build those the same way. In a sorted array the middle value is the root of a balanced BST.
          In a preorder traversal the first value is the root; its position in the inorder traversal tells you how big the left
          subtree is.
        </p>
      </div>
      <Walkthrough
        title="Sorted array to a balanced BST: the middle becomes the root"
        frames={bst.frames}
        caption="Each node takes the middle of its range, so the two halves below it differ in size by at most one."
      />
      <Recipe
        name="Root, then subtrees"
        when="you must build a tree from an array, a list or traversals."
        steps={[
          'Find the root of the current part: the middle of a sorted range, the next value of preorder, or the last of postorder.',
          'Work out which values belong to the left subtree and which to the right (with a Map of positions if needed).',
          'Build the left and right subtrees from those parts, in the order the input is consumed.',
          'Attach them to the root and return it.',
        ]}
        why="a subtree is itself a tree built from a contiguous part of the input, so the same rule applies at every level."
        time="O(n) with O(1) root lookups"
        space="O(n) for the tree, O(height) stack"
      />

      <div className="prose">
        <h2>Pattern 3: Every way to split</h2>
        <p>
          Some problems ask for <b>all</b> results: every way to add parentheses, every BST of 1..n, every full binary tree. Try
          every split point; for each one, solve the left and right parts and combine every left result with every right result.
          The same parts appear again and again (the expression "2 × 3" occurs inside many longer groupings), so cache each
          part's result list. This is where divide and conquer meets <See id="memoization" />.
        </p>
      </div>
      <Recipe
        name="All splits, all combinations"
        when="the output is every possible grouping or tree, and each choice of split creates two independent parts."
        steps={[
          'Base case: the smallest part has a known list of results (a single number, a single leaf, or "nothing").',
          'For each split point, get the result lists of the left part and the right part.',
          'Combine every left result with every right result and add them to this part\'s list.',
          'Cache the list for this part so repeated parts are solved once.',
        ]}
        why="every result has some last operator or root, so looping over that choice and pairing all sub-results lists each result exactly once."
        time="proportional to the number of results (Catalan numbers)"
        space="the same"
      />

      <div className="prose">
        <h2>Pattern 4: Split a grid</h2>
        <p>
          A square grid whose side is a power of two splits naturally into four quadrants (Construct Quad Tree). A matrix sorted
          along rows and columns lets you throw away a whole row or column with each comparison from a corner (Search a 2D
          Matrix II). Both are about discarding large areas that cannot matter.
        </p>
      </div>
      <Recipe
        name="Quadrants or elimination"
        when="the input is 2D and either uniform areas collapse, or sorted order lets one comparison discard a row or column."
        steps={[
          'Quadrants: solve the four quarters, then merge them if they are identical leaves.',
          'Elimination: stand at a corner where one direction increases and the other decreases.',
          'Compare with the target and discard the row or column that cannot contain it.',
          'Stop when the area is empty or the answer is found.',
        ]}
        why="each step either finishes a uniform region or removes a full row or column, so no cell is examined twice."
        time="O(n²) for a quad tree, O(m + n) for elimination"
        space="O(log n) or O(1)"
      />

      <div className="prose">
        <h2>Pattern 5: Split at a bad element</h2>
        <p>
          If an element can never be part of a valid answer (a character that appears fewer than k times, a letter missing its
          other case), then no answer crosses it. It acts as a wall that splits the input into independent pieces, and you solve
          each piece recursively. This often gives a short solution to problems that look like they need a complicated window.
        </p>
      </div>
      <Recipe
        name="Walls split the input"
        when="you can identify elements that no valid answer may contain."
        steps={[
          'Scan the current part and find every element that cannot be in an answer.',
          'If there is none, the whole part is valid: return it (or its size).',
          'Otherwise split at those elements and solve each piece recursively.',
          'Return the best piece result.',
        ]}
        why="an answer is a contiguous stretch with no walls in it, so it lies inside exactly one piece."
        time="O(n × number of levels)"
        space="O(n)"
      />

      <div className="prose">
        <h2>Two famous examples worth knowing</h2>
        <p>
          <b>Closest pair of points.</b> Sort the points by x and split them at the middle. Solve each side, giving a best
          distance d. A closer pair would have to cross the middle line, so only points within d of that line matter. Sorted by
          y, each of those points needs to be compared with at most a handful of the next points (a packing argument limits it to
          about seven), so the combine step is linear and the whole algorithm is <Cost>O(n log n)</Cost>.
        </p>
        <p>
          <b>The skyline.</b> The outline of a group of buildings can be built by splitting the buildings into halves, computing
          each half's skyline, and merging the two skylines left to right like merge sort, taking the higher of the two current
          heights. The problem itself is in <See id="sweep-line" />, where a heap-based sweep is the other standard solution.
        </p>
      </div>

      <div className="prose">
        <h2>Worked example: rebuild a tree from preorder and inorder</h2>
        <Step n={1}>Brute force first</Step>
        <p>
          You could try every tree shape with n nodes and check its traversals. The number of shapes grows like 4ⁿ, so that is
          hopeless. The traversals must carry enough structure to rebuild the tree directly.
        </p>
        <Step n={2}>Find the split</Step>
        <p>
          Preorder visits the root first, so preorder[0] is the root. Inorder visits the whole left subtree, then the root, then
          the right subtree. Finding the root inside inorder therefore tells you exactly which values form the left subtree (the
          ones before it) and how many there are.
        </p>
        <Step n={3}>Recurse with the same rule</Step>
        <p>
          The left subtree's preorder is the next block of preorder values, of the size you just learned, and its inorder is the
          block before the root. The same is true on the right. Each subtree is the same problem, smaller, so the recursion
          writes itself. If you keep one pointer moving through preorder and build left before right, you never even compute the
          blocks: the pointer always sits on the next root.
        </p>
        <Step n={4}>Cost and edge cases</Step>
        <p>
          Searching for the root in inorder each time makes it <Cost>O(n²)</Cost> on a skewed tree. A Map from value to inorder
          index makes each lookup <Cost>O(1)</Cost> and the whole build <Cost>O(n)</Cost>. The values are distinct, which is what
          makes the lookup unambiguous; with duplicates, the tree could not be rebuilt uniquely.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Forgetting the crossing case. The best answer often spans both halves, and neither recursive call can see it.</>,
          <>Copying sub-arrays at every call. Pass index bounds; slicing adds a hidden O(n log n) or worse.</>,
          <>Splitting off one element at a time instead of halving. The recursion becomes n deep and the cost becomes quadratic.</>,
          <>Recomputing the same part many times in "all results" problems. Cache results by part.</>,
          <>Using divide and conquer when Kadane, a hash map or a single pass is simpler. It is a tool, not a goal.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Write the recurrence for this algorithm and its cost: split in half, solve both halves, then do O(1) work to combine.',
            solution: 'T(n) = 2T(n/2) + O(1), which is O(n): the bottom level has n calls and dominates.',
          },
          {
            task: 'For the array 2, −1, 3 split as [2] and [−1, 3], what are the left best, the right best and the best crossing sum?',
            solution: 'Left best 2. Right best 3. Crossing: best suffix of [2] is 2, best prefix of [−1, 3] is −1 + 3 = 2, so crossing = 4. Answer 4.',
          },
          {
            task: 'Preorder is 1, 2, 4, 5, 3, 6 and inorder is 4, 2, 5, 1, 3, 6. Which values are in the left subtree of the root, and what is the root of that subtree?',
            solution: 'The root is 1. In inorder, 4, 2 and 5 come before 1, so they form the left subtree. The next preorder value, 2, is its root.',
          },
          {
            task: 'Why does Longest Substring with At Least K Repeating Characters need at most 26 levels of recursion if you split at all rare characters at once?',
            solution: 'After a split, the characters you split on are gone from every piece, so each level removes at least one of the 26 letters for good.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'An algorithm splits the input in half, recurses on both halves, and merges in linear time. What is its cost?',
            options: ['O(n)', 'O(n log n)', 'O(n²)', 'O(log n)'],
            answer: 1,
            why: 'T(n) = 2T(n/2) + O(n): there are log n levels, each doing O(n) work in total.',
          },
          {
            q: 'In the divide-and-conquer Maximum Subarray, how is the best subarray crossing the middle found?',
            options: [
              'By another recursive call on the middle third',
              'Best suffix of the left half plus best prefix of the right half',
              'By sorting the array',
              'It is always the whole array',
            ],
            answer: 1,
            why: 'A crossing subarray contains the last element of the left half and the first of the right half, so it splits into a left suffix and a right prefix.',
          },
          {
            q: 'Different Ways to Add Parentheses keeps solving the same substrings. What fixes that?',
            options: ['Sorting the operators', 'Memoising the result list for each substring', 'Iterating right to left', 'Using a stack'],
            answer: 1,
            why: 'The subproblems overlap, so caching each substring\'s results means each one is computed once.',
          },
          {
            q: 'Which problem is best solved by splitting at elements that can never be in the answer?',
            options: ['Merge Intervals', 'Longest Substring with At Least K Repeating Characters', 'Two Sum', 'Binary Search'],
            answer: 1,
            why: 'Characters that appear fewer than k times can never be in a valid substring, so they split the string into independent pieces.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          Build the tree problems first; they make the "root, then subtrees" rhythm automatic. Then try Different Ways to Add
          Parentheses and Longest Substring with At Least K Repeating Characters, which show how far a simple split can go.
        </p>
      </div>
      <ProblemSet id="divide-and-conquer" />

      <Recap>
        <ul>
          <li>Divide and conquer is split, solve, combine. The combine step, especially the part that crosses the middle, is where the thinking goes.</li>
          <li>Sum the work level by level: equal work per level gives (work × log n); shrinking work means the top dominates; growing work means the bottom dominates.</li>
          <li>Trees are built root first: middle of a sorted range, first of preorder, last of postorder; a Map of positions keeps it linear.</li>
          <li>When parts repeat, memoise; when an element can never be in the answer, split at it.</li>
        </ul>
      </Recap>
    </>
  );
}
