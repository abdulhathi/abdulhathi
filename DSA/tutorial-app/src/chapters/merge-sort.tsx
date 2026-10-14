import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/merge-sort';
import { mergeSortInversions } from '../traces/merge-sort';
import { Walkthrough } from '../viz/Walkthrough';

const run = mergeSortInversions([5, 2, 8, 1, 9, 3, 7, 4]);

export default function MergeSort() {
  return (
    <>
      <TopicIntro
        id="merge-sort"
        time="4–5 hours, plus problems"
        before={['divide-and-conquer', 'linked-list', 'sorting']}
        learn={[
          'The merge step, and why merge sort is O(n log n) on every input',
          'How to sort linked lists and merge k sorted lists efficiently',
          'The cross-pair idea: counting inversions and similar pairs during the merges',
          'When to prefer merge sort over a Binary Indexed Tree for counting problems',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          You have two piles of exam papers, each already sorted by name, face up. To combine them into one sorted pile you never
          need to look deeper than the two top papers: take whichever name comes first, put it on the output pile, and repeat.
          That is the <b>merge</b>, and it takes one step per paper.
        </p>
        <p>
          <b>Merge sort</b> uses the merge recursively. Split the array in half, sort each half the same way, and merge the two
          sorted halves. Splitting stops at single elements, which are sorted by definition. There are log₂ n levels of halving,
          and at every level the merges together touch each element once, so the total is <Cost>O(n log n)</Cost>, always. No
          input makes it slower, unlike quicksort. It is also <b>stable</b> (equal values keep their order, if you take the left
          one on ties), and on linked lists it needs no extra memory for merging.
        </p>
        <p>
          The second reason merge sort matters in problem solving is less obvious, and it is the one that solves Hard problems: at
          the moment you merge two halves, <b>every element of the left half was originally before every element of the right
          half</b>, and both halves are sorted. That makes pairs (i &lt; j) that cross the middle easy to count. Watch the
          inversion count grow in the walkthrough.
        </p>
      </div>

      <Walkthrough
        title="Merge sort that counts inversions along the way"
        frames={run.frames}
        caption={`An inversion is a pair i < j with a[i] > a[j]. Each time a right-half value is merged ahead of waiting left-half values, it is smaller than all of them: that is one inversion per waiting value. Total: ${run.inversions}.`}
      />

      <Box kind="key" label="Key idea">
        <p>
          Every pair of indices i &lt; j is "split" by exactly one merge: the one where i is in the left half and j in the right.
          So counting the qualifying cross pairs inside every merge counts every pair exactly once. Because both halves are
          sorted at that moment, a two-pointer pass counts them in linear time, and the whole count costs{' '}
          <Cost>O(n log n)</Cost> instead of <Cost>O(n²)</Cost>.
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
          { name: 'Temporary buffer', ts: 'number[] of length n, allocated once', ops: 'O(n) memory', use: 'Merging two halves of an array. Reuse it for every merge instead of allocating new arrays.' },
          { name: 'Array of indices', ts: 'number[] holding 0..n − 1', ops: 'sort the indices, compare their values', use: 'Per-element counts: you need to know which original element each count belongs to.' },
          { name: 'Linked list with dummy head', ts: '{ val, next } nodes', ops: 'relink in O(1)', use: 'Merging lists by relinking nodes, without any extra array.' },
          { name: 'Min-heap of list heads', ts: 'no built-in; a binary heap on an array', ops: 'push and pop O(log k)', use: 'The other way to merge k sorted lists.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Merge two sorted lists</h2>
        <p>
          The merge is a <See id="two-pointers" /> pattern with one pointer per input. It is worth knowing by heart, because it
          appears inside merge sort, inside k-way merging, and in problems such as Merge Sorted Array and Interval List
          Intersections.
        </p>
      </div>
      <Recipe
        name="The merge step"
        when="two inputs are sorted and you need them combined into one sorted sequence."
        steps={[
          'Point i at the start of the first input and j at the start of the second.',
          'Compare the two current elements and output the smaller one (the first input\'s on a tie, for stability). Advance that pointer.',
          'When one input runs out, output the rest of the other input unchanged.',
          'For linked lists, use a dummy head and relink nodes instead of copying values.',
        ]}
        why="the smallest remaining element of the output is always one of the two current elements, because each input is sorted."
        time="O(m + n)"
        space="O(m + n) for arrays, O(1) for linked lists"
      />

      <div className="prose">
        <h2>Pattern 2: Sort with merge sort</h2>
        <p>
          <b>Top-down</b> merge sort is the recursive version: split, sort halves, merge. <b>Bottom-up</b> merge sort skips the
          recursion: first merge neighbouring runs of length 1 into runs of length 2, then 2 into 4, and so on until one run
          covers everything. On a linked list, bottom-up merging needs only O(1) extra memory, which answers the follow-up of
          Sort List.
        </p>
      </div>
      <Recipe
        name="Merge sort (top-down)"
        when="you need a stable O(n log n) sort, must sort a linked list, or want to count cross pairs."
        steps={[
          'If the range has zero or one element, it is sorted: return.',
          'Split at the middle. For a linked list, find the middle with slow and fast pointers and cut the list there.',
          'Sort the left half and the right half recursively.',
          'Merge the two sorted halves (through the buffer for arrays, by relinking for lists).',
        ]}
        why="each level of recursion does O(n) merging work in total and there are log₂ n levels."
        time="O(n log n) in every case"
        space="O(n) buffer for arrays, O(log n) stack"
      />

      <div className="prose">
        <h2>Pattern 3: k-way merge</h2>
        <p>
          To merge k sorted lists with N nodes in total, the order in which you merge matters a lot.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Strategy</th>
            <th>Cost</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Merge list 1 into the result, then list 2, then list 3, …</td><td>O(N · k)</td><td>Early nodes are copied again in every one of the k merges.</td></tr>
          <tr><td>Merge in pairs, round after round</td><td>O(N log k)</td><td>The number of lists halves each round, so each node is merged log k times.</td></tr>
          <tr><td>Min-heap of the k current heads</td><td>O(N log k)</td><td>Each node enters and leaves a heap of size k once.</td></tr>
        </tbody>
      </TableWrap>
      <Recipe
        name="Pairwise rounds"
        when="you have k sorted lists or arrays to merge into one."
        steps={[
          'Put all lists in an array.',
          'While more than one list remains, merge list 0 with list 1, list 2 with list 3, and so on, into a new array. An odd last list passes through unchanged.',
          'The single list left at the end is the answer.',
        ]}
        why="it is merge sort's bottom-up merging, applied to k sorted runs instead of n single elements."
        time="O(N log k)"
        space="O(k) for the array of lists"
      />

      <div className="prose">
        <h2>Pattern 4: Count pairs while merging</h2>
        <p>
          Many Hard problems ask you to count pairs i &lt; j whose values satisfy some condition, or, for each element, how many
          elements after it are smaller. The brute force checks all n²/2 pairs. Merge sort counts them in{' '}
          <Cost>O(n log n)</Cost>. There are three versions of the trick.
        </p>
        <ul>
          <li>
            <b>Count during the merge.</b> For inversions, whenever a right-half element is output while left-half elements are
            still waiting, it forms an inversion with each of them. Equivalently, when a left element is output, every right
            element already output is smaller and was to its right (Count of Smaller Numbers After Self).
          </li>
          <li>
            <b>Count before the merge.</b> When the condition is not the merge comparison itself (nums[i] &gt; 2 × nums[j], a
            difference within a range), run a separate two-pointer pass over the two sorted halves first, then merge normally.
          </li>
          <li>
            <b>Transform first.</b> Rewrite the condition so it involves one array: subarray sums become differences of prefix
            sums (Count of Range Sum); an inequality between two arrays becomes d[i] ≤ d[j] + diff after moving terms around.
          </li>
        </ul>
      </div>
      <Recipe
        name="Counting cross pairs"
        when="you must count pairs i < j whose values satisfy a condition that is monotone in sorted order."
        steps={[
          'Rewrite the condition, if needed, so it compares a value on the left with a value on the right of a single array.',
          'Merge sort that array (or an array of indices if you need per-element counts).',
          'After both halves are sorted and before merging them, walk them with two pointers that only move forward and count the qualifying cross pairs.',
          'Merge the halves, and add the cross count to the counts from the two recursive calls.',
        ]}
        why="every pair i < j is a cross pair in exactly one merge, and within that merge sorted order makes the qualifying partners a contiguous block."
        time="O(n log n)"
        space="O(n)"
      />
      <div className="prose">
        <p>
          The same counts can be computed with a <See id="binary-indexed-tree" /> (insert values one by one and ask how many
          inserted values are smaller) or an <See id="ordered-set" />. Merge sort needs no value compression and no extra
          structure; the Binary Indexed Tree is often shorter to write and also handles updates. Know both.
        </p>
      </div>

      <div className="prose">
        <h2>Worked example: Count of Smaller Numbers After Self</h2>
        <Step n={1}>Brute force first</Step>
        <p>
          For each element, scan everything to its right and count the smaller values. That is <Cost>O(n²)</Cost>: five billion
          comparisons for 10⁵ elements. Too slow.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          The brute force compares the same pairs from scratch for every element. Sorted halves would let you answer "how many are
          smaller" for a whole group at once, the way two sorted piles tell you, during a merge, how many cards of one pile came
          before a given card of the other.
        </p>
        <Step n={3}>Prove the counting rule</Step>
        <p>
          During the merge of a left half and a right half, suppose you are about to output the left element x, and j right
          elements have already been output. Those j elements are smaller than x (that is why they went first) and they were to
          the right of x in the original array (they are in the right half). Right elements output after x are not smaller. So
          those j elements are exactly x's smaller-to-the-right partners within this merge. Every element to x's right is in the
          same half as x at deeper levels, or in the opposite half at exactly one merge, so the counts from all merges add up to
          the full answer.
        </p>
        <Step n={4}>Cost and edge cases</Step>
        <p>
          Sort an array of <b>indices</b>, comparing their values, so each count goes to the right original element. On equal
          values, output the left element first; otherwise a right-half equal value would be counted as smaller. The total is{' '}
          <Cost>O(n log n)</Cost> time and <Cost>O(n)</Cost> memory.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Allocating new arrays in every recursive call. Allocate one buffer and reuse it.</>,
          <>Forgetting to cut a linked list at the middle, so the recursion never gets smaller.</>,
          <>Taking the right element on ties, which breaks stability and miscounts "strictly smaller" problems.</>,
          <>Mixing the counting condition into the merge comparison when they differ (Reverse Pairs). Count first, then merge.</>,
          <>Sorting values instead of indices when the answer is per element.</>,
          <>Forgetting P[0] = 0 when working with prefix sums.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Merge the sorted lists 1, 4, 9 and 2, 3, 10. How many comparisons does it take?',
            solution: 'Output 1, 2, 3, 4, 9, then 10 is copied without comparing. Comparisons: 1 vs 2, 4 vs 2, 4 vs 3, 4 vs 10, 9 vs 10: five.',
          },
          {
            task: 'Count the inversions of 3, 1, 2 by listing them, then by the merge rule with halves [3] and [1, 2].',
            solution: 'The pairs (3, 1) and (3, 2): 2 inversions. In the final merge, 1 and 2 are each output while 3 waits on the left: 1 + 1 = 2.',
          },
          {
            task: 'Why is merging k lists one after another O(N · k) while merging in pairs is O(N log k)?',
            solution: 'Sequentially, the growing result is copied again in each of the k merges. In pairs, every round touches each node once and there are log₂ k rounds.',
          },
          {
            task: 'For Reverse Pairs, why can the pointer j into the right half only move forward as the left element grows?',
            solution: 'If left element x is more than twice r, then any larger left element is too. So the set of right elements counted for x is also counted for every later x.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'Why is merge sort O(n log n) even on input that defeats quicksort?',
            options: [
              'It picks random pivots',
              'It always splits exactly in half, and each level does O(n) merging',
              'It uses a heap',
              'It skips sorted runs',
            ],
            answer: 1,
            why: 'The split never depends on the values, so there are always log₂ n levels with linear work each.',
          },
          {
            q: 'During a merge, a right-half value is output while 3 left-half values are still waiting. What does that tell you?',
            options: ['Nothing', 'It forms 3 inversions', 'The array is sorted', 'It is a duplicate'],
            answer: 1,
            why: 'It is smaller than the 3 waiting left values, which all came before it in the original order.',
          },
          {
            q: 'Which is the best way to merge k sorted lists?',
            options: ['Merge them one after another into a growing list', 'Concatenate and sort', 'Merge in pairs, round after round', 'Bubble sort the heads'],
            answer: 2,
            why: 'Pairwise rounds (or a min-heap of heads) cost O(N log k). Sequential merging is O(N · k); concatenate-and-sort is O(N log N) and ignores the sorted input.',
          },
          {
            q: 'Count of Range Sum turns subarray sums into what?',
            options: ['Pairs of prefix sums', 'A sliding window', 'A heap problem', 'A graph'],
            answer: 0,
            why: 'The sum of a subarray is P[j] − P[i], so counting subarrays becomes counting pairs i < j of prefix sums with a difference in range.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          Master Merge Two Sorted Lists and Sort List first. The counting problems are Hard, but they all use the same idea; after
          Count of Smaller Numbers After Self and Reverse Pairs, the others are variations.
        </p>
      </div>
      <ProblemSet id="merge-sort" />

      <Recap>
        <ul>
          <li>The merge takes the smaller front element each time; merge sort applies it over log n levels for O(n log n) on every input.</li>
          <li>Merge sort is stable and suits linked lists, which need no extra memory for merging.</li>
          <li>Merge k lists in pairs or with a heap: O(N log k), never one after another.</li>
          <li>Every pair i &lt; j crosses exactly one merge; count qualifying cross pairs with two pointers over the sorted halves.</li>
        </ul>
      </Recap>
    </>
  );
}
