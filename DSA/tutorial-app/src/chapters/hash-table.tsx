import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/hash-table';
import { bucketInserts, groupAnagrams, longestConsecutive, twoSum } from '../traces/hash-table';
import { Walkthrough } from '../viz/Walkthrough';

const buckets = bucketInserts([12, 7, 25, 3, 18, 32], 7);
const pairs = twoSum([3, 8, 11, 4, 7], 15);
const anagrams = groupAnagrams(['ten', 'arc', 'net', 'car', 'tan', 'ant', 'rat']);
const runs = longestConsecutive([9, 1, 4, 7, 3, 2, 8, 20]);

export default function HashTable() {
  return (
    <>
      <TopicIntro
        id="hash-table"
        time="4–5 hours, plus problems"
        before={['complexity', 'array', 'string']}
        learn={[
          'How a hash table finds a key without searching, and why that is O(1) on average but O(n) in the worst case',
          'Map, Set and plain objects in TypeScript, and the traps in each',
          'Five patterns: seen set, complement lookup, value to position, two-way mapping, group by a key',
          'How to design a key so that "equal" items collide on purpose',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          Think of a cloakroom. You hand over your coat and get ticket 47. When you come back, the attendant does not search
          every hook; they walk straight to hook 47. A <b>hash table</b> works the same way. A <b>hash function</b> turns a key
          (a number, a word, a pair of coordinates) into a bucket number, and the value is stored in that bucket. To find the key
          again, you compute the same bucket number and look only there.
        </p>
        <p>
          That is why hash tables are the most useful data structure in interview problems. Checking whether something is in a
          plain list means scanning it: <Cost>O(n)</Cost>. Doing that inside a loop gives <Cost>O(n²)</Cost>. A hash table answers
          the same question in <Cost>O(1)</Cost> on average, so the same loop becomes <Cost>O(n)</Cost>. You pay with memory: the
          table holds up to n entries.
        </p>
        <p>
          Different keys can land in the same bucket. That is a <b>collision</b>, and it is normal. The simplest fix, called{' '}
          <b>chaining</b>, keeps a short list in each bucket. Watch six keys go into a table of seven buckets.
        </p>
      </div>

      <Walkthrough
        title="Storing keys in buckets: key mod 7"
        frames={buckets.frames}
        caption="Amber cells are collisions. The chain in bucket 4 has three keys, so finding one of them scans at most three items."
      />

      <div className="prose">
        <h3>O(1) on average, O(n) in the worst case</h3>
        <p>
          A lookup costs one hash calculation plus a scan of one chain. If keys spread evenly, each chain holds about{' '}
          <i>keys ÷ buckets</i> items, a number called the <b>load factor</b>. Real hash tables keep it below about 1 by doubling
          the number of buckets when they fill up. Each doubling moves every key, but it happens so rarely that the average cost
          per insertion stays O(1). That is called <b>amortised</b> O(1).
        </p>
        <p>
          If every key landed in the same bucket, one chain would hold all n keys and every lookup would be <Cost>O(n)</Cost>. With
          the built-in Map and Set this does not happen on ordinary data, so in interviews you state hash operations as O(1) and
          mention, if asked, that this is the average case.
        </p>
      </div>

      <Box kind="key" label="Key idea">
        <p>
          Whenever your solution scans a list to answer "is it here?", "where is it?" or "how many?", ask whether a hash table could
          answer instead. Trading O(n) memory for an O(n) drop in time is the single most common optimisation in interview
          problems.
        </p>
      </Box>

      <div className="prose">
        <h2>When to use it</h2>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
        <p>
          TypeScript gives you two hash-based collections, Map and Set, plus plain objects that behave like maps with string keys.
          Prefer Map and Set: they accept any key type, keep insertion order, know their size, and have no hidden inherited keys.
        </p>
      </div>
      <Structures
        items={[
          { name: 'Hash set', ts: 'Set<T>', ops: 'add, has, delete O(1) average; size O(1)', use: 'Membership: seen values, visited states, removing duplicates.' },
          { name: 'Hash map', ts: 'Map<K, V>', ops: 'get, set, has, delete O(1) average; iterates in insertion order', use: 'Value to index, value to count, key to group.' },
          { name: 'Plain object', ts: 'Record<string, V>', ops: 'O(1) average, but keys are always strings', use: 'Quick fixed lookup tables (like Roman numeral values). Avoid for arbitrary keys.' },
          { name: 'Direct-address array', ts: 'number[] of size 26 (or 10⁶)', ops: 'index O(1), no hashing at all', use: 'Keys are small integers or letters: counts of a–z, values bounded by the limits.' },
          { name: 'String key', ts: 'string such as "3,7"', ops: 'building it costs its length', use: 'Using a pair, a list or a shape as a key: Map compares arrays by identity, not content.' },
        ]}
      />
      <Box kind="warn" label="TypeScript trap">
        <p>
          A Map compares object and array keys by <b>identity</b>, not by content. Two separate arrays [1, 2] are two different
          keys, so a lookup with a freshly built [1, 2] never finds anything. Turn compound keys into a string (for example "1,2")
          or a single number (for example r × columns + c). Plain objects have the opposite problem: they convert every key to a
          string, so the number 1 and the string "1" are the same key.
        </p>
      </Box>

      <div className="prose">
        <h2>Pattern 1: Seen set</h2>
        <p>
          Keep a set of everything you have met so far. Duplicates, "first repeated", "is this value present?" and "visited"
          questions all reduce to one O(1) set check per element. A set also gives you a sort-free way to find neighbours: in
          Longest Consecutive Sequence you ask whether value − 1 and value + 1 exist, which is what sorting would have told you,
          without paying n log n.
        </p>
      </div>
      <Recipe
        name="Seen set"
        when="you need to know whether a value has appeared before, or whether a value exists at all."
        steps={[
          'Create an empty Set (or fill it with all values first, if you need lookups in both directions).',
          'For each element, ask the set the question you need: is it already there? is its neighbour there?',
          'Act on the answer (report a duplicate, skip, count), then add the element if you are building the set as you go.',
        ]}
        why="a set lookup does not depend on how many values it holds, so the loop stays O(n)."
        time="O(n)"
        space="O(n)"
      />
      <Walkthrough
        title="Longest Consecutive Sequence: count only from the start of a run"
        frames={runs.frames}
        caption={`Dimmed values have a predecessor in the set, so they are counted as part of someone else's run. Longest run: ${runs.best}.`}
      />

      <div className="prose">
        <h2>Pattern 2: Complement lookup</h2>
        <p>
          When the partner of a value is completely determined by the value itself (target − x, or 2x, or k − x), you do not need to
          search for it. Store what you have seen, and ask the map whether the partner is there. Check <i>before</i> you store the
          current value, so an element never pairs with itself.
        </p>
      </div>
      <Recipe
        name="Complement lookup"
        when="you look for two items that complete each other: add up to a target, differ by k, multiply to a value."
        steps={[
          'Create an empty Map. Decide what to store: the index (to return positions) or a count (to count pairs).',
          'For each element, compute the partner it would need.',
          'If the partner is in the map, record the pair (or add its count to the answer).',
          'Then store the current element in the map.',
        ]}
        why="each pair is found exactly once, at the moment its second element is reached."
        time="O(n)"
        space="O(n)"
      />
      <Walkthrough title="Two Sum: ask for the partner, then remember yourself" frames={pairs.frames} />
      <div className="prose">
        <p>
          The same idea scales to more items by splitting them into two halves. In 4Sum II, the n² sums of the first two arrays go
          into a map with their counts, and each of the n² sums of the other two looks up its negative. That is called{' '}
          <b>meet in the middle</b>, and it turns <Cost>O(n⁴)</Cost> into <Cost>O(n²)</Cost>. You will see it again in{' '}
          <See id="bitmask" />.
        </p>

        <h2>Pattern 3: Value to position</h2>
        <p>
          Sometimes you need more than "seen or not": you need <i>where</i>. Store each value's last index, and when the value
          appears again you know the distance to its previous copy straight away. The same trick works for states, not just values:
          in Fraction to Recurring Decimal, a remainder that repeats means the digits repeat from the position where that remainder
          first appeared.
        </p>
      </div>
      <Recipe
        name="Map from value to last position"
        when="the question involves distances between equal values, the first repeat, or a state that comes back."
        steps={[
          'Create an empty Map from value (or state) to index.',
          'For each index i: if the value is in the map, use i and the stored index (a distance, a window, a cycle start).',
          'Store i as the value\'s latest index, even if you just used the old one.',
        ]}
        why="for any value, its most recent earlier copy is the closest one, so keeping only the last index loses nothing."
        time="O(n)"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 4: Two-way mapping</h2>
        <p>
          "Can these letters be renamed into those?" is a question about a <b>one-to-one</b> correspondence. One map from left to
          right catches a letter that would need to become two different letters. It does not catch two letters that would both
          become the same letter: for that you need a second map from right to left. Isomorphic Strings, Word Pattern and Find and
          Replace Pattern all use this check. An equivalent trick is to rewrite each string as its <b>shape</b>, numbering letters in
          the order they first appear ("egg" becomes 0, 1, 1), and compare shapes.
        </p>
      </div>
      <Recipe
        name="Two maps, one per direction"
        when="two sequences must correspond one-to-one: same pattern, isomorphic, bijection."
        steps={[
          'If the two sequences have different lengths, they cannot match.',
          'Keep a forward map (left → right) and a backward map (right → left).',
          'For each pair (a, b): if a is already mapped to something other than b, or b is mapped back to something other than a, they do not match.',
          'Otherwise record both directions and continue.',
        ]}
        why="a one-to-one mapping means no left item has two images and no right item has two sources; each map checks one of those."
        time="O(n)"
        space="O(distinct items)"
      />

      <div className="prose">
        <h2>Pattern 5: Group by a key</h2>
        <p>
          To gather items that are "the same" under some rule, invent a <b>canonical key</b>: a value that equal items share and
          different items do not. Anagrams share their sorted letters. Cells in the same Sudoku box share 3 × floor(r / 3) +
          floor(c / 3). Points on the same line through an anchor share a reduced slope. Rows equal to a column share the same
          sequence of values. Once you have the key, one pass with a Map of lists (or counts) does the grouping.
        </p>
      </div>
      <Walkthrough
        title="Group Anagrams: sorted letters as the key"
        frames={anagrams.frames}
        caption="The key is chosen so that anagrams collide on purpose. Counting the 26 letters would work too, and avoids the sort."
      />
      <Recipe
        name="Group by a canonical key"
        when="items must be collected, counted or compared by a property rather than by identity."
        steps={[
          'Decide what makes two items equivalent, and design a key that captures exactly that.',
          'Make the key hashable by value: a string or a number, never a fresh array.',
          'For each item, compute its key and append the item (or add 1) to the map entry for that key.',
          'Read the groups or counts out of the map.',
        ]}
        why="equivalent items produce identical keys, so they meet in the same map entry without ever being compared with each other."
        time="O(n × key cost)"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 6: Build your own</h2>
        <p>
          Design HashMap asks you to implement the cloakroom yourself: an array of buckets, a hash (key modulo the number of
          buckets), and a short list of (key, value) pairs in each bucket. You will rarely need this in real code, but it is a
          common warm-up question, and it makes the costs above concrete. Designing good hash functions and handling collisions in
          depth is the subject of <See id="hash-function" />.
        </p>

        <h2>Worked example: Longest Consecutive Sequence</h2>
        <p>The problem asks for the longest run of consecutive integers in an unsorted array, in O(n) time.</p>
        <Step n={1}>Brute force first</Step>
        <p>
          Sorting puts runs next to each other, and one scan finds the longest: <Cost>O(n log n)</Cost>. That is a fine first
          answer, but the problem explicitly asks for O(n). Another brute force: for each value x, keep checking whether x + 1, x + 2,
          ... are in the array. With a set, each check is O(1), but on an input like 1, 2, ..., 100,000 you count the same run from
          every one of its values: <Cost>O(n²)</Cost>.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          Counting up from 3 in the run 1, 2, 3, 4 repeats work already done when counting up from 1. Only one starting point per
          run is useful: its smallest value.
        </p>
        <Step n={3}>Prove a rule</Step>
        <p>
          A value x is the start of a run exactly when x − 1 is not in the set. So: put every value in a set, and count upward only
          from values whose predecessor is missing. Every run is counted once, from its start.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          Each value is looked at once by the outer loop, and once more while some run counts through it. That is at most 2n set
          operations: <Cost>O(n)</Cost> time and <Cost>O(n)</Cost> space. Duplicates? Loop over the set, not the array. Empty input?
          The answer is 0. Negative numbers? Nothing changes.
        </p>
      </div>

      <div className="prose">
        <h2>Hash table, sorting or a plain array?</h2>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Situation</th>
            <th>Best tool</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Keys are letters or small integers</td>
            <td>Array indexed by the key</td>
            <td>No hashing, very fast, and the size is fixed (26 letters, values up to 10⁵).</td>
          </tr>
          <tr>
            <td>Arbitrary keys, need O(n) overall</td>
            <td>Map or Set</td>
            <td>O(1) average per lookup, with O(n) memory.</td>
          </tr>
          <tr>
            <td>O(1) extra memory required</td>
            <td>Sorting, then <See id="two-pointers" /></td>
            <td>Sorting can be done in place; hashing always needs extra memory.</td>
          </tr>
          <tr>
            <td>Need order: smallest key, next key above x</td>
            <td><See id="ordered-set" /> or a <See id="heap" /></td>
            <td>Hash tables do not keep keys in sorted order.</td>
          </tr>
          <tr>
            <td>Count subarrays with a given sum</td>
            <td><See id="prefix-sum" /> plus a Map</td>
            <td>The map holds counts of running sums: complement lookup on prefix sums.</td>
          </tr>
        </tbody>
      </TableWrap>

      <Pitfalls
        items={[
          <>Using an array or object as a Map key and expecting a lookup with an equal copy to find it. Maps compare objects by identity: build a string or number key.</>,
          <>Storing presence when you need a <b>count</b>. If equal values can come from different positions, each one may be a separate answer.</>,
          <>Inserting the current element before looking up its complement, so it pairs with itself.</>,
          <>Using a plain object for arbitrary keys: numbers become strings, and inherited names like "constructor" can already be there.</>,
          <>Forgetting that a hash table has no order. "The smallest key" needs a sort, a heap or an ordered set.</>,
          <>Reaching for a Map when a 26-element array would do. Both are O(1), but the array is simpler and faster.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Insert the keys 10, 3, 17, 24 and 5 into a table of 7 buckets using key mod 7. Which buckets have collisions?',
            solution: '10 → 3, 3 → 3, 17 → 3, 24 → 3, 5 → 5. Bucket 3 holds a chain of four keys (10, 3, 17, 24); bucket 5 holds 5. A poor spread: every key but one collides.',
          },
          {
            task: 'Run Two Sum with a map on [2, 7, 11, 15] and target 9. Write the map after each step.',
            solution: 'Step 0: need 7, not found, map {2: 0}. Step 1: need 2, found at 0. Answer: indices 0 and 1.',
          },
          {
            task: 'Design a key that groups strings that are rotations of each other, such as "abc", "bca" and "cab".',
            hint: 'Among all rotations of a string, pick one in a way that every rotation would agree on.',
            solution: 'Use the alphabetically smallest rotation as the key. All three strings above have key "abc".',
          },
          {
            task: 'Why does Isomorphic Strings need a second map? Give two strings that one map would wrongly accept.',
            solution: '"ab" and "cc": the forward map is a → c, b → c, which never conflicts, but two letters map to the same letter. The backward map catches c → a then c → b.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'What is the worst-case time of a single Map lookup, and when does it happen?',
            options: ['O(1), always', 'O(log n), when the map is large', 'O(n), when many keys collide into the same bucket', 'O(n log n), when the map resizes'],
            answer: 2,
            why: 'If all keys end up in one bucket, a lookup scans all of them. Built-in maps make this very unlikely, so the average is O(1).',
          },
          {
            q: 'You need the coordinates (r, c) as a Map key. Which works?',
            options: ['The array [r, c]', 'The string "r,c" built from the two numbers', 'An object { r, c }', 'Any of these'],
            answer: 1,
            why: 'Map compares arrays and objects by identity, so a freshly built [r, c] is a new key every time. A string (or r × columns + c) compares by value.',
          },
          {
            q: 'In Two Sum, why look up target − x before inserting x?',
            options: ['It is faster', 'So an element is never paired with itself', 'Because Map cannot hold duplicate keys', 'It does not matter'],
            answer: 1,
            why: 'With target 6 and x = 3, inserting first would find the 3 you just stored and pair it with itself.',
          },
          {
            q: 'Which problem needs counts rather than a plain set?',
            options: ['Contains Duplicate', '4Sum II', 'Find the Difference of Two Arrays', 'Longest Consecutive Sequence'],
            answer: 1,
            why: 'The same pair-sum can come from many index pairs, and each one is a separate tuple, so the map must store how many times each sum occurs.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          Start with the Core problems in each pattern. For every problem, say out loud what the key is and what the value is
          before you write anything: that one sentence usually is the solution.
        </p>
      </div>
      <ProblemSet id="hash-table" />

      <Recap>
        <ul>
          <li>A hash function turns a key into a bucket, so lookups skip the search: O(1) on average, O(n) if everything collides.</li>
          <li>Use Map and Set in TypeScript. Compound keys must be strings or numbers, because objects are compared by identity.</li>
          <li>Seen set, complement lookup, value to position, two-way mapping and group by key cover most hash table problems.</li>
          <li>The creative step is the key: design one that equal items share and different items do not.</li>
        </ul>
      </Recap>
    </>
  );
}
