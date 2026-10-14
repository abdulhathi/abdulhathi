import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/math';
import { fastPower, multiplyStrings, newtonSqrt } from '../traces/math';
import { Walkthrough } from '../viz/Walkthrough';

const power = fastPower(3, 13);
const root = newtonSqrt(150);
const product = multiplyStrings('123', '45');

export default function MathChapter() {
  return (
    <>
      <TopicIntro
        id="math"
        time="5–6 hours, plus problems"
        before={['complexity']}
        learn={[
          'How TypeScript numbers really behave: exact only up to 2⁵³, silent overflow, and when to reach for BigInt',
          'Digit tricks, school arithmetic on numbers too big for any type, and number bases',
          'Modular arithmetic and fast power, for every "return the answer modulo 10⁹ + 7"',
          'Integer square roots by binary search and Newton\'s method, and matrix powers for repeated linear steps',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          Math problems on LeetCode are rarely about advanced mathematics. They are about noticing structure that turns a slow loop
          into a formula or a short loop. Counting the trailing zeros of 10,000! looks impossible until you notice that only the
          factors of 5 matter. Computing 2 to the power 10⁹ looks like a billion multiplications until you notice that squaring
          doubles the exponent. Checking a palindrome number looks like a string job until you peel digits off with the remainder by
          10.
        </p>
        <p>
          The other half of the topic is respect for the number type. A correct idea gives a wrong answer if a product silently loses
          precision. Learn the limits once and you will avoid the most frustrating bug in competitive programming: the answer that
          is right for small tests and wrong for big ones.
        </p>
      </div>

      <div className="prose">
        <h2>How numbers work in TypeScript</h2>
        <p>
          TypeScript's <b>number</b> is a 64-bit floating-point value. It stores integers exactly only up to 2⁵³ − 1
          (Number.MAX_SAFE_INTEGER, about 9 × 10¹⁵). Beyond that, consecutive integers can no longer all be represented, and
          arithmetic silently rounds. There is no overflow error, ever. So when a problem says "assume a 32-bit environment" you must
          check the range yourself, and when two numbers near 10⁹ are multiplied (about 10¹⁸), the result is already inexact.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Fact</th>
            <th>What it means for you</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Exact integers up to 2⁵³ − 1</td><td>Sums and products below about 9 × 10¹⁵ are safe. A product of two values near 10⁹ is not.</td></tr>
          <tr><td>BigInt (written with an n suffix)</td><td>Exact at any size, but slower, and it cannot be mixed with number in one expression. Use it for products before taking a remainder.</td></tr>
          <tr><td>Division gives fractions</td><td>7 / 2 is 3.5. Use Math.floor for floor division of positives, and Math.trunc to round toward zero (what most other languages do for negatives).</td></tr>
          <tr><td>The remainder keeps the left side's sign</td><td>−7 mod 3 gives −1, not 2. For a true modulo, add the modulus and take the remainder again.</td></tr>
          <tr><td>Bitwise operators work on 32 bits</td><td>x | 0 truncates to a 32-bit signed integer; values above 2³¹ wrap. See <See id="bit-manipulation" />.</td></tr>
          <tr><td>Floating-point square roots and logs</td><td>Math.sqrt(n) can be off by a tiny amount; for exact integer answers, check the result by squaring it back.</td></tr>
        </tbody>
      </TableWrap>

      <Box kind="key" label="Key idea">
        <p>
          Before you code a math problem, write down the largest value any intermediate step can reach. Below 2⁵³: plain numbers are
          fine. Above it, even for a moment inside a product: use BigInt for that step, or restructure so it never gets that large.
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
          { name: 'Number', ts: 'number', ops: 'arithmetic O(1); exact to 2⁵³ − 1', use: 'Almost everything, as long as values stay below 9 × 10¹⁵.' },
          { name: 'Big integer', ts: 'bigint (10n, BigInt(x))', ops: 'arithmetic O(digits)', use: 'Products before a remainder, answers that exceed 2⁵³. Convert back with Number() when the result is small.' },
          { name: 'Digit array', ts: 'number[] (most significant first or last)', ops: 'index O(1)', use: 'Numbers with hundreds of digits, when the problem forbids converting them.' },
          { name: 'Matrix', ts: 'number[][] or bigint[][]', ops: 'multiply O(k³) for k × k', use: 'Linear rules applied many times; graph path counts; dot products.' },
          { name: 'Sparse vector', ts: 'Array of [index, value] pairs, or Map<number, number>', ops: 'O(non-zeros)', use: 'Vectors and matrices that are mostly zeros.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Digits</h2>
        <p>
          The last digit of a non-negative n is n mod 10, and dividing by 10 and rounding down removes it. Looping until n reaches 0
          visits every digit from the right, in O(number of digits) = <Cost>O(log n)</Cost>. To build a number from digits, go the
          other way: result = result × 10 + digit. Reversing, checking palindromes and summing digits are all this loop. The one thing
          to watch is the rebuild step, where result × 10 is where overflow happens.
        </p>
      </div>
      <Recipe
        name="Peel and rebuild digits"
        when="you need the digits of an integer: reverse it, sum them, compare halves."
        steps={[
          'Handle the sign first and work with the absolute value.',
          'While n > 0: digit = n mod 10; then n = floor(n / 10).',
          'To rebuild, result = result × 10 + digit. Before that step, check that result is at most (limit − digit) / 10 if a range is given.',
          'Reapply the sign at the end.',
        ]}
        why="each step removes exactly one decimal digit, so the loop runs once per digit."
        time="O(log n)"
        space="O(1)"
      />

      <div className="prose">
        <h2>Pattern 2: Big numbers by hand</h2>
        <p>
          When numbers are given as strings with hundreds of digits and you may not convert them, do what you learned at school.
          Addition walks both numbers from the right with a carry. Multiplication is neater than it looks: digit i of the first
          number times digit j of the second always lands in result positions i + j and i + j + 1, so one array of m + n slots holds
          the whole computation.
        </p>
      </div>
      <Walkthrough
        title="Multiply Strings: 123 × 45 in one array of slots"
        frames={product.frames}
        caption={`Green is the slot just written, amber is where the carry went. Result: ${product.product}.`}
      />
      <Recipe
        name="School arithmetic on digit strings"
        when="the inputs are numbers as strings or digit arrays and converting them is forbidden or impossible."
        steps={[
          'Work from the least significant digit (the right end).',
          'For addition, add the two digits and the carry; keep the remainder by 10 and carry the rest.',
          'For multiplication, add digit × digit into slot i + j + 1 of an array of m + n zeros, keep that slot below 10 and push the carry into slot i + j.',
          'Continue while digits or a carry remain, then remove leading zeros (keeping a single 0 if everything is zero).',
        ]}
        why="it is exactly the place-value arithmetic you do on paper, which works for any number of digits."
        time="O(m + n) to add, O(m · n) to multiply"
        space="O(m + n)"
      />

      <div className="prose">
        <h2>Pattern 3: Modular arithmetic and fast power</h2>
        <p>
          "Return the answer modulo 10⁹ + 7" means the true answer is enormous and you only need its remainder. The good news:
          remainders can be taken at every step. (a + b) mod m = ((a mod m) + (b mod m)) mod m, and the same holds for
          multiplication. Subtraction needs care: add m before the final remainder so the result is not negative. Division is
          different and needs a modular inverse, covered in <See id="number-theory" />.
        </p>
        <p>
          The trap in TypeScript: two remainders below 10⁹ + 7 multiply to about 10¹⁸, beyond 2⁵³. Do that multiplication in BigInt,
          then reduce.
        </p>
        <p>
          <b>Fast power</b> (exponentiation by squaring) computes xⁿ in about 2 log₂ n multiplications. Write n in binary. xⁿ is the
          product of x^(2ᵏ) for every bit k that is set, and each x^(2ᵏ) is the square of the previous one.
        </p>
      </div>
      <Walkthrough
        title="3¹³ by squaring: read 13 = 1101 in binary from the right"
        frames={power.frames}
        caption={`The base walks through 3, 3², 3⁴, 3⁸ by squaring, and the result picks up the ones whose bit is 1: 3¹³ = 3⁸ × 3⁴ × 3¹ = ${power.result}.`}
      />
      <Recipe
        name="Fast power modulo m"
        when="you need xⁿ, or xⁿ mod m, with n large (an exponent, a repeat count, a number of rounds)."
        steps={[
          'result = 1, base = x mod m.',
          'While n > 0: if the lowest bit of n is 1, result = result × base mod m.',
          'Square the base (base = base × base mod m) and halve n, rounding down.',
          'Return result. In TypeScript, do the multiplications in BigInt when m is around 10⁹.',
        ]}
        why="each round handles one binary digit of n, and squaring turns x^(2ᵏ) into x^(2ᵏ⁺¹)."
        time="O(log n)"
        space="O(1)"
      />

      <div className="prose">
        <h2>Pattern 4: Square roots</h2>
        <p>
          "Largest r with r² ≤ x" is a condition that is true for small r and false for large r, so <b>binary search on the answer</b>{' '}
          finds it in about log₂ x steps (more in <See id="binary-search" />). <b>Newton's method</b> is faster still: from a guess r,
          the true root lies between r and x / r, so their average is a better guess. With integers, repeat
          r ← floor((r + floor(x / r)) / 2) starting from r = x until r² ≤ x. Once the guess is close, each step roughly doubles the
          number of correct digits.
        </p>
      </div>
      <Walkthrough
        title="Newton's method for the integer square root of 150"
        frames={root.frames}
        caption={`${root.frames.length - 2} updates from 150 down to ${root.root}. Far from the root each update roughly halves the guess; close to it, the error shrinks very fast.`}
      />
      <Recipe
        name="Integer square root"
        when="you need floor(√x), a perfect-square test, or any largest k with k² (or k(k + 1) / 2) ≤ n, without floating point."
        steps={[
          'Binary search: lo = 0, hi = x. Test mid × mid against x; keep the largest mid that fits.',
          'Or Newton: r = x; while r × r > x, set r = floor((r + floor(x / r)) / 2).',
          'Return r. For a perfect-square test, check whether r × r equals x.',
        ]}
        why="the guesses decrease toward the root and never drop below it, so the loop stops exactly at floor(√x)."
        time="O(log x)"
        space="O(1)"
      />

      <div className="prose">
        <h2>Pattern 5: Counting with formulas</h2>
        <p>
          Many "count" questions have a closed form. The numbers 1 to n add up to n(n + 1) / 2 (pair the first with the last). The
          multiples of k up to n number floor(n / k). And a count over a range [low, high] is always count(high) − count(low − 1).
          When a loop up to n would be too slow (n = 10⁹), look for the formula.
        </p>
      </div>
      <Recipe
        name="Replace a counting loop with a formula"
        when="you are asked how many numbers in a range have a simple property, or for a sum of a regular sequence."
        steps={[
          'Write count(x): how many numbers from 1 (or 0) to x have the property. Try small x by hand to find the pattern.',
          'Answer a range as count(high) − count(low − 1).',
          'For sums of 1..n use n(n + 1) / 2; for factors of p in n!, add floor(n / p) + floor(n / p²) + ...',
          'Check the formula against a brute force on small inputs.',
        ]}
        why="the formula counts the same set as the loop, in constant or logarithmic time."
        time="O(1) or O(log n)"
        space="O(1)"
      />

      <div className="prose">
        <h2>Pattern 6: Number bases</h2>
        <p>
          Converting n to base b repeats "digit = n mod b, n = floor(n / b)", producing digits from the right. Parsing goes the other
          way: result = result × b + digit, reading from the left. Spreadsheet column titles are the famous twist: A to Z mean 1 to 26
          and there is no zero digit, so subtract 1 before each remainder.
        </p>
      </div>
      <Recipe
        name="Convert to and from a base"
        when="a number has to be written in another base, or a string of digits read as a number."
        steps={[
          'To write n in base b: while n > 0, take n mod b as the next digit from the right, then set n = floor(n / b).',
          'If the digits run from 1 to b (no zero), subtract 1 from n before each remainder.',
          'To read a string: result = 0, then for each digit from the left, result = result × b + its value.',
        ]}
        why="each position is worth b times the position to its right."
        time="O(log n)"
        space="O(log n) for the digits"
      />

      <div className="prose">
        <h2>Pattern 7: Linear algebra</h2>
        <p>
          A few LeetCode problems use vectors and matrices directly. The <b>dot product</b> of two vectors multiplies matching entries
          and adds them. When vectors are mostly zeros, store only the non-zero (index, value) pairs and merge two such lists by index.
          A <b>matrix product</b> C = A × B sets C[i][j] to the dot product of row i of A and column j of B: <Cost>O(n³)</Cost> for n × n
          matrices, much less if you skip zeros.
        </p>
        <p>
          The powerful idea is the <b>matrix power</b>. If one step of a process is a fixed linear rule (new values are fixed
          combinations of old values), the rule is a matrix, and t steps is that matrix to the power t. Fast power works on matrices
          because multiplication is associative, so t = 10⁹ steps cost about 30 matrix multiplications. Fibonacci is the classic: the
          pair (F(n + 1), F(n)) comes from (F(n), F(n − 1)) by the 2 × 2 matrix with rows (1, 1) and (1, 0).
        </p>
        <p>
          <b>Gaussian elimination</b> solves a system of linear equations: use one equation to eliminate a variable from all the others,
          repeat, then substitute back. It costs <Cost>O(n³)</Cost> for n equations. On LeetCode you mostly meet the one-variable case:
          collect the x terms and constants on each side and solve a·x = c.
        </p>
      </div>
      <Recipe
        name="Matrix power for a repeated linear step"
        when="a small state (k numbers) is updated by the same linear rule t times, and t is huge."
        steps={[
          'Write the state as a vector of k numbers.',
          'Build a k × k matrix whose row i says how new value i is made from the old values.',
          'Raise the matrix to the power t with fast power, reducing entries modulo m if asked.',
          'Multiply the starting vector by the result and read off the answer.',
        ]}
        why="applying the rule t times is multiplying by the matrix t times, and matrix multiplication can be grouped any way, so squaring works."
        time="O(k³ log t)"
        space="O(k²)"
      />

      <div className="prose">
        <h2>Worked example: Factorial Trailing Zeroes</h2>
        <Step n={1}>Brute force first</Step>
        <p>
          Compute n!, then count its trailing zeros. For n = 10⁴, n! has more than 35,000 digits. Even with BigInt that is slow, and
          plain numbers cannot hold it exactly at all.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          You do not need n!, only how many times 10 divides it. 10 = 2 × 5, so count the pairs of a 2 and a 5 among all the factors
          of 1 × 2 × ... × n. Even numbers supply far more 2s than multiples of 5 supply 5s, so the 5s decide.
        </p>
        <Step n={3}>Find the rule</Step>
        <p>
          Every multiple of 5 contributes one 5: floor(n / 5) of them. Every multiple of 25 contributes a second one: floor(n / 25)
          more. Then 125, 625 and so on. The answer is floor(n/5) + floor(n/25) + floor(n/125) + ..., which you get by dividing n by 5
          repeatedly and adding the quotients.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          The loop runs log₅ n times: <Cost>O(log n)</Cost>, exactly what the follow-up asks for. n = 0 or 4 gives 0. n = 25 gives
          5 + 1 = 6, and 25! does end in six zeros.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Multiplying two values near 10⁹ in plain numbers: the product exceeds 2⁵³ and is silently rounded. Use BigInt for that step.</>,
          <>Taking a remainder of a negative number and getting a negative result. For a true modulo use ((a mod m) + m) mod m.</>,
          <>Using a floating-point Math.sqrt or Math.log for an exact integer answer without checking it by multiplying back.</>,
          <>Forgetting to reduce modulo m after every multiplication, so intermediate values grow without bound.</>,
          <>Dividing modulo m by plain division. It is wrong: you need a modular inverse.</>,
          <>Expecting 32-bit overflow to happen by itself in TypeScript. It never does; check the range when the problem asks for it.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Compute 2¹⁰ by fast power. Write the exponent in binary, and list the base and the result after each bit.',
            solution: '10 is 1010. Bit 0 is 0: result 1, base becomes 4. Bit 1 is 1: result 4, base 16. Bit 2 is 0: result 4, base 256. Bit 3 is 1: result 4 × 256 = 1024.',
          },
          {
            task: 'What is (−17) mod 5 in TypeScript, and how do you get the mathematical answer 3?',
            solution: 'The remainder gives −2, keeping the sign of −17. Add 5 and take the remainder again: (−2 + 5) mod 5 = 3.',
          },
          {
            task: 'How many trailing zeros does 100! have?',
            solution: 'floor(100/5) + floor(100/25) = 20 + 4 = 24.',
          },
          {
            task: 'Convert 703 to a spreadsheet column title.',
            hint: 'Subtract 1 before every remainder.',
            solution: '703 − 1 = 702, 702 mod 26 = 0 → A, n = 27. 27 − 1 = 26, 26 mod 26 = 0 → A, n = 1. 1 − 1 = 0 → A. Title: AAA.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'You multiply two numbers, each just under 10⁹ + 7, as plain TypeScript numbers. What goes wrong?',
            options: ['It throws an overflow error', 'The product exceeds 2⁵³ and is silently rounded', 'Nothing: numbers are 64-bit integers', 'It becomes Infinity'],
            answer: 1,
            why: 'The product is about 10¹⁸, past the 9 × 10¹⁵ limit for exact integers, so low digits are lost without any warning.',
          },
          {
            q: 'How many multiplications does fast power need for x to the power 1,000,000?',
            options: ['About 1,000,000', 'About 1,000', 'About 40', 'Exactly 6'],
            answer: 2,
            why: 'About 2 × log₂(10⁶) ≈ 40: one squaring per bit and at most one extra multiplication per set bit.',
          },
          {
            q: 'Which expression counts the multiples of 3 in the range [low, high]?',
            options: ['floor(high / 3) − floor(low / 3)', 'floor(high / 3) − floor((low − 1) / 3)', '(high − low) / 3', 'floor((high − low + 1) / 3)'],
            answer: 1,
            why: 'count(high) − count(low − 1), where count(x) = floor(x / 3). The other options are off by one at the boundaries.',
          },
          {
            q: 'Why can a matrix be raised to a huge power with fast power?',
            options: ['Because matrices commute', 'Because matrix multiplication is associative, so the products can be grouped as squarings', 'Because matrices are always square', 'Because the entries are small'],
            answer: 1,
            why: 'Fast power only needs grouping: M⁸ = ((M²)²)². That works for any associative operation, including matrix multiplication.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          For every problem, write down the largest intermediate value before you start: it tells you whether plain numbers are enough.
          Primes, GCD and modular inverses come later, in <See id="number-theory" />; counting arrangements is in <See id="combinatorics" />.
        </p>
      </div>
      <ProblemSet id="math" />

      <Recap>
        <ul>
          <li>TypeScript numbers are exact only up to 2⁵³ − 1 and never overflow loudly: check ranges yourself and use BigInt for big products.</li>
          <li>Peel digits with mod 10 and divide by 10; rebuild with × 10 + digit; do school arithmetic on digit arrays when numbers are huge.</li>
          <li>Reduce modulo m after every step, keep subtraction non-negative, and compute powers by squaring in O(log n).</li>
          <li>Integer roots come from binary search or Newton's method; counts come from formulas; repeated linear steps come from matrix powers.</li>
        </ul>
      </Recap>
    </>
  );
}
