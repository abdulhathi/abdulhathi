import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/counting';
import { anagramCounts, goodPairs, vowelContributions } from '../traces/counting';
import { Walkthrough } from '../viz/Walkthrough';

const anagram = anagramCounts('listen', 'silent');
const pairs = goodPairs([4, 7, 4, 4, 7, 2]);
const vowels = vowelContributions('nature');

export default function Counting() {
  return (
    <>
      <TopicIntro
        id="counting"
        time="3–4 hours, plus problems"
        before={['hash-table', 'string']}
        learn={[
          'When to replace the data by its counts, and when a 26-slot array beats a Map',
          'How to count pairs in one pass without listing them',
          'Working with "counts of counts": buckets by frequency, sorting frequencies',
          'Counting by contribution: summing over all n² substrings in O(n)',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          A shop assistant counting stock does not memorise the order in which boxes arrived. They keep a tally: 12 red, 7 blue,
          3 green. For many questions that tally is all you need. Can this note be cut out of that magazine? Are these two words
          anagrams? Which values are most common? None of these depend on order, so you can throw the order away and keep only{' '}
          <b>how many of each</b>.
        </p>
        <p>
          Counting turns comparisons between elements into arithmetic on counts. Comparing two words letter by letter in every
          possible arrangement is hopeless; comparing their 26 letter counts is <Cost>O(n)</Cost>. Counting pairs by checking every
          pair is <Cost>O(n²)</Cost>; adding up "how many earlier elements match this one" is <Cost>O(n)</Cost>. And summing a
          property over all substrings, which number about n²/2, becomes <Cost>O(n)</Cost> once you count how many substrings each
          character belongs to.
        </p>
      </div>

      <Walkthrough
        title="Anagram check with one table of counters"
        frames={anagram.frames}
        caption="Counting up for one word and down for the other means a single table, and a single check at the end: all zeros."
      />

      <Box kind="key" label="Key idea">
        <p>
          Before comparing elements with each other, ask whether the answer depends only on <b>how many of each</b> there are. If it
          does, count once and answer from the counts. If the question is about pairs or substrings, count how many partners or
          substrings each single element accounts for, rather than visiting the pairs or substrings themselves.
        </p>
      </Box>

      <div className="prose">
        <h2>When to use it</h2>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
        <p>
          A count table maps a value to how many times it has appeared. Choose its form by the range of values: a fixed array when
          the values are letters, digits or small integers; a Map when they can be anything.
        </p>
      </div>
      <Structures
        items={[
          { name: 'Fixed counter array', ts: 'new Array(26).fill(0)', ops: 'increment O(1); index by charCodeAt(i) − 97', use: 'Lowercase letters (26), digits (10), remainders (k), small bounded values.' },
          { name: 'Count map', ts: 'Map<number, number>', ops: 'get / set O(1) average', use: 'Arbitrary values, large ranges, or derived keys such as nums[i] − i.' },
          { name: 'Buckets by frequency', ts: 'array of lists, index = count', ops: 'O(n) to fill, O(n) to read in order', use: 'Ordering values by how often they appear without a full sort (Top K Frequent).' },
          { name: 'Set of counts', ts: 'Set<number>', ops: 'O(1) average', use: 'Checking whether frequencies are all different.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Frequency table</h2>
        <p>
          Count each value once, then answer from the table. To compare two collections, you do not need two tables: count the first
          one up and the second one down in the same table, and the collections match exactly when every counter returns to zero.
          A counter going negative means the second collection has something extra; a positive one means something is missing.
        </p>
      </div>
      <Recipe
        name="Frequency table"
        when="the answer depends on how many times each value appears, not on where."
        steps={[
          'Pick the table: an array of 26 (or 10, or k) for a small alphabet, otherwise a Map.',
          'Walk the data once, adding one to the counter of each value (and subtracting for a second collection you compare against).',
          'Answer from the table: all zeros, the first count of 1, the smallest ratio, the positive differences.',
        ]}
        why="counts keep exactly the information an order-free question needs, and building them is a single pass."
        time="O(n)"
        space="O(alphabet) or O(distinct values)"
      />

      <div className="prose">
        <h2>Pattern 2: Count pairs as you scan</h2>
        <p>
          "How many pairs i &lt; j satisfy something?" Checking all pairs is <Cost>O(n²)</Cost>. Instead, scan from left to right,
          and when element j arrives, add the number of earlier elements it pairs with. If the rule is "equal values", that number is
          simply the count of earlier copies. Many other rules can be turned into "equal keys" or "complementary keys" with a little
          algebra: j − i = nums[j] − nums[i] is the same as nums[i] − i = nums[j] − j, and a sum divisible by 60 means remainders
          that add up to 60.
        </p>
      </div>
      <Walkthrough
        title="Number of Good Pairs: add the earlier copies"
        frames={pairs.frames}
        caption={`Each element adds the number of earlier copies of itself. Total: ${pairs.pairs} pairs, found without looking at a single pair.`}
      />
      <Recipe
        name="Count pairs while scanning"
        when="you count pairs (i < j) whose rule can be written as equal keys or complementary keys."
        steps={[
          'Rewrite the rule so it compares a key of i with a key of j (value, remainder, value − index).',
          'Keep a count table of keys seen so far; answer = 0.',
          'For each element, compute the key its partner must have, and add that key\'s count to the answer.',
          'Then add the element\'s own key to the table.',
        ]}
        why="each pair is counted exactly once, at the moment its later element is reached."
        time="O(n)"
        space="O(distinct keys)"
      />
      <div className="prose">
        <p>
          Sometimes the complement is easier to count. In Count Number of Bad Pairs, the bad pairs have no neat key, but the good ones
          do. Count the good pairs and subtract them from the total number of pairs, n × (n − 1) / 2.
        </p>

        <h2>Pattern 3: Counts of counts</h2>
        <p>
          Some questions are about the frequencies themselves: the k most frequent values, values sorted by frequency, whether all
          frequencies differ, which values are cheapest to remove entirely. Count first, then treat the counts as your new data. A
          useful trick: a frequency is a whole number between 1 and n, so an array of n + 1 <b>buckets</b> indexed by frequency
          sorts the values by count in <Cost>O(n)</Cost>, with no comparison sort at all. That is bucket sort, which you will meet
          properly in <See id="linear-sorts" />.
        </p>
      </div>
      <Recipe
        name="Bucket values by frequency"
        when="you need values ordered by how often they occur, such as the top k."
        steps={[
          'Count every value in a map.',
          'Create n + 1 empty lists; put each value in the list at index equal to its count.',
          'Walk the lists from the highest index down, collecting values until you have what you need.',
        ]}
        why="counts are bounded by n, so they can index an array directly, which orders them without comparisons."
        time="O(n)"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 4: Counting by contribution</h2>
        <p>
          A string of 10⁵ letters has about 5 × 10⁹ substrings, so a question that sums something over all substrings cannot be
          answered by visiting them. Turn the sum around. Instead of "for each substring, how many vowels?", ask "for each vowel, how
          many substrings contain it?". A substring contains index i when it starts at or before i and ends at or after i: that is{' '}
          (i + 1) choices of start times (n − i) choices of end. This change of viewpoint, from the groups to the elements, is one of
          the most powerful counting ideas, and it shows up again with stacks in <See id="monotonic-stack" />.
        </p>
      </div>
      <Walkthrough
        title="Vowels of All Substrings: each vowel's share"
        frames={vowels.frames}
        caption={`The bracket shows the whole range a substring around the vowel can stretch over. Total: ${vowels.total}.`}
      />
      <Recipe
        name="Counting by contribution"
        when="the answer is a sum over all subarrays, substrings or pairs, and there are far too many to list."
        steps={[
          'Fix one element and describe the subarrays (or substrings) in which it counts.',
          'Count them with a formula: usually (choices of left end) × (choices of right end).',
          'Restrict the ends if the element only counts in some of them (no second copy of the letter, odd length only).',
          'Add the element\'s value times that count to the answer, for every element.',
        ]}
        why="every substring's total is the sum of its elements' shares, so adding each element's share over all substrings gives the same grand total."
        time="O(n), sometimes O(n) plus a precomputation"
        space="O(1) to O(n)"
      />

      <div className="prose">
        <h2>Worked example: Count Unique Characters of All Substrings</h2>
        <p>
          For every substring of a string, count the letters that appear exactly once in it, and add those numbers up. The string can
          have 10⁵ letters.
        </p>
        <Step n={1}>Brute force first</Step>
        <p>
          Generate every substring and count its unique letters: there are about n²/2 substrings, each up to n long, so{' '}
          <Cost>O(n³)</Cost>. Even with a running count per start position it is <Cost>O(n²)</Cost>, about 5 × 10⁹ steps. Too slow.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          The same letter at the same position is examined again in thousands of overlapping substrings. Its fate (unique or not) in
          a substring depends only on whether the substring also covers another copy of that letter.
        </p>
        <Step n={3}>Prove a rule</Step>
        <p>
          Take position i, and let p be the previous position of the same letter and q the next one (use −1 and n if there is none).
          The letter at i is unique in a substring exactly when the substring starts after p and ends before q. Starts: i − p
          choices. Ends: q − i choices. So position i contributes (i − p) × (q − i) to the answer.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          Recording each letter's positions takes one pass; summing the contributions takes another: <Cost>O(n)</Cost>. A letter that
          appears once has p = −1 and q = n, so it counts in (i + 1) × (n − i) substrings, matching the vowel formula. For "ABAB", the
          contributions are 1 × 2, 2 × 2, 2 × 2 and 2 × 1, totalling 12.
        </p>
      </div>

      <div className="prose">
        <h2>Array or Map for counting?</h2>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Values</th>
            <th>Use</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Lowercase letters, digits, remainders mod k</td>
            <td>Array of 26, 10 or k counters</td>
            <td>Fixed size, so O(1) space; no hashing; easy to compare two tables.</td>
          </tr>
          <tr>
            <td>Integers up to about 10⁶</td>
            <td>Array indexed by value</td>
            <td>Still direct, but costs memory proportional to the range, not to n.</td>
          </tr>
          <tr>
            <td>Large or negative integers, strings, derived keys</td>
            <td>Map</td>
            <td>Only the values that occur take space.</td>
          </tr>
          <tr>
            <td>Counts in a sliding range</td>
            <td>Array or Map, updated at both ends</td>
            <td>See <See id="sliding-window" />: add the entering element, remove the leaving one.</td>
          </tr>
        </tbody>
      </TableWrap>

      <Pitfalls
        items={[
          <>Counting pairs with both orders (i, j) and (j, i), then forgetting to halve. Scanning left to right and only looking back counts each pair once.</>,
          <>Counting cows in Bulls and Cows before removing the bulls, which counts the same digit twice.</>,
          <>Assuming equal sorted frequency lists mean two strings are close: the set of letters present must match too.</>,
          <>Using a Map for 26 letters out of habit. It works, but the array is simpler, faster, and makes "all zero?" a quick loop.</>,
          <>Overflow in other languages for sums like n²: in TypeScript, numbers are exact up to 2⁵³ ≈ 9 × 10¹⁵, which covers these problems.</>,
          <>Getting the contribution ranges off by one: a substring containing i has i + 1 possible starts, not i.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Count the good pairs in [2, 2, 2, 5, 5] by scanning and adding earlier copies. Check with the formula c × (c − 1) / 2.',
            solution: 'Scan: 0 + 1 + 2 + 0 + 1 = 4. Formula: three 2s give 3, two 5s give 1, total 4.',
          },
          {
            task: 'Song lengths 30, 20, 150, 100, 40. Which remainders mod 60 do you store, and how many pairs divisible by 60 are there?',
            solution: 'Remainders 30, 20, 30, 40, 40. Pairs: 30 with 30 (one pair), 20 with each 40 (two pairs). Total 3.',
          },
          {
            task: 'In the word "code", how many substrings contain the letter "o" at index 1?',
            solution: 'Starts at 0 or 1 (2 choices) times ends at 1, 2 or 3 (3 choices): 6 substrings.',
          },
          {
            task: 'Why is Top K Frequent with buckets O(n) and not O(n log n)?',
            solution: 'A frequency is at most n, so it can be used directly as an array index. Placing each value in its bucket and walking the buckets are both O(n); no comparison sort is needed.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'You count letters of s up and letters of t down in one table. Afterwards one counter is +2 and another is −2. What does that mean?',
            options: ['They are anagrams', 's has two extra of one letter, and t has two extra of another', 'The strings have different lengths', 'Nothing: only the sum matters'],
            answer: 1,
            why: 'A positive counter is a letter s has more of; a negative counter is a letter t has more of. Since the totals cancel, the lengths are equal, but they are not anagrams.',
          },
          {
            q: 'To count pairs i < j with nums[i] + nums[j] divisible by k, what should the count table hold?',
            options: ['Values seen so far', 'Remainders mod k seen so far', 'Indices seen so far', 'Sums of all pairs'],
            answer: 1,
            why: 'Divisibility of a sum depends only on the remainders, so a value with remainder r needs an earlier remainder (k − r) mod k.',
          },
          {
            q: 'How many substrings of a string of length n contain index i?',
            options: ['n', 'i × (n − i)', '(i + 1) × (n − i)', 'n × (n + 1) / 2'],
            answer: 2,
            why: 'The start can be any index from 0 to i (i + 1 choices) and the end any index from i to n − 1 (n − i choices).',
          },
          {
            q: 'Which data structure makes Top K Frequent Elements O(n)?',
            options: ['A balanced search tree', 'A max-heap of all values', 'An array of buckets indexed by frequency', 'A sorted array of values'],
            answer: 2,
            why: 'Frequencies are bounded by n, so they can index buckets directly; reading the buckets from the top gives the most frequent values.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          In each problem, decide first what you are counting (letters, values, remainders, keys, or contributions) and what the
          table's index is. The rest usually follows in a few lines of thought.
        </p>
      </div>
      <ProblemSet id="counting" />

      <Recap>
        <ul>
          <li>If order does not matter, keep counts: a 26-slot array for letters, a Map for anything else.</li>
          <li>Compare two collections in one table by counting one up and the other down.</li>
          <li>Count pairs while scanning: each element adds the number of earlier partners. Rewrite the rule as equal or complementary keys.</li>
          <li>Counts of counts: frequencies index buckets, which orders values by frequency in O(n).</li>
          <li>Counting by contribution turns a sum over n² substrings into a sum over n elements.</li>
        </ul>
      </Recap>
    </>
  );
}
