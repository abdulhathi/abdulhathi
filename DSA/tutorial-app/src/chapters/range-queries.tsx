import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/range-queries';
import { sparseTable, sqrtBlocks } from '../traces/range-queries';
import { Walkthrough } from '../viz/Walkthrough';

const table = sparseTable([5, 2, 8, 6, 3, 7, 4, 1, 9], [2, 7]);
const blocks = sqrtBlocks([3, 1, 4, 1, 5, 9, 2, 6, 5, 3], [1, 8], [5, 0]);

export default function RangeQueries() {
  return (
    <>
      <TopicIntro
        id="range-queries"
        time="3–4 hours, plus problems"
        before={['prefix-sum', 'binary-search', 'segment-tree']}
        learn={[
          'How a sparse table answers range minimum and maximum in O(1) after O(n log n) preparation',
          'Why it works for min, max, AND, OR and GCD, but not directly for sums',
          'Sqrt decomposition: blocks of √n with a summary each, for queries and updates without a tree',
          "Mo's algorithm for answering many range queries offline",
          'How to choose between prefix sums, sparse tables, blocks, Fenwick trees and segment trees',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          Imagine a teacher who is asked, over and over, "who is the shortest pupil between seat l and seat r?". Walking along the
          row every time costs a step per seat. A smarter teacher prepares a cheat sheet once: the shortest pupil in every group
          of 1, 2, 4, 8, … seats, starting at every seat. Any question can then be answered by looking at just two entries of the
          sheet.
        </p>
        <p>
          That cheat sheet is a <b>sparse table</b>. Scanning a range is <Cost>O(n)</Cost> per query, so q queries cost{' '}
          <Cost>O(nq)</Cost>, which for 10⁵ of each is 10¹⁰ steps. The table costs <Cost>O(n log n)</Cost> to build and then{' '}
          <Cost>O(1)</Cost> per query. It works as long as the array <b>never changes</b>.
        </p>
        <p>
          When values do change, you need something that can be patched. A segment tree or Fenwick tree does it in{' '}
          <Cost>O(log n)</Cost> (see <See id="segment-tree" /> and <See id="binary-indexed-tree" />). This chapter adds a
          simpler middle ground, <b>sqrt decomposition</b>: cut the array into about √n blocks and keep a summary of each.
        </p>
      </div>

      <Walkthrough
        title="Build a sparse table for range minimum, then answer [2, 7]"
        frames={table.frames}
        caption={`Each row doubles the block length. A query of any length uses two blocks of the same power-of-two size. Answer: ${table.answer}.`}
      />

      <div className="prose">
        <h2>Why two overlapping blocks are enough</h2>
        <p>
          For a range of length len, let p be the largest power of two with p ≤ len. A block of length p starting at l and a
          block of length p ending at r together cover the whole range, because 2p &gt; len. They usually overlap in the middle.
          For minimum that does not matter: the minimum of the union is the minimum of the two minimums, even if some values are
          looked at twice.
        </p>
        <p>
          An operation with this property, where combining a value with itself changes nothing, is called <b>idempotent</b>.
          Minimum, maximum, bitwise AND, bitwise OR and GCD are idempotent. <b>Sum is not</b>: the overlap would be counted
          twice. For sums of a static array, use prefix sums instead (<See id="prefix-sum" />), which are simpler and also{' '}
          <Cost>O(1)</Cost>.
        </p>
      </div>

      <Box kind="key" label="Key idea">
        <p>
          Precompute answers for power-of-two lengths at every start. Every range is the union of two such blocks, so any
          idempotent question about any range costs two lookups. The price is that one change to the array can invalidate up to
          2^k entries in row k, O(n) entries in all, so a sparse table is for data that never changes.
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
          { name: 'Sparse table', ts: 'number[][] (row k has n − 2^k + 1 entries)', ops: 'build O(n log n); query O(1)', use: 'Static range min, max, AND, OR, GCD. Store indices instead of values when you need the position of the minimum.' },
          { name: 'Log table', ts: 'number[] of floor(log2(len)), or 31 − Math.clz32(len)', ops: 'O(1)', use: 'Picking the block size for a query. Math.clz32 counts leading zero bits of a 32-bit integer.' },
          { name: 'Block summaries', ts: 'number[] of length ⌈n / B⌉', ops: 'update O(1); query O(√n)', use: 'Sqrt decomposition: sums, counts, minimums per block.' },
          { name: 'Position lists', ts: 'Map<number, number[]>', ops: 'build O(n); count in range O(log n)', use: 'How often a value occurs in a range; checking a majority candidate.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Static range minimum or maximum</h2>
        <p>
          The sparse table is the go-to tool when an array is fixed and you will ask about many ranges. It also shows up inside
          bigger algorithms: binary search over "the first index where the running maximum beats x", sliding windows whose
          minimum and maximum you need, and divide and conquer that splits a range at its minimum.
        </p>
      </div>
      <Recipe
        name="Sparse table"
        when="the array never changes and you need many range minimum or maximum (or AND, OR, GCD) queries."
        steps={[
          'Row 0 is a copy of the array.',
          'For k = 1, 2, … while 2^k ≤ n: entry i of row k combines entry i and entry i + 2^(k−1) of row k − 1.',
          'To answer [l, r]: let k be floor(log2(r − l + 1)).',
          'Combine row k at index l with row k at index r − 2^k + 1. That is the answer.',
        ]}
        why="the two blocks of length 2^k cover [l, r] completely, and an idempotent operation does not care about the overlap."
        time="O(n log n) build, O(1) per query"
        space="O(n log n)"
      />

      <div className="prose">
        <h2>Pattern 2: Other overlap-friendly operations</h2>
        <p>
          Bitwise AND over a range can only lose bits as the range grows, and OR can only gain them. So for a fixed left end, the
          range value is <b>monotone</b> in the right end. That makes binary search possible, and a sparse table makes each probe
          of the binary search cost <Cost>O(1)</Cost>. The same works for GCD, which only shrinks or stays the same.
        </p>
        <p>
          Keep a second trick in mind for these problems. The AND (or OR, or GCD) of all subarrays ending at one index takes very
          few distinct values, at most about 30 for 30-bit numbers, because each change removes (or adds) at least one bit. Keeping
          that small set as you move right is often even simpler than a sparse table.
        </p>

        <h2>Pattern 3: Sqrt decomposition</h2>
        <p>
          Split the array into blocks of size B ≈ √n and store one summary per block: its sum, its count of something, its
          minimum. A range query is made of at most two partly covered blocks, which you scan value by value, and whole blocks in
          between, which you take from the summaries. Each part costs at most about √n steps.
        </p>
      </div>
      <Walkthrough
        title="Sqrt decomposition for range sums, with an update"
        frames={blocks.frames}
        caption={`The query [1, 8] gives ${blocks.before}; after setting nums[5] to 0 it gives ${blocks.after}. Only one block sum changed.`}
      />
      <Recipe
        name="Sqrt decomposition"
        when="you need range queries and point updates, n and q are up to about 10⁵, and a tree feels heavy, or the summary is awkward to merge in a tree."
        steps={[
          'Pick a block size B ≈ √n. Index i belongs to block floor(i / B).',
          'Compute the summary of every block.',
          'Update: change the value, then repair the summary of its one block.',
          'Query [l, r]: scan the partial block at the left, use the summaries of the whole blocks in between, scan the partial block at the right.',
        ]}
        why="there are about √n blocks, and each partial piece holds fewer than B ≈ √n values, so no query touches more than about 3√n items."
        time="O(1) to O(√n) update, O(√n) query"
        space="O(√n) extra"
      />
      <div className="prose">
        <h3>Heavy and light values</h3>
        <p>
          The same square-root thinking splits values instead of positions. A value that occurs at least √n times is{' '}
          <b>heavy</b>; there can be at most √n heavy values. Light values are rare, so you can afford to handle them one
          occurrence at a time, and heavy values are few, so you can afford a precomputed answer for each. Online Majority Element
          In Subarray uses exactly this split.
        </p>

        <h3>Mo's algorithm: queries answered offline</h3>
        <p>
          Sometimes the answer for a range can be updated cheaply when the range grows or shrinks by one element (for example,
          "how many distinct values are in [l, r]?", with a count per value). If all queries are known up front, sort them by the
          block of their left end, and inside each block by their right end. Then sweep two pointers from one query to the next,
          adding and removing one element at a time. The right pointer moves at most n steps per block and the left pointer at
          most B steps per query, so the total work is about <Cost>O((n + q)√n)</Cost>. LeetCode rarely needs it, but it is the
          standard answer when nothing else fits.
        </p>

        <h2>Pattern 4: Position lists per value</h2>
        <p>
          When the question is "how often does value v occur in [l, r]?", store for each value the sorted list of its indices.
          The count is the number of list entries between l and r, which two binary searches give. Building all the lists takes
          one pass, because indices are appended in increasing order.
        </p>
      </div>

      <div className="prose">
        <h2>Choosing a range-query tool</h2>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Tool</th>
            <th>Updates?</th>
            <th>Query</th>
            <th>Good for</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Prefix sums</td><td>No</td><td>O(1)</td><td>Sums and counts of a fixed array</td></tr>
          <tr><td>Sparse table</td><td>No</td><td>O(1)</td><td>Min, max, AND, OR, GCD of a fixed array</td></tr>
          <tr><td>Sqrt decomposition</td><td>Yes, O(1) to O(√n)</td><td>O(√n)</td><td>Anything whose block summary is easy to rebuild; heavy and light splits</td></tr>
          <tr><td>Fenwick tree</td><td>Yes, O(log n)</td><td>O(log n)</td><td>Prefix sums and counts with updates</td></tr>
          <tr><td>Segment tree</td><td>Yes, O(log n), ranges too with lazy updates</td><td>O(log n)</td><td>Any mergeable summary, range updates</td></tr>
          <tr><td>Mo's algorithm</td><td>No (offline)</td><td>O(√n) amortised</td><td>Answers that change cheaply when a range grows or shrinks by one</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Worked example: the first taller building</h2>
        <p>
          In <b>Find Building Where Alice and Bob Can Meet</b>, each query has two starting buildings a ≤ b, and people can only
          move right to strictly taller buildings.
        </p>
        <Step n={1}>Brute force first</Step>
        <p>
          For each query, walk right from b and stop at the first building taller than both. That is <Cost>O(n)</Cost> per
          query, and with 5 × 10⁴ queries on 5 × 10⁴ buildings, 2.5 × 10⁹ steps.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          After the easy cases (a = b, or b already taller than a), the answer is simply the first index j &gt; b with
          heights[j] &gt; heights[a]. The walk asks "is there anything taller than heights[a] in (b, j]?" one index at a time.
        </p>
        <Step n={3}>Prove a rule</Step>
        <p>
          The maximum of heights[b + 1..j] only grows as j grows. So "max exceeds heights[a]" is false up to some point and true
          after it: binary search finds that point, and a sparse table gives each range maximum in <Cost>O(1)</Cost>.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          Build <Cost>O(n log n)</Cost>, then <Cost>O(log n)</Cost> per query. If even the maximum of everything after b is not
          taller, answer −1. Equal heights block movement, so compare with strict inequality.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Using a sparse table for <b>sums</b> with overlapping blocks. Overlaps are counted twice; use prefix sums.</>,
          <>Building a sparse table when the array changes between queries. One update can invalidate O(n) entries.</>,
          <>Off-by-one in the second block: it starts at <b>r − 2^k + 1</b>, not r − 2^k.</>,
          <>Computing log2 with floating point (Math.log2) for every query. It is usually fine, but a precomputed table or 31 − Math.clz32(len) is exact and fast.</>,
          <>In sqrt decomposition, forgetting the case where l and r fall in the same block.</>,
          <>Deep recursion (10⁵ levels) in divide and conquer on sorted input; JavaScript's call stack is much smaller than that.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'For an array of length 9, how many rows does the sparse table have, and how many entries are in the last row?',
            solution: 'Rows for lengths 1, 2, 4 and 8: four rows. The last row has 9 − 8 + 1 = 2 entries.',
          },
          {
            task: 'In that table for an array of length 9, which two entries answer the minimum of [2, 8]?',
            hint: 'The length is 7. What is the largest power of two that fits?',
            solution: 'Length 7, so k = 2 (blocks of 4). Use row 2 at index 2 (covering 2..5) and row 2 at index 8 − 4 + 1 = 5 (covering 5..8).',
          },
          {
            task: 'With blocks of size 4, which values and block sums does the range sum of [2, 13] use?',
            solution: 'Values at 2 and 3 (end of block 0), the sums of blocks 1 and 2 (indices 4..11), then values at 12 and 13 (start of block 3).',
          },
          {
            task: 'Why can a sparse table answer range GCD but not range "number of distinct values"?',
            solution: 'GCD is idempotent: gcd(x, x) = x, so overlapping blocks are harmless. Distinct counts of two overlapping blocks cannot be combined: you cannot tell which values the blocks share.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'An array never changes and you must answer 10⁵ range-maximum queries. What is the best tool?',
            options: ['Prefix sums', 'A sparse table', 'Sorting the array', 'A hash map from value to index'],
            answer: 1,
            why: 'Maximum is idempotent, so the sparse table answers each query with two lookups after O(n log n) preparation.',
          },
          {
            q: 'Why does the sparse table not work for range sums with two overlapping blocks?',
            options: ['Sums can be negative', 'The overlap would be added twice', 'Sums need log n lookups', 'It does work'],
            answer: 1,
            why: 'Sum is not idempotent. For static sums, prefix sums are the right tool anyway.',
          },
          {
            q: 'In sqrt decomposition with n = 10⁴, roughly how many steps does one range query take at most?',
            options: ['About 14', 'About 300', 'About 5,000', 'About 10⁴'],
            answer: 1,
            why: '√10⁴ = 100: up to about 100 values in each partial block and about 100 block summaries, so around 300.',
          },
          {
            q: 'For a fixed left end, how does the AND of nums[l..r] change as r grows?',
            options: ['It can only grow', 'It can only shrink or stay the same', 'It changes randomly', 'It stays the same'],
            answer: 1,
            why: 'Adding a value to an AND can only turn bits off. That monotonicity is what makes binary search valid.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          Several of these have a better-known solution in another chapter (a monotonic deque or stack). Solve them here with the
          range-query tool, then compare; seeing one problem from two sides is how techniques start to connect.
        </p>
      </div>
      <ProblemSet id="range-queries" />

      <Recap>
        <ul>
          <li>Sparse table: O(n log n) build, O(1) query, for idempotent operations (min, max, AND, OR, GCD) on data that never changes.</li>
          <li>A query uses two blocks of length 2^k, where k = floor(log2(length)); the second starts at r − 2^k + 1.</li>
          <li>Monotone range values (AND, OR, running max) plus O(1) queries make binary search on the end point cheap.</li>
          <li>Sqrt decomposition handles updates with block summaries in O(√n); heavy and light splits apply the same idea to values.</li>
          <li>Mo's algorithm answers offline range queries by sorting them so the window moves about (n + q)√n steps in total.</li>
        </ul>
      </Recap>
    </>
  );
}
