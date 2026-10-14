import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/sorting';
import { bubbleSort, insertionSort } from '../traces/sorting';
import { Walkthrough } from '../viz/Walkthrough';

const insertion = insertionSort([5, 2, 4, 6, 1, 3]);
const bubble = bubbleSort([5, 1, 4, 2, 8]);

export default function Sorting() {
  return (
    <>
      <TopicIntro
        id="sorting"
        time="5–6 hours, plus problems"
        before={['complexity', 'array', 'two-pointers']}
        learn={[
          'Why sorting first turns many hard questions into one easy pass',
          'How TypeScript sorts, and the comparator rules that trip people up',
          'How bubble, insertion, selection, merge, quick, heap, Timsort and tournament sort work, and what each costs',
          'Why no comparison sort can beat O(n log n), and when you can go faster anyway',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          Think of a library where books are shelved at random. To check whether the library owns two copies of a book, you would
          compare every book with every other book. Shelve the books alphabetically and the question becomes trivial: two copies
          would sit side by side. Sorting is that shelving step for data.
        </p>
        <p>
          After sorting, many questions become <b>local</b>. Duplicates are neighbours. The closest pair of values are neighbours.
          The smallest item that still fits is the next one along. A greedy choice, such as "give the smallest cookie to the least
          greedy child", becomes easy to prove. And sorted data can be searched in <Cost>O(log n)</Cost> with{' '}
          <See id="binary-search" />, or walked with <See id="two-pointers" />.
        </p>
        <p>
          The price is <Cost>O(n log n)</Cost> for the sort. For n = 10⁵ that is about 1.7 million comparisons, which is cheap.
          Compare it with the <Cost>O(n²)</Cost> pair checks it often replaces: five billion. So a sort followed by a linear pass
          is a very common shape for an accepted solution.
        </p>
      </div>

      <Walkthrough
        title="Insertion sort: how you sort a hand of cards"
        frames={insertion.frames}
        caption="Each new value slides left past every bigger value. It is fast on small or nearly sorted input, which is why real library sorts use it for short runs."
      />

      <Box kind="key" label="Key idea">
        <p>
          If the answer does not depend on the order of the input, you are free to choose the order. Ask yourself: <i>"Would this
          be easy if the data were sorted?"</i> If yes, sort first; you can afford <Cost>O(n log n)</Cost> on almost every
          problem with n up to 10⁵ or 10⁶.
        </p>
      </Box>

      <div className="prose">
        <h2>When to use it</h2>
        <p>
          These clues point to sorting. The <See id="recognition" /> collects the signals of every chapter in one place.
        </p>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
      </div>
      <Structures
        items={[
          { name: 'Array + built-in sort', ts: 'Array.prototype.sort(comparator)', ops: 'O(n log n), stable, sorts in place', use: 'Almost every sorting need. Always pass a comparator for numbers.' },
          { name: 'Sorted copy', ts: 'Array.prototype.toSorted(comparator)', ops: 'O(n log n), returns a new array', use: 'When you must keep the original order too (ES2023; Node 20 and later).' },
          { name: 'Hash map', ts: 'Map<string, T[]>', ops: 'get and set O(1) on average', use: 'Grouping by a sorted key, or counting frequencies for a comparator.' },
          { name: 'Count array', ts: 'number[] of fixed size', ops: 'O(1) per update', use: 'Counting sort when values are small; see Counting, bucket and radix sort.' },
          { name: 'Heap', ts: 'no built-in; write a binary heap on an array', ops: 'push and pop O(log n)', use: 'Heapsort, and merging k sorted lists (tournament sort).' },
        ]}
      />

      <div className="prose">
        <h2>How TypeScript sorts</h2>
        <p>
          <b>The default compares strings.</b> Without a comparator, <code>sort</code> converts every element to a string and
          compares those strings character by character. So the numbers 10, 9 and 1 sort as 1, 10, 9, because the string "10"
          comes before "9". Always pass a comparator when you sort numbers.
        </p>
        <p>
          <b>A comparator returns a number.</b> It receives two elements a and b and returns something negative if a should come
          first, positive if b should come first, and zero if their order does not matter. For ascending numbers that is a minus
          b; for descending, b minus a. Returning true or false does not work: false and true become 0 and 1, so the sort never
          sees "a comes first".
        </p>
        <p>
          <b>The sort is stable and in place.</b> Since ES2019 the language requires a stable sort: elements that compare as
          equal keep their original order. V8, the engine in Chrome and Node.js, uses <b>Timsort</b>. The sort changes the array
          you call it on and returns that same array; use <code>toSorted</code> when you need a copy.
        </p>
        <p>
          <b>Multi-key comparators.</b> To sort by frequency and then by value, compare frequencies first and return their
          difference if it is not zero; only then compare values. Every extra key is one more "if the previous keys tie" step.
        </p>
      </div>

      <div className="prose">
        <h2>Pattern 1: Sort first, then scan</h2>
        <p>
          The most common use of sorting is as a preparation step. Once values are in order, a single pass over neighbours answers
          questions about duplicates, gaps and closest pairs, and a two-pointer walk pairs items greedily.
        </p>
      </div>
      <Recipe
        name="Sort, then scan"
        when="the answer does not depend on input order, and sorted order makes the question local (neighbours) or greedy (smallest first)."
        steps={[
          'Ask what order would make the question easy: by value, by end time, by size, by a difference.',
          'Sort by that key with the right comparator.',
          'Walk the sorted data once, comparing each element with its neighbour, or with a second pointer.',
          'If the problem needs original positions, sort pairs of (value, index) instead of bare values.',
        ]}
        why="sorting moves the items that interact (equal, close, best-matched) next to each other, so a linear pass sees every interaction that matters."
        time="O(n log n)"
        space="O(n) for the sort in TypeScript"
      />

      <div className="prose">
        <h2>Pattern 2: Sorted form as a key</h2>
        <p>
          Some objects are "the same" if you ignore order: anagrams, two strings with the same letters, two hands of cards. Their
          sorted forms are identical, so the sorted form works as a key for comparing or grouping them in a <See id="hash-table" />.
          When the alphabet is small, a count of each letter is an equally good key and avoids the sort.
        </p>
      </div>
      <Recipe
        name="Canonical key by sorting"
        when="items should be treated as equal when they contain the same elements in any order."
        steps={[
          'For each item, build its canonical form: its elements in sorted order, or a fixed-size count of each element.',
          'Compare canonical forms to test equality, or use them as Map keys to group items.',
          'Turn the canonical form into a string key if you store it in a Map (arrays are compared by identity, not content).',
        ]}
        why="sorting removes exactly the information you want to ignore, the order, and keeps everything else."
        time="O(k log k) per item of length k, or O(k) with counts"
        space="O(k) per key"
      />

      <div className="prose">
        <h2>Pattern 3: Custom comparators</h2>
        <p>
          Many problems are really "sort by an unusual rule". The rule can have several levels (frequency, then value), point in
          different directions (rarest first, then largest first), or compare items in a clever way, as in Largest Number, where
          a goes before b when the joined string a + b beats b + a.
        </p>
      </div>
      <Recipe
        name="Writing a comparator"
        when="the required order is not plain ascending order of one number."
        steps={[
          'Write down the order in words, key by key: "first by …, then by …".',
          'Compare the first key; if the two items differ, return the difference (or −1 / 1) in the direction you need.',
          'Only when the first key ties, compare the next key, and so on.',
          'Check the rule is consistent: if a comes before b and b before c, a must come before c. An inconsistent rule gives unpredictable results.',
          'Lean on stability: items that should keep their input order can simply compare as equal.',
        ]}
        why="the sort only ever asks your comparator about two items at a time, so a correct pairwise rule gives a correct total order."
        time="O(n log n) comparator calls"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 4: Sort it yourself</h2>
        <p>
          Interviews and a few problems (Sort an Array, Insertion Sort List) ask you to implement sorting. You should be able to
          describe each classic algorithm and its costs, and to write at least one with a guaranteed <Cost>O(n log n)</Cost>.
        </p>
      </div>
      <Walkthrough
        title="Bubble sort: the largest value bubbles to the end"
        frames={bubble.frames}
        caption={`Simple and stable, but O(n²) comparisons in general. The early stop makes it O(n) on input that is already sorted. ${bubble.swaps} swaps here.`}
      />
      <div className="prose">
        <h3>The classic algorithms in a few sentences each</h3>
        <ul>
          <li>
            <b>Bubble sort.</b> Repeatedly compare neighbours and swap them if they are out of order. After pass k, the k largest
            values are in place. Stop when a pass makes no swap.
          </li>
          <li>
            <b>Selection sort.</b> Find the smallest remaining value and swap it to the front; repeat. Always n²/2 comparisons, but
            only n swaps.
          </li>
          <li>
            <b>Insertion sort.</b> Grow a sorted prefix; slide each new value left into place. The number of shifts equals the
            number of out-of-order pairs, so it is very fast on nearly sorted data.
          </li>
          <li>
            <b>Merge sort.</b> Sort each half, then merge the two sorted halves by repeatedly taking the smaller front value. It
            has its own chapter: <See id="merge-sort" />.
          </li>
          <li>
            <b>Quicksort.</b> Pick a pivot, partition the array into values smaller and larger than it, and sort each part. Fast
            in practice and in place, but a bad pivot every time gives <Cost>O(n²)</Cost>; random pivots make that vanishingly
            unlikely. Its partition step powers <See id="quickselect" />.
          </li>
          <li>
            <b>Heapsort.</b> Arrange the array as a max-heap (each parent at least as large as its children), then repeatedly swap
            the maximum to the end and repair the heap. <Cost>O(n log n)</Cost> worst case and O(1) extra space. See{' '}
            <See id="heap" />.
          </li>
          <li>
            <b>Timsort.</b> What V8 and Python use. It finds runs that are already sorted, extends short runs with insertion sort,
            and merges runs in a careful order. Real data often has sorted stretches, so it is frequently close to{' '}
            <Cost>O(n)</Cost>.
          </li>
          <li>
            <b>Tournament sort.</b> Play the values against each other in a knockout tree; the winner is the minimum. Remove it,
            replay only its path (log n matches), and repeat. A heap of k list heads, as in Merge k Sorted Lists, is the same idea.
          </li>
        </ul>
      </div>
      <TableWrap className="t matrix">
        <thead>
          <tr>
            <th>Algorithm</th>
            <th>Best</th>
            <th>Average</th>
            <th>Worst</th>
            <th>Extra space</th>
            <th>Stable</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Bubble (with early stop)</td><td>O(n)</td><td>O(n²)</td><td>O(n²)</td><td>O(1)</td><td className="yes">yes</td></tr>
          <tr><td>Selection</td><td>O(n²)</td><td>O(n²)</td><td>O(n²)</td><td>O(1)</td><td className="no">no</td></tr>
          <tr><td>Insertion</td><td>O(n)</td><td>O(n²)</td><td>O(n²)</td><td>O(1)</td><td className="yes">yes</td></tr>
          <tr><td>Merge</td><td>O(n log n)</td><td>O(n log n)</td><td>O(n log n)</td><td>O(n)</td><td className="yes">yes</td></tr>
          <tr><td>Quicksort (random pivot)</td><td>O(n log n)</td><td>O(n log n)</td><td>O(n²)</td><td>O(log n)</td><td className="no">no</td></tr>
          <tr><td>Heapsort</td><td>O(n log n)</td><td>O(n log n)</td><td>O(n log n)</td><td>O(1)</td><td className="no">no</td></tr>
          <tr><td>Timsort</td><td>O(n)</td><td>O(n log n)</td><td>O(n log n)</td><td>O(n)</td><td className="yes">yes</td></tr>
          <tr><td>Tournament</td><td>O(n log n)</td><td>O(n log n)</td><td>O(n log n)</td><td>O(n)</td><td className="no">usually not</td></tr>
          <tr><td>Counting (values in 0..k)</td><td>O(n + k)</td><td>O(n + k)</td><td>O(n + k)</td><td>O(n + k)</td><td className="yes">yes</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h3>Why O(n log n) is the limit for comparison sorts</h3>
        <p>
          A sort that learns about the data only by comparing two elements must tell apart all n! possible orderings of the input.
          Each comparison has two outcomes, so it at best halves the number of orderings still possible. Getting from n! down to 1
          therefore needs at least log₂(n!) comparisons, and log₂(n!) grows like n log₂ n. No clever comparison sort can do better
          in the worst case. To go faster you must stop comparing and use the values themselves, which works when they are small
          integers: see <See id="linear-sorts" />.
        </p>
      </div>

      <div className="prose">
        <h2>Worked example: Largest Number</h2>
        <Step n={1}>Brute force first</Step>
        <p>
          Try every ordering of the numbers, join each one, and keep the largest string. With 100 numbers that is 100! orderings:
          impossible. But the problem is clearly about order, which suggests a sort with the right comparator.
        </p>
        <Step n={2}>Find the rule for two items</Step>
        <p>
          Numeric order fails: 9 should come before 10 because 910 beats 109. String order fails too: 3 should come before 30
          because 330 beats 303, yet "30" is the larger string. What actually decides the order of two numbers a and b is which of
          the two joined strings, a + b or b + a, is larger. Put a first exactly when a + b wins.
        </p>
        <Step n={3}>Check the rule is safe</Step>
        <p>
          A comparator must be consistent. Joining strings behaves like comparing the infinite repetition of each number
          (3333… against 303030…), and that comparison is transitive, so the rule defines a proper order. And if the best answer
          ever had b right before a with a + b larger, swapping them would make it larger still, so in the best answer every
          neighbouring pair follows the rule.
        </p>
        <Step n={4}>Cost and edge cases</Step>
        <p>
          Sorting does <Cost>O(n log n)</Cost> comparisons, each joining strings of at most about 20 characters. One edge case: if
          the largest number is 0, all numbers are 0, and the answer must be "0", not "000".
        </p>
      </div>

      <Pitfalls
        items={[
          <>Sorting numbers without a comparator. The default compares strings, so 10 lands before 9.</>,
          <>A comparator that returns true or false. It must return a negative number, zero or a positive number.</>,
          <>Losing the original indices. If the answer needs positions, sort pairs of (value, index).</>,
          <>Sorting when the input order is part of the question (for example "subarray" or "contiguous"). Sorting destroys it.</>,
          <>An inconsistent comparator (random tie-breaks, rules that are not transitive). The result is unpredictable.</>,
          <>Implementing quicksort with the first or last element as pivot on adversarial tests: O(n²) on sorted input.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'What does the default sort produce for the numbers 25, 100, 3 and 7, and why?',
            solution: '100, 25, 3, 7. The values are compared as the strings "100", "25", "3", "7", and "1" < "2" < "3" < "7".',
          },
          {
            task: 'Write in words a comparator that sorts words by length (shortest first), and alphabetically for equal lengths.',
            solution: 'If the lengths differ, return length of a minus length of b. Otherwise compare the words alphabetically and return −1, 0 or 1.',
          },
          {
            task: 'Run insertion sort on 3, 1, 2 and count the shifts. How many out-of-order pairs does the input have?',
            solution: 'Inserting 1 shifts 3 (one shift); inserting 2 shifts 3 (one shift): 2 shifts. The out-of-order pairs are (3, 1) and (3, 2): also 2.',
          },
          {
            task: 'Is selection sort stable? Find a small example.',
            hint: 'Use two equal values with labels, such as 2a, 2b and 1.',
            solution: 'No. For 2a, 2b, 1 the first step swaps 1 with 2a, giving 1, 2b, 2a: the two 2s changed order.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'You need to check whether an array of 10⁵ numbers contains two equal values, using little extra memory. Which approach fits best?',
            options: ['Compare every pair', 'Sort, then compare neighbours', 'Binary search each value in the unsorted array', 'Reverse the array'],
            answer: 1,
            why: 'Sorting puts equal values side by side, so one pass over neighbours finds a duplicate in O(n log n). Pair checks are O(n²), and binary search needs sorted data.',
          },
          {
            q: 'Which sort is guaranteed O(n log n) in the worst case AND uses O(1) extra space?',
            options: ['Quicksort', 'Merge sort', 'Heapsort', 'Insertion sort'],
            answer: 2,
            why: 'Heapsort is O(n log n) always and works in place. Merge sort needs an O(n) buffer, quicksort can degrade to O(n²), and insertion sort is O(n²).',
          },
          {
            q: 'Why does Reorder Data in Log Files rely on a stable sort?',
            options: [
              'Stable sorts are faster',
              'Digit logs must keep their original order, and they compare as equal',
              'Letter logs have duplicate identifiers',
              'Stable sorts handle strings better',
            ],
            answer: 1,
            why: 'The comparator says nothing about the order of two digit logs, so only a stable sort keeps them in input order.',
          },
          {
            q: 'A problem says values are integers between 0 and 1000, and n is 10⁶. What can beat O(n log n)?',
            options: ['Nothing can', 'Counting sort, O(n + 1001)', 'Heapsort', 'Timsort'],
            answer: 1,
            why: 'The O(n log n) limit applies only to comparison sorts. Counting sort uses the values as indices and runs in O(n + k).',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          Start with the first pattern to build the "sort, then it is easy" reflex, then spend real time on the comparator
          problems: Largest Number and Queue Reconstruction by Height are favourites in interviews. Try each problem for 20–30
          minutes before opening a hint.
        </p>
      </div>
      <ProblemSet id="sorting" />

      <Recap>
        <ul>
          <li>Sort first whenever order does not matter to the answer: duplicates, gaps and best pairings become neighbour checks.</li>
          <li>In TypeScript always pass a numeric comparator; the built-in sort is a stable Timsort that sorts in place.</li>
          <li>Comparators can encode several keys and directions; they must be consistent, and stability handles "keep input order".</li>
          <li>Know the classic algorithms and their costs; heapsort and merge sort guarantee O(n log n), and counting sort beats it for small integer values.</li>
        </ul>
      </Recap>
    </>
  );
}
