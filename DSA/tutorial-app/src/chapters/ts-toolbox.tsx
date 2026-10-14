import { Box, Pitfalls, See, Structures, TableWrap } from '../components/Content';

export default function TsToolbox() {
  return (
    <>
      <div className="prose">
        <p>
          The techniques in this lab work in any language, but you are solving in TypeScript, and its built-ins have costs and
          traps that decide whether a correct idea passes or times out. This page lists the structure to reach for, what it
          costs, and what to do when TypeScript has no built-in for it. It describes methods by name only: you write the code.
        </p>
        <h2>The built-ins you will use every day</h2>
      </div>
      <Structures
        items={[
          { name: 'Array', ts: 'number[], string[], T[]', ops: 'index, push, pop O(1); shift, unshift, splice, includes, indexOf O(n)', use: 'Lists, stacks (push and pop at the end), DP tables, adjacency lists.' },
          { name: 'Map', ts: 'Map<K, V>', ops: 'get, set, has, delete O(1) on average', use: 'Counting, value → index, grouping, memo caches. Keeps insertion order.' },
          { name: 'Set', ts: 'Set<T>', ops: 'add, has, delete O(1) on average', use: 'Seen sets, deduplication, visited nodes.' },
          { name: 'String', ts: 'string', ops: 'index and length O(1); slice and concatenation O(length)', use: 'Read-only text. Strings never change; every edit makes a new string.' },
          { name: 'Typed arrays', ts: 'Int32Array, Float64Array, Uint8Array', ops: 'index O(1), fixed size, filled with 0', use: 'Large numeric DP tables and visited flags: less memory and faster than plain arrays.' },
          { name: 'BigInt', ts: 'bigint (123n)', ops: 'exact integers of any size; slower than number', use: 'Products that exceed 2⁵³, such as multiplying two values modulo 10⁹ + 7.' },
        ]}
      />

      <div className="prose">
        <h2>Structures TypeScript does not have</h2>
        <p>
          Several structures that other languages ship with are missing. You need to know what to do instead, because these come
          up constantly.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>You need</th>
            <th>What to do in TypeScript</th>
            <th>Where it is taught</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Queue (first in, first out)</td>
            <td style={{ whiteSpace: 'normal' }}>An array plus a head index that moves forward instead of calling shift, which is O(n). For long-running queues, write a small circular buffer or linked-list queue.</td>
            <td><See id="queue" /></td>
          </tr>
          <tr>
            <td>Deque (both ends)</td>
            <td style={{ whiteSpace: 'normal' }}>A circular buffer with head and tail indices, or an array with a head index when you only remove from the front and push at the back.</td>
            <td><See id="monotonic-queue" /></td>
          </tr>
          <tr>
            <td>Heap / priority queue</td>
            <td style={{ whiteSpace: 'normal' }}>Write a small binary heap class (an array with sift up and sift down) once and reuse it. LeetCode's JavaScript and TypeScript environment also provides a priority queue library you may use there.</td>
            <td><See id="heap" /></td>
          </tr>
          <tr>
            <td>Ordered set or map (floor, ceiling, sorted iteration)</td>
            <td style={{ whiteSpace: 'normal' }}>A sorted array with binary search when updates are rare; a Fenwick tree or segment tree over compressed values; a heap with lazy deletion; or a small treap.</td>
            <td><See id="ordered-set" /></td>
          </tr>
          <tr>
            <td>Linked list</td>
            <td style={{ whiteSpace: 'normal' }}>LeetCode gives you a ListNode class with a value and a next pointer. For your own lists, use objects with next (and prev) fields and sentinel nodes.</td>
            <td><See id="linked-list" /></td>
          </tr>
          <tr>
            <td>Pair or tuple as a Map or Set key</td>
            <td style={{ whiteSpace: 'normal' }}>Keys compare by identity, so two arrays with the same contents are different keys. Encode the pair as a string ("3,7") or as one number (row × columns + col).</td>
            <td><See id="hash-function" /></td>
          </tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Numbers</h2>
        <ul>
          <li>
            <b>Every number is a 64-bit float.</b> Integers are exact only up to 2⁵³ − 1 (about 9 · 10¹⁵). Multiplying two values
            near 10⁹ gives about 10¹⁸, which is past that limit and silently loses precision. When a problem says "modulo 10⁹ + 7"
            and you multiply, use BigInt for the product or split the multiplication.
          </li>
          <li>
            <b>Integer division:</b> there is none. Use Math.floor for non-negative values and Math.trunc to round toward zero
            like C++ and Java do for negatives.
          </li>
          <li>
            <b>The remainder operator keeps the sign</b> of the left side: −7 % 3 is −1, not 2. To get a value in the range 0 to
            m − 1, add m and take the remainder again.
          </li>
          <li>
            <b>Bitwise operators work on 32-bit signed integers.</b> Values above 2³¹ − 1 wrap around. Use the unsigned right
            shift by zero to read a result as unsigned, and use BigInt or arithmetic for wider masks.
          </li>
          <li>
            <b>Infinity and −Infinity</b> are real values, handy as starting points for minimum and maximum. Math.max of an empty
            list is −Infinity.
          </li>
        </ul>

        <h2>Strings and characters</h2>
        <ul>
          <li>Strings cannot be changed. To edit text, split it into an array of characters, change the array, and join it at the end.</li>
          <li>Building a long string with repeated concatenation in a loop can be slow; collect pieces in an array and join once.</li>
          <li>Map a lowercase letter to 0–25 with its char code minus the char code of "a"; a 26-slot array is faster than a Map for letter counts.</li>
          <li>Comparing strings with less-than and greater-than compares them in dictionary order by UTF-16 code units, which is what most problems mean.</li>
        </ul>

        <h2>Sorting</h2>
        <ul>
          <li>
            <b>The default sort compares as strings.</b> Sorting the numbers 10, 9 and 1 without a comparator gives 1, 10, 9. Always
            pass a comparator for numbers: one that subtracts the second value from the first sorts ascending.
          </li>
          <li>The built-in sort is stable (equal items keep their order) and runs in O(n log n).</li>
          <li>To sort by several keys, compare the first key and fall back to the next only when the first is equal.</li>
        </ul>

        <h2>Arrays and grids</h2>
        <ul>
          <li>
            <b>Building a 2D grid:</b> filling an outer array with one inner array makes every row the <i>same</i> array, so
            changing one cell changes the whole column. Create each row separately, for example with Array.from and a function
            that makes a new row each time.
          </li>
          <li>Spreading a huge array into Math.max or Math.min can overflow the call stack; loop instead for arrays of 10⁵ or more.</li>
          <li>Slicing and spreading copy the array: O(n) each time. Avoid them inside loops; pass indices instead.</li>
        </ul>

        <h2>Recursion</h2>
        <p>
          JavaScript engines allow roughly ten thousand nested calls before a stack overflow, and the exact limit varies. A
          recursive DFS on a path-shaped tree or a long linked list with 10⁵ nodes can crash. When the depth can reach the input
          size, use an explicit stack (an array) instead of recursion. <See id="recursion" /> and <See id="dfs" /> show how.
        </p>
      </div>

      <Box kind="key" label="Before you submit">
        <ul>
          <li>Numbers sorted with a comparator?</li>
          <li>Any product that could pass 2⁵³? Any remainder of a negative number?</li>
          <li>Any shift inside a loop, or an array copy inside a loop?</li>
          <li>Recursion deeper than a few thousand calls?</li>
          <li>Map or Set keys that are arrays or objects?</li>
        </ul>
      </Box>

      <Pitfalls
        items={[
          'Sorting numbers without a comparator.',
          'Using shift on a large array as a queue: each call is O(n), so a BFS becomes O(n²).',
          'Filling a 2D array with one shared row.',
          'Multiplying two large values modulo 10⁹ + 7 with plain numbers and losing precision.',
          'Using an array as a Map key and never finding it again.',
        ]}
      />
    </>
  );
}
