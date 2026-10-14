import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/combinatorics';
import { kthPermutation, pascal } from '../traces/combinatorics';
import { Walkthrough } from '../viz/Walkthrough';

const tri = pascal(6);
const rank = kthPermutation(4, 9);

export default function Combinatorics() {
  return (
    <>
      <TopicIntro
        id="combinatorics"
        time="5–6 hours, plus problems"
        before={['number-theory', 'recursion', 'binary-search']}
        learn={[
          'The sum and product rules, permutations and combinations, and when order matters',
          "Three ways to compute C(n, k): Pascal's triangle, a running product, and factorials with inverses modulo a prime",
          'Stars and bars, Catalan numbers, and finding the k-th arrangement without listing the others',
          'Inclusion–exclusion, usually combined with binary search on the answer',
          'The pigeonhole principle as a tool for proofs and for bounding loops',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          Combinatorics is counting without listing. A bicycle lock with four dials of ten digits has 10 × 10 × 10 × 10 = 10,000
          settings: you know that without writing them down, because each dial is an independent choice. Counting problems on
          LeetCode work the same way. When the answer is "return it modulo 10⁹ + 7", the objects are far too many to generate,
          so the solution must count them with a formula or a recurrence.
        </p>
        <p>
          The workhorse is the <b>binomial coefficient</b> C(n, k), "n choose k": the number of ways to choose k items from n
          when order does not matter. Pascal's triangle builds every one of them with nothing but additions: to choose k items
          from n, either the last item is in your selection (choose k − 1 from the other n − 1) or it is not (choose all k from
          the other n − 1).
        </p>
      </div>

      <Walkthrough
        title="Pascal's triangle: every C(n, k) from two numbers above it"
        frames={tri.frames}
        caption="Row 5 reads 1, 5, 10, 10, 5, 1: there are 10 ways to choose 2 items out of 5."
      />

      <div className="prose">
        <h2>The basic rules</h2>
        <p>
          Almost every count is built from four facts. The hard part is deciding which one applies, so for each problem ask
          two questions: <b>does order matter?</b> and <b>can an item be used more than once?</b>
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Situation</th>
            <th>Count</th>
            <th>Example</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Independent choices, one after another (product rule)</td><td>a × b × …</td><td>4 shirts and 3 trousers: 12 outfits</td></tr>
          <tr><td>Separate cases that cannot overlap (sum rule)</td><td>a + b + …</td><td>A path ends with a right move or a down move</td></tr>
          <tr><td>Arrange all n distinct items (order matters)</td><td>n!</td><td>3 books on a shelf: 6 orders</td></tr>
          <tr><td>Choose k of n, order matters, no repeats</td><td>n! / (n − k)!</td><td>Gold, silver, bronze among 8 runners: 336</td></tr>
          <tr><td>Choose k of n, order does not matter</td><td>C(n, k) = n! / (k! (n − k)!)</td><td>A team of 2 from 5 people: 10</td></tr>
          <tr><td>Arrange items with repeats (multinomial)</td><td>n! / (c₁! c₂! …)</td><td>Letters of "BOOK": 4! / 2! = 12</td></tr>
          <tr><td>Split n identical items into k groups (stars and bars)</td><td>C(n + k − 1, k − 1)</td><td>5 sweets among 3 children: C(7, 2) = 21</td></tr>
        </tbody>
      </TableWrap>

      <Box kind="key" label="Key idea">
        <p>
          Find a <b>description</b> that matches each object to exactly one simple choice, then count the choices. A grid path
          is "which of the moves are downs"; a sorted string is "how many of each letter"; a valid BST is "which value is the
          root, then two smaller trees". If two different objects map to the same description, or one object has two
          descriptions, the count will be wrong.
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
          { name: "Pascal's table", ts: 'number[][] (or one row reused)', ops: 'build O(n²) additions; lookup O(1)', use: 'C(n, k) for n up to a few thousand, modulo anything (even non-primes), with no multiplication or division.' },
          { name: 'Factorial and inverse factorial arrays', ts: 'bigint[] or number[] with care', ops: 'build O(n); C(n, k) in O(1)', use: 'C(n, k) and multinomials modulo a prime for n up to 10⁶.' },
          { name: 'Running product', ts: 'number', ops: 'O(k) for one C(n, k)', use: 'A single binomial coefficient whose true value fits in 2⁵³, such as Unique Paths.' },
          { name: 'Frequency array', ts: 'number[26] or Map<string, number>', ops: 'O(1) update', use: 'Letter counts for multinomials (anagrams, rearrangements).' },
          { name: 'BigInt', ts: 'bigint', ops: 'exact, slower', use: 'Products of two remainders modulo 10⁹ + 7, which exceed 2⁵³.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Binomial coefficients, three ways</h2>
        <p>Pick the method by the size of n and by whether you need an exact value or a remainder.</p>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Method</th>
            <th>Cost</th>
            <th>Use when</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Pascal's triangle</td><td>O(n²) time, O(n) space per row</td><td>n up to a few thousand; any modulus, even 10 or 2; additions only, so no overflow worries</td></tr>
          <tr><td>Running product: multiply by (n − k + i), divide by i, for i = 1 … k</td><td>O(k)</td><td>One exact value that fits in 2⁵³. After step i the value is C(n − k + i, i), a whole number, so every division is exact</td></tr>
          <tr><td>fact[n] × invFact[k] × invFact[n − k] mod p</td><td>O(n) once, then O(1)</td><td>Many queries modulo a prime p with n up to about 10⁶</td></tr>
        </tbody>
      </TableWrap>
      <Recipe
        name="Factorials and inverse factorials modulo a prime"
        when="you need many C(n, k) or multinomials modulo a prime p such as 10⁹ + 7."
        steps={[
          'fact[0] = 1, and fact[i] = fact[i − 1] × i mod p up to the largest n you need.',
          "invFact[n] = fact[n]^(p − 2) mod p, by fast power (Fermat's little theorem).",
          'Walk down: invFact[i − 1] = invFact[i] × i mod p. One fast power, then only multiplications.',
          'C(n, k) = fact[n] × invFact[k] × invFact[n − k] mod p, or 0 if k < 0 or k > n.',
        ]}
        why="division modulo a prime is multiplication by an inverse, and 1/(i − 1)! = i / i!, so one inverse gives them all."
        time="O(n + log p) to build, O(1) per query"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 2: Stars and bars</h2>
        <p>
          Five identical sweets for three children: write the sweets as stars and separate the children with two bars, for
          example ★★|★|★★ means 2, 1, 2. Every arrangement of 5 stars and 2 bars is one distribution and vice versa, so there
          are C(7, 2) = 21. In general, n identical items into k groups gives <b>C(n + k − 1, k − 1)</b>. The same idea counts
          non-decreasing sequences: a sorted vowel string is just how many of each vowel it contains. When groups have an upper
          limit, subtract the bad cases with inclusion–exclusion (Pattern 6).
        </p>

        <h2>Pattern 3: Ranking and unranking</h2>
        <p>
          "Return the k-th permutation" sounds like generating them in order. Instead, count: the permutations that start with
          the same digit form one contiguous block of (n − 1)!, so the block number tells you the first digit, and the
          remainder tells you where to look inside that block.
        </p>
      </div>
      <Walkthrough
        title="The 9th permutation of 1, 2, 3, 4"
        frames={rank.frames}
        caption={`Result: ${rank.result}. Each step skips a whole block of permutations at once.`}
      />
      <Recipe
        name="Unranking: find the k-th arrangement"
        when="the problem asks for the k-th arrangement in sorted order and you can count the arrangements that follow any prefix."
        steps={[
          'Convert k to a 0-based rank (rank = k − 1) if it is 1-based.',
          'At each position, try the possible next symbols in sorted order.',
          'For each symbol, count how many complete arrangements start with the current prefix plus that symbol.',
          'If rank is smaller than that count, choose the symbol; otherwise subtract the count from rank and try the next symbol.',
          'Repeat until the arrangement is complete.',
        ]}
        why="arrangements sharing a prefix are contiguous in sorted order, so skipping a whole block never skips the answer."
        time="O(length × alphabet) counts"
        space="O(length)"
      />

      <div className="prose">
        <h2>Pattern 4: Factorial formulas modulo a prime</h2>
        <p>
          Many "hard" counting problems reduce to a short formula once you find the right description. Count Anagrams is a
          product of multinomials. Pickup and Delivery is (2n)! / 2ⁿ, because each of the n pairs must appear in one of its two
          orders. Reordering an array to get the same BST is a product of binomials: the two subtrees keep their internal order
          but can be interleaved freely. The formula usually comes from one of two arguments:
        </p>
        <ul>
          <li><b>Symmetry:</b> count all arrangements, then divide by the number of equivalent ones (each pair has two orders, only one valid).</li>
          <li><b>Insertion:</b> build the object one piece at a time and count the ways to insert the new piece into a valid smaller object.</li>
        </ul>

        <h2>Pattern 5: Catalan numbers</h2>
        <p>
          Some objects split into two independent smaller objects around a root: a BST around its root value, a valid
          parentheses string around the partner of its first bracket, a polygon triangulation around the triangle on one edge.
          Then the count G(n) = Σ G(i) × G(n − 1 − i), whose values 1, 1, 2, 5, 14, 42, 132, … are the <b>Catalan numbers</b>,
          with the closed form C(2n, n) / (n + 1). When you see that recurrence, you can stop deriving and use the formula, or
          keep the O(n²) recurrence, which is just as easy to get right. More recurrences like this live in <See id="dp" />.
        </p>

        <h2>Pattern 6: Inclusion–exclusion</h2>
        <p>
          How many numbers from 1 to 30 are divisible by 2 or 3? Multiples of 2: 15. Multiples of 3: 10. But multiples of 6 were
          counted twice, so subtract them: 15 + 10 − 5 = 20. With three conditions, add the singles, subtract the pairs, add back
          the triple. Overlaps of "divisible by a" and "divisible by b" are the multiples of lcm(a, b) (see{' '}
          <See id="number-theory" />).
        </p>
        <p>
          The classic trick pairs this with <See id="binary-search" />: to find the n-th number with some property, count how
          many numbers up to x have it. That count never decreases as x grows, so binary search the smallest x whose count
          reaches n.
        </p>
      </div>
      <Recipe
        name="n-th number divisible by one of several values"
        when="you need the n-th number satisfying an OR of divisibility conditions, and n is too large to step through."
        steps={[
          'Write count(x) = number of values up to x that satisfy at least one condition, by inclusion–exclusion with LCMs.',
          'Set lo = 1 and hi = a value certainly large enough (for example n × the smallest divisor).',
          'While lo < hi: mid = the middle; if count(mid) ≥ n, set hi = mid, otherwise lo = mid + 1.',
          'lo is the answer: the smallest x with count(x) ≥ n, which must itself satisfy a condition.',
        ]}
        why="count increases by exactly 1 at each qualifying number, so the first x reaching n is the n-th one."
        time="O(2^m × log(hi)) for m conditions"
        space="O(1)"
      />

      <div className="prose">
        <h2>Pattern 7: The pigeonhole principle</h2>
        <p>
          Put n + 1 pigeons into n holes and some hole holds two. It sounds too obvious to be useful, but it proves things that
          bound your algorithm:
        </p>
        <ul>
          <li>A sequence whose next value depends only on a remainder modulo k must repeat within k + 1 steps. So a loop over remainders can stop after k steps (Smallest Integer Divisible by K).</li>
          <li>n numbers spread over a range leave n − 1 gaps that add up to the range, so the largest gap is at least the average. Buckets narrower than the average cannot contain the largest gap (Maximum Gap).</li>
          <li>A value filling half of the array must have two copies close together, so checking a small window is enough.</li>
        </ul>
      </div>

      <div className="prose">
        <h2>Worked example: Count All Valid Pickup and Delivery Options</h2>
        <Step n={1}>Brute force first</Step>
        <p>
          List all (2n)! orders of the 2n events and keep those where each delivery follows its pickup. For n = 500 that is
          1000! orders: impossible. The answer must come from counting.
        </p>
        <Step n={2}>Find a description</Step>
        <p>
          Look at one order's two events in any arrangement of all 2n events: they appear either as pickup-then-delivery or the
          reverse, and swapping them gives a different arrangement. So exactly half of all arrangements are valid for that
          order, and the pairs are independent.
        </p>
        <Step n={3}>The formula</Step>
        <p>
          (2n)! / 2ⁿ. An insertion argument gives the same: with i − 1 orders already placed (2i − 2 events), the new sequence
          has 2i positions, and the i-th pickup and delivery take two of them with the pickup first: C(2i, 2) = i(2i − 1) ways.
          Multiply over i.
        </p>
        <Step n={4}>Cost and edge cases</Step>
        <p>
          A loop of n multiplications, <Cost>O(n)</Cost>, reducing modulo 10⁹ + 7 each time. Each factor i(2i − 1) is below
          5 × 10⁵ here, so remainder × factor stays below 2⁵³; for a general product of two remainders you would need BigInt.
          For n = 1 the answer is 1.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Counting ordered arrangements when order does not matter (or the reverse). Decide this before writing any formula.</>,
          <>Computing n! exactly and then dividing: 19! already exceeds 2⁵³. Use Pascal's rule, a running product, or modular inverses.</>,
          <>Dividing remainders directly modulo p. Division needs an inverse; and it only exists modulo a prime (or when coprime to the modulus).</>,
          <>Forgetting the final adjustment, such as − 1 for "other than the original" or f(x) = 0 for negative x in stars and bars.</>,
          <>Mixing 0-based and 1-based ranks when unranking.</>,
          <>Using inclusion–exclusion with products a × b instead of LCMs when a and b share factors.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'How many paths go from the top-left to the bottom-right of a 4 × 5 grid of cells, moving only right or down?',
            solution: '3 downs and 4 rights: C(7, 3) = 35.',
          },
          {
            task: 'How many ways can 10 identical coins be shared among 4 people if everyone gets at least one?',
            hint: 'Give everyone one coin first.',
            solution: 'Distribute the remaining 6 freely among 4: C(6 + 3, 3) = C(9, 3) = 84.',
          },
          {
            task: 'Find the 17th permutation of 1, 2, 3, 4 by blocks.',
            solution: 'Rank 16. Blocks of 6: block 2, digit 3, rank 4. Blocks of 2 among {1, 2, 4}: block 2, digit 4, rank 0. Then 1, 2. Answer 3412.',
          },
          {
            task: 'How many numbers from 1 to 100 are divisible by 2, 3 or 5?',
            solution: '50 + 33 + 20 − 16 − 10 − 6 + 3 = 74.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'How many strings of length 3 made of the letters a, b, c are in non-decreasing order (like "abb" or "ccc")?',
            options: ['6', '10', '27', '20'],
            answer: 1,
            why: 'Stars and bars: 3 positions into 3 letter groups gives C(3 + 2, 2) = 10.',
          },
          {
            q: 'You need C(n, k) modulo 10 for n up to 1000. Which method is safest?',
            options: [
              'Factorials with Fermat inverses',
              "Pascal's triangle with additions modulo 10",
              'A running product with division',
              'Floating-point factorials',
            ],
            answer: 1,
            why: '10 is not prime, so Fermat inverses do not exist for every number; Pascal only adds.',
          },
          {
            q: 'Counting numbers up to x divisible by 4 or 6, what do you subtract?',
            options: ['⌊x / 24⌋', '⌊x / 12⌋', '⌊x / 2⌋', 'Nothing'],
            answer: 1,
            why: 'The overlap is the multiples of lcm(4, 6) = 12, not of 4 × 6.',
          },
          {
            q: 'Why does the loop in Smallest Integer Divisible by K never need more than k steps?',
            options: [
              'Because the answer is always less than k',
              'Because there are only k possible remainders, so within k steps one is 0 or they start repeating',
              'Because of Fermat\'s little theorem',
              'It does need more for large k',
            ],
            answer: 1,
            why: 'Pigeonhole: after a repeat the remainders cycle forever, so if 0 has not appeared in k steps it never will.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          The binomial and stars-and-bars problems are short once you see the description. Ranking problems reward careful
          index work. The inclusion–exclusion problems all follow the binary-search recipe above.
        </p>
      </div>
      <ProblemSet id="combinatorics" />

      <Recap>
        <ul>
          <li>Count, do not list: find a description that matches each object to exactly one simple choice.</li>
          <li>C(n, k) by Pascal (any modulus), by a running product (exact small values), or by factorials and inverse factorials (modulo a prime).</li>
          <li>Stars and bars for identical items into groups; Catalan numbers when objects split around a root.</li>
          <li>Unrank by skipping whole blocks; inclusion–exclusion with LCMs, usually inside a binary search.</li>
          <li>Pigeonhole proves that something repeats or that a gap is large, which bounds loops and justifies buckets.</li>
        </ul>
      </Recap>
    </>
  );
}
