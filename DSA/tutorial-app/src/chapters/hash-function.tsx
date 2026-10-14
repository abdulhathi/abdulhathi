import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/hash-function';
import { chainingSet, groupByKey } from '../traces/hash-function';
import { Walkthrough } from '../viz/Walkthrough';

const chaining = chainingSet(7, [['add', 10], ['add', 3], ['add', 17], ['add', 24], ['add', 3], ['contains', 17], ['contains', 31], ['remove', 10], ['contains', 10]]);
const anagrams = groupByKey(['stop', 'race', 'pots', 'care', 'dog', 'tops']);

export default function HashFunction() {
  return (
    <>
      <TopicIntro
        id="hash-function"
        time="3 hours, plus problems"
        before={['hash-table', 'string', 'binary-tree']}
        learn={[
          'What a hash function does inside a hash table, and why collisions are normal',
          'Separate chaining and open addressing, load factor and resizing',
          'How to design a key: canonical forms, composite keys, and why JavaScript compares arrays by reference',
          'Hashing whole structures (subtrees, folders) bottom-up, and hashing pieces of strings in O(1)',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          A cloakroom attendant does not search every hook for your coat. You get a ticket with a number, and the number says
          exactly which hook to check. A <b>hash function</b> is that ticket machine: it turns a key (a number, a string, a whole
          shape) into an index, so a lookup goes straight to one small spot instead of scanning everything.
        </p>
        <p>
          In <See id="hash-table" /> you used Map and Set as black boxes with <Cost>O(1)</Cost> average operations. This chapter
          opens the box, for two reasons. Some problems ask you to build a hash table yourself. And many more problems are really
          about <b>designing the key</b>: deciding what should count as "the same", and turning that into something a Map can
          compare.
        </p>
      </div>

      <Walkthrough
        title="A hash set with 7 buckets and separate chaining"
        frames={chaining.frames}
        caption="Keys 3, 17 and 24 all leave remainder 3 when divided by 7, so they share bucket 3. A lookup still only scans one short chain."
      />

      <div className="prose">
        <h2>How a hash table works</h2>
        <p>
          The table is an array of m <b>buckets</b>. To store a key, compute hash(key) mod m and put the key in that bucket.
          Different keys will sometimes land in the same bucket: that is a <b>collision</b>, and it is unavoidable because there are
          far more possible keys than buckets. Two standard ways to handle it:
        </p>
        <ul>
          <li><b>Separate chaining</b>: each bucket holds a small list; colliding keys join the list.</li>
          <li><b>Open addressing</b>: every bucket holds one key; on a collision, probe the next bucket (or follow a fixed sequence) until a free one appears.</li>
        </ul>
        <p>
          The <b>load factor</b> is keys ÷ buckets. While it stays below about 0.75, lists stay short and probes stay few, so
          operations are <Cost>O(1)</Cost> on average. When it grows too large, allocate an array about twice as big and re-insert
          every key. That rebuild costs <Cost>O(n)</Cost>, but it happens rarely enough that the average cost per insert stays{' '}
          <Cost>O(1)</Cost> (amortised).
        </p>
      </div>

      <Box kind="key" label="Key idea">
        <p>
          A hash table is only as good as two choices: the <b>hash function</b> must spread keys evenly over the buckets, and
          the <b>key</b> must capture exactly what "equal" means in your problem. Most hash problems are won or lost on the second
          choice.
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
          { name: 'Hash map', ts: 'Map<K, V>', ops: 'get, set, has, delete O(1) average', use: 'Key to value. Keeps insertion order when you iterate.' },
          { name: 'Hash set', ts: 'Set<T>', ops: 'add, has, delete O(1) average', use: 'Membership and counting distinct keys.' },
          { name: 'Bucket array', ts: 'number[][] or Array<[number, number][]>', ops: 'index O(1), scan O(chain length)', use: 'Building your own hash table with chaining.' },
          { name: 'String key', ts: 'string built with join and a separator', ops: 'O(length) to build and hash', use: 'Composite keys: (row, col), counts, shapes, serialised trees.' },
          { name: 'Number key', ts: 'number, e.g. row * cols + col', ops: 'O(1)', use: 'Faster composite keys when the parts are small integers. Stay below 2⁵³.' },
        ]}
      />

      <div className="prose">
        <h3>What JavaScript compares</h3>
        <p>
          Map and Set compare keys with the <b>same-value-zero</b> rule: numbers and strings by value, but arrays and objects by{' '}
          <b>reference</b>. Two separately created arrays [1, 2] are different keys. So for a composite key, build a string such
          as "1,2" or a single number such as 1 × 10001 + 2. Plain objects used as maps have a different trap: their keys are always
          converted to strings, so the number 1 and the string "1" collide. Prefer Map.
        </p>

        <h2>Pattern 1: Build your own hash table</h2>
      </div>
      <Recipe
        name="Hash table with separate chaining"
        when="a problem forbids built-in hash tables, or you need to explain how they work."
        steps={[
          'Choose a number of buckets m, ideally a prime (for example 769, 1009 or 10007) a little above the expected number of keys.',
          'Bucket of a key = key mod m (for strings, first turn the string into a number with a polynomial hash).',
          'Insert: go to the bucket; if the key is already there, update it, otherwise append it.',
          'Find and delete: go to the bucket and scan its short list.',
          'If keys ÷ m grows past about 0.75, double m (to a nearby prime) and re-insert everything.',
        ]}
        why="a good hash spreads n keys over m buckets so each list holds about n / m keys, a small constant when m grows with n."
        time="O(1) average, O(n) worst case"
        space="O(m + n)"
      />
      <TableWrap>
        <thead>
          <tr>
            <th></th>
            <th>Separate chaining</th>
            <th>Open addressing</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Collision</td><td>Append to the bucket's list</td><td>Probe the next free slot</td></tr>
          <tr><td>Deletion</td><td>Remove from the list</td><td>Needs a "deleted" marker so later searches keep probing</td></tr>
          <tr><td>Load factor</td><td>Can exceed 1 (lists just get longer)</td><td>Must stay below 1; slows sharply near full</td></tr>
          <tr><td>Memory</td><td>Extra lists</td><td>One flat array: cache friendly</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Pattern 2: Canonical keys</h2>
        <p>
          Many problems define "the same" loosely: anagrams, the same shape shifted, the same file content. The trick is to map
          every member of a group to one <b>canonical key</b>, a standard form that is equal exactly when the items are equivalent.
          Then a single Map lookup replaces comparing every pair.
        </p>
      </div>
      <Walkthrough
        title="Group anagrams with a canonical key"
        frames={anagrams.frames}
        caption="The sorted letters are the same for every anagram and different for anything else, so the Map does all the grouping."
      />
      <TableWrap>
        <thead>
          <tr>
            <th>Equivalence</th>
            <th>Canonical key</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Anagrams</td><td>Sorted letters, or the 26 counts joined with a separator</td></tr>
          <tr><td>Same shape after shifting</td><td>Cell offsets from the shape's first cell, in a fixed visiting order</td></tr>
          <tr><td>Same shape after rotating or reflecting</td><td>All 8 transformed versions, each normalised and sorted; take the smallest</td></tr>
          <tr><td>Strings equal after shifting every letter (abc, bcd)</td><td>Differences between neighbouring letters, mod 26</td></tr>
          <tr><td>Same multiset of numbers</td><td>The numbers sorted and joined, or their counts</td></tr>
          <tr><td>Unordered pair (a, b)</td><td>min first, then max</td></tr>
        </tbody>
      </TableWrap>
      <Recipe
        name="Group by canonical key"
        when="items must be grouped, deduplicated or counted under a looser notion of equality."
        steps={[
          'Write down exactly when two items should count as equal.',
          'Find a standard form with that property: sort, count, normalise position, order the parts.',
          'Encode the standard form as a string (with separators) or a number.',
          'Use a Map from key to group, count, or first index.',
        ]}
        why="equal keys exactly match equivalent items, so the Map's equality check does the comparison for you."
        time="O(n × cost of building a key)"
        space="O(n × key length)"
      />

      <div className="prose">
        <h2>Pattern 3: Hashing structures</h2>
        <p>
          To find equal subtrees or identical folders, give every node a key built from its own label and its children's keys.
          Compute keys bottom-up (post-order), so each child's key is ready when its parent needs it. Two common forms:
        </p>
        <ul>
          <li><b>Serialisation</b>: write the subtree as a string with separators and null markers. Simple, but strings can add up to O(n²) characters on a deep tree.</li>
          <li><b>Interning</b>: map the triple (left id, value, right id) to a small integer id. Each key is short, so the whole pass is O(n).</li>
        </ul>
        <p>
          A third option is a <b>Merkle hash</b>: combine the children's hash numbers with the node's value. It is compact, but
          different trees can collide, so use it with a large modulus or a second check.
        </p>

        <h2>Pattern 4: Hashing pieces of strings</h2>
        <p>
          A polynomial hash of a string treats characters as digits in a large base, taken mod a prime. With the hashes of all
          prefixes precomputed, the hash of any substring comes out in <Cost>O(1)</Cost>. Do the same for the reversed string, and
          you can also ask "is this piece a palindrome?" in <Cost>O(1)</Cost>. The next chapter, <See id="rolling-hash" />,
          covers the arithmetic, including how to avoid overflow in JavaScript.
        </p>

        <h2>Pattern 5: Generating keys</h2>
        <p>
          When you invent the keys yourself, as in a URL shortener, you are free to make collisions impossible: hand out a counter
          and write it in base 62 (digits, lower and upper case letters). Six characters already give 62⁶ ≈ 5.7 × 10¹⁰ codes.
          Hashing the long URL instead gives short codes too, but then two URLs can collide and you must detect it.
        </p>
      </div>

      <div className="prose">
        <h2>Worked example: duplicate subtrees</h2>
        <p>
          <b>Find Duplicate Subtrees</b> asks for one root of every kind of subtree that appears at least twice.
        </p>
        <Step n={1}>Brute force first</Step>
        <p>
          Compare every pair of nodes with a recursive "are these trees identical?" check. With 5,000 nodes that is about 12.5
          million pairs, each check up to <Cost>O(n)</Cost>: far too slow.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          The same comparisons repeat endlessly: whenever two big subtrees are compared, all their smaller subtrees are compared
          again. Equality is decided by the root value and the equality of the children, which suggests computing a key once per
          node, from its children's keys.
        </p>
        <Step n={3}>Prove a rule</Step>
        <p>
          Give the empty tree id 0. In post-order, form the key (left id, value, right id) and look it up in a Map, assigning the
          next integer id to a new key. Two subtrees get the same id exactly when they have the same value and the same child
          ids, which by induction means identical structure and values.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          One Map lookup per node with a short key: <Cost>O(n)</Cost>. Count how often each id appears and report a node when its
          id's count becomes exactly 2, so each kind is reported once.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Using arrays or objects as Map keys. They are compared by reference, so equal-looking keys never match. Build a string or a number.</>,
          <>Joining parts without a separator: [1, 23] and [12, 3] both become "123".</>,
          <>A key that is not canonical, such as offsets collected in an order that depends on where you started.</>,
          <>A composite number key like row * 1000 + col when cols can exceed 1000. Multiply by something larger than the biggest second part.</>,
          <>Trusting a hash match without a plan for collisions when the hash is shorter than the data (file contents, Merkle hashes).</>,
          <>Forgetting that a plain object converts every key to a string.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Insert 5, 12, 19, 2 and 26 into a table of 7 buckets with chaining. Which bucket gets the longest chain?',
            solution: '5 mod 7 = 5, 12 mod 7 = 5, 19 mod 7 = 5, 2 mod 7 = 2, 26 mod 7 = 5. Bucket 5 holds 5, 12, 19 and 26.',
          },
          {
            task: 'Why are numbers of buckets like 7 or 1009 (primes) preferred over 1000?',
            hint: 'Think about keys that are all multiples of 10.',
            solution: 'Keys often share a factor (multiples of 10, of 4, ...). With 1000 buckets, multiples of 10 only use 100 buckets. A prime shares no factor with such patterns, so keys spread over all buckets.',
          },
          {
            task: 'Design a canonical key for "two strings are equivalent if one is the other with every letter shifted by the same amount", as in abc and bcd.',
            solution: 'Use the differences between neighbouring letters, each taken mod 26, joined with separators. abc and bcd both give "1,1".',
          },
          {
            task: 'A grid has up to 10⁴ columns. Write a single-number key for the cell (r, c).',
            solution: 'r × 10001 + c (any multiplier larger than the largest column index works).',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'You put the arrays [1, 2] and [1, 2] (created separately) into a Set. What is its size?',
            options: ['1', '2', '0', 'It throws an error'],
            answer: 1,
            why: 'Set compares arrays by reference. Use the string "1,2" as the key to treat them as equal.',
          },
          {
            q: 'What happens when a chained hash table\'s load factor grows to 10?',
            options: ['Inserts start failing', 'Each lookup scans about 10 keys, so it gets slower', 'Nothing changes', 'Keys are lost'],
            answer: 1,
            why: 'Chains get longer on average. Real tables resize before that to keep chains short.',
          },
          {
            q: 'Which key correctly groups anagrams?',
            options: ['The word\'s length', 'The first letter', 'The letters sorted', 'The sum of the letter codes'],
            answer: 2,
            why: 'Sorted letters are identical for anagrams and differ otherwise. Length and sums collide for non-anagrams (ad and bc have the same sum).',
          },
          {
            q: 'Why do structural keys for subtrees need null markers?',
            options: ['To make strings longer', 'Without them, different shapes can produce the same key', 'JavaScript requires them', 'To sort children'],
            answer: 1,
            why: 'A node with only a left child and a node with only a right child would otherwise serialise identically.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
      </div>
      <ProblemSet id="hash-function" />

      <Recap>
        <ul>
          <li>A hash table maps key → bucket with hash mod m; collisions are normal and handled by chaining or probing.</li>
          <li>Keep the load factor low and resize by doubling; operations stay O(1) on average.</li>
          <li>Most hash problems are key design: find a canonical form that is equal exactly when items are equivalent.</li>
          <li>In JavaScript, encode composite keys as strings or numbers; arrays and objects are compared by reference.</li>
          <li>Hash structures bottom-up (serialise or intern ids) and hash substrings with prefix hashes.</li>
        </ul>
      </Recap>
    </>
  );
}
