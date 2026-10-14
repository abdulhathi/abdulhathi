import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/number-theory';
import { euclid, fastPow, sieve } from '../traces/number-theory';
import { Walkthrough } from '../viz/Walkthrough';

const gcdRun = euclid(252, 105);
const sieveRun = sieve(30);
const powRun = fastPow(3, 13, 1000);

export default function NumberTheory() {
  return (
    <>
      <TopicIntro
        id="number-theory"
        time="5–6 hours, plus problems"
        before={['math', 'bit-manipulation', 'hash-table']}
        learn={[
          "The Euclidean algorithm for GCD, why it is fast, and how LCM follows from it",
          "Bézout's identity: which amounts you can build from steps of size a and b",
          'Primes: trial division, the sieve of Eratosthenes, and factorising with a smallest-prime-factor table',
          "Modular arithmetic: fast power, modular inverses with Fermat's little theorem, and Euler's totient",
          'How to keep exact answers in TypeScript when products pass 2⁵³',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          Number theory studies whole numbers: what divides what, which numbers are prime, and what happens to remainders. In
          coding problems it rarely needs deep mathematics. Almost every problem uses one of four tools: the{' '}
          <b>greatest common divisor</b>, <b>primes and factors</b>, <b>divisor pairs</b> and <b>arithmetic modulo m</b>.
          Each tool replaces a slow search with a short calculation.
        </p>
        <p>
          Picture a floor of 252 by 105 tiles that you want to cover with identical square slabs, as large as possible. A slab
          side must divide both 252 and 105, so you want their greatest common divisor. Trying every size from 105 downwards
          works but is slow for numbers near 10⁹. Euclid noticed something better 2,300 years ago: cut the largest possible
          squares of side 105 off the 252 side, and the leftover strip, 105 by 42, needs exactly the same slab. Keep cutting
          until nothing is left over.
        </p>
      </div>

      <Walkthrough
        title="Euclid's algorithm on 252 and 105"
        frames={gcdRun.frames}
        caption={`gcd(252, 105) = ${gcdRun.gcd}. Three divisions instead of trying 105 candidate divisors.`}
      />

      <div className="prose">
        <p>
          Why so fast? After two steps the first number has at least halved: either b is already at most half of a, or the
          remainder a mod b = a − b is less than half of a. So Euclid needs <Cost>O(log min(a, b))</Cost> divisions, about 90
          even for numbers near 10¹⁸.
        </p>
      </div>

      <Box kind="key" label="Key idea">
        <p>
          gcd(a, b) = gcd(b, a mod b), and gcd(a, 0) = a. A number divides both a and b exactly when it divides both b and the
          remainder, so every step keeps the same set of common divisors while making the numbers smaller.
        </p>
      </Box>

      <div className="prose">
        <h2>When to use it</h2>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
        <p>
          Most number-theory solutions need only integers. The care goes into choosing the right integer type and keeping
          values small.
        </p>
      </div>
      <Structures
        items={[
          { name: 'Safe integer', ts: 'number', ops: 'exact up to 2⁵³ − 1 ≈ 9 × 10¹⁵', use: 'Counts, GCDs, values up to 10⁹, and sums of them. Check with Number.isSafeInteger when unsure.' },
          { name: 'Big integer', ts: 'bigint (10n, BigInt(x))', ops: 'exact at any size; slower than number', use: 'Multiplying two remainders modulo 10⁹ + 7 (the product is about 10¹⁸), and fast power with such products.' },
          { name: 'Sieve table', ts: 'Uint8Array(n + 1)', ops: 'build O(n log log n); lookup O(1)', use: 'Answering "is k prime?" for every k up to 10⁷. A typed array is about eight times smaller than an array of booleans.' },
          { name: 'Smallest prime factor table', ts: 'Int32Array(n + 1)', ops: 'build O(n log log n); factorise k in O(log k)', use: 'Factorising many numbers below a fixed limit quickly.' },
          { name: 'Hash map / set', ts: 'Map<number, number>, Set<number>', ops: 'O(1) average', use: 'Counting how often each prime or value appears; collecting distinct prime factors.' },
          { name: 'Union-find', ts: 'Int32Array parent + size', ops: 'near O(1) per union and find', use: 'Grouping numbers that share prime factors (see the union-find chapter).' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: GCD and the Euclidean algorithm</h2>
        <p>
          Use the GCD whenever something must divide several values at once: the largest tile, the largest group size, the
          longest repeating unit of two strings. The GCD of a whole list is found by folding: gcd(a, b, c) = gcd(gcd(a, b), c),
          and you can stop the moment it reaches 1.
        </p>
      </div>
      <Recipe
        name="Euclidean algorithm"
        when="you need the largest number dividing two (or more) values, or need to reduce a fraction to lowest terms."
        steps={[
          'Take the pair (a, b) with both values non-negative.',
          'While b is not 0, replace the pair by (b, a mod b).',
          'When b is 0, a is the GCD.',
          'For a list, fold: start with the first value and take the GCD with each next value, stopping early at 1.',
        ]}
        why="each step keeps exactly the same common divisors, and the numbers at least halve every two steps."
        time="O(log min(a, b))"
        space="O(1)"
      />
      <div className="prose">
        <p>
          A reduced fraction p/q is p/g over q/g with g = gcd(p, q). That is how you compare slopes or ratios exactly without
          floating point, an idea you will use for "points on a line" in <See id="geometry" />.
        </p>

        <h2>Pattern 2: Bézout's identity and the extended Euclidean algorithm</h2>
        <p>
          Which totals can you build by adding and subtracting copies of a and b? With 6 and 9 you get 3 (= 9 − 6), 6, 9, 12, …
          but never 4. <b>Bézout's identity</b> says the combinations x·a + y·b (x and y any integers) are exactly the multiples
          of gcd(a, b). So "can I reach k?" becomes "does gcd(a, b) divide k?". It extends to any number of values: the
          combinations are the multiples of the GCD of all of them.
        </p>
        <p>
          The <b>extended Euclidean algorithm</b> also finds the x and y. Run Euclid, remember the quotients, then substitute
          back. For 5 and 3: 5 = 1 × 3 + 2, 3 = 1 × 2 + 1. Going back, 1 = 3 − 1 × 2 = 3 − 1 × (5 − 3) = 2 × 3 − 1 × 5. That
          also shows that 2 is the inverse of 3 modulo 5, because 2 × 3 leaves remainder 1. Extended Euclid gives modular
          inverses for any modulus coprime to the number, not only primes.
        </p>
      </div>
      <Recipe
        name="Extended Euclidean algorithm"
        when="you need integers x and y with x·a + y·b = gcd(a, b), or the inverse of a modulo m when gcd(a, m) = 1."
        steps={[
          'If b is 0, the answer is gcd = a with x = 1 and y = 0.',
          'Otherwise solve the smaller problem for (b, a mod b) and get gcd, x′ and y′ with x′·b + y′·(a mod b) = gcd.',
          'Since a mod b = a − ⌊a / b⌋·b, rearrange: x = y′ and y = x′ − ⌊a / b⌋·y′.',
          'For an inverse of a modulo m: run it on (a, m); if the gcd is 1, x (made non-negative by adding m) is the inverse.',
        ]}
        why="every remainder is itself a combination of a and b, so the final remainder, the GCD, is one too."
        time="O(log min(a, b))"
        space="O(log) for the recursion, O(1) if written as a loop"
      />

      <div className="prose">
        <h2>Pattern 3: LCM</h2>
        <p>
          The least common multiple is the first time two cycles line up: buses every 6 and 10 minutes meet every 30 minutes.
          It follows from the GCD: <b>lcm(a, b) = a / gcd(a, b) × b</b>. Divide first: a × b can overflow when the LCM itself
          would fit. For a list, fold just like the GCD, and stop if it grows past whatever bound the problem cares about.
        </p>

        <h2>Pattern 4: Primes and the sieve</h2>
        <p>
          A number is prime when its only divisors are 1 and itself; 1 is not prime. To test one number n, try divisors up to
          √n: if n = d × e with d ≤ e, then d ≤ √n, so a divisor larger than √n always has a partner below it. That costs{' '}
          <Cost>O(√n)</Cost>. To find all primes up to n, test nothing; cross out instead.
        </p>
      </div>
      <Walkthrough
        title="Sieve of Eratosthenes up to 30"
        frames={sieveRun.frames}
        caption={`Primes up to 30: ${sieveRun.primes.join(', ')}. Only 2, 3 and 5 needed to cross anything out, because 7² = 49 > 30.`}
      />
      <Recipe
        name="Sieve of Eratosthenes"
        when="you need many primality answers, or all primes, below a limit of up to about 10⁷."
        steps={[
          'Make a table for 0 … n, marking everything as "maybe prime"; mark 0 and 1 as not prime.',
          'For p = 2, 3, … while p × p ≤ n: if p is still marked, it is prime. Mark p × p, p × p + p, p × p + 2p, … up to n as not prime.',
          'Everything still marked is prime.',
        ]}
        why="every composite number has a prime factor no larger than its square root, so it gets crossed out by that prime."
        time="O(n log log n)"
        space="O(n)"
      />
      <div className="prose">
        <p>
          Starting at p² rather than 2p is safe: a multiple k × p with k &lt; p has a smaller prime factor and is already
          crossed out. For trial division of a single number you can also skip even divisors after 2, or test only 2, 3 and
          numbers of the form 6k ± 1.
        </p>

        <h2>Pattern 5: Divisors and prime factorisation</h2>
        <p>
          Divisors come in pairs: if d divides n, so does n / d, and one of the two is at most √n. So listing every divisor costs{' '}
          <Cost>O(√n)</Cost>, and the small ones come out in increasing order while their partners come out in decreasing order.
          A perfect square pairs √n with itself, so count it once.
        </p>
        <p>
          Every integer above 1 is a product of primes in exactly one way, for example 360 = 2³ × 3² × 5. From the exponents
          you can read off many facts without listing anything: the number of divisors is (3 + 1)(2 + 1)(1 + 1) = 24, and two
          numbers share a factor greater than 1 exactly when they share a prime. To factorise one number, divide out 2, 3, 4, …
          while d × d ≤ what is left; any remainder above 1 is a prime. To factorise many numbers below a limit, build a{' '}
          <b>smallest prime factor</b> table with a sieve (for each prime p, write p into every multiple that has no entry yet),
          then factorise k by dividing by its smallest prime factor again and again, in <Cost>O(log k)</Cost> steps.
        </p>
      </div>
      <Recipe
        name="Factorise by trial division"
        when="you need the prime factors of one number, or of a few numbers up to about 10¹²."
        steps={[
          'Let m = n. For d = 2, 3, 4, … while d × d ≤ m:',
          'While d divides m, record d as a prime factor and divide m by d.',
          'After the loop, if m is greater than 1, it is a prime factor too (the one larger than √n).',
        ]}
        why="by the time d reaches a composite number, all its prime factors have already been divided out, so only primes are recorded."
        time="O(√n)"
        space="O(1) besides the output"
      />

      <div className="prose">
        <h2>Pattern 6: Modular arithmetic and fast power</h2>
        <p>
          "Return the answer modulo 10⁹ + 7" means: the true answer is huge, so report its remainder. Remainders behave well
          under addition, subtraction and multiplication: (a + b) mod m = ((a mod m) + (b mod m)) mod m, and the same for ×. So
          you can reduce after every operation and never hold a large number. Two warnings for TypeScript:
        </p>
        <ul>
          <li>
            <b>Subtraction</b> can go negative, and the % operator keeps the sign: −3 % 7 is −3. Add m before reducing:
            ((a − b) % m + m) % m.
          </li>
          <li>
            <b>Multiplication</b> of two remainders near 10⁹ gives about 10¹⁸, above 2⁵³ ≈ 9 × 10¹⁵, so a plain number silently
            loses its last digits. Do that product with BigInt (or split one factor into high and low halves).
          </li>
        </ul>
        <p>
          Division does not work directly. Instead, multiply by the <b>modular inverse</b>: the number a⁻¹ with a × a⁻¹ ≡ 1
          (mod m). When m is a prime p, <b>Fermat's little theorem</b> says a^(p − 1) ≡ 1 for every a not divisible by p, so
          a^(p − 2) is the inverse. Check: modulo 7, 3⁵ = 243 leaves remainder 5, and 3 × 5 = 15 leaves remainder 1.
        </p>
        <p>
          For a modulus that is not prime, <b>Euler's totient</b> φ(n) counts the numbers from 1 to n that are coprime to n:
          φ(n) = n × (1 − 1/p₁)(1 − 1/p₂)… over the distinct primes of n. For example φ(12) = 12 × ½ × ⅔ = 4 (namely 1, 5, 7,
          11). <b>Euler's theorem</b> generalises Fermat: a^φ(n) ≡ 1 (mod n) whenever gcd(a, n) = 1, which lets you shrink
          enormous exponents modulo φ(n).
        </p>
        <p>
          All of this needs <b>fast power</b>: computing a^e with about 2 log₂ e multiplications instead of e.
        </p>
      </div>
      <Walkthrough
        title="Fast power: 3¹³ mod 1000"
        frames={powRun.frames}
        caption={`13 = 8 + 4 + 1 in binary, so 3¹³ = 3⁸ × 3⁴ × 3¹. Result: ${powRun.result}.`}
      />
      <Recipe
        name="Fast power (binary exponentiation)"
        when="you need a^e mod m for a large exponent, including modular inverses a^(p − 2) mod p."
        steps={[
          'Set result = 1 and reduce the base modulo m.',
          'While e > 0: if the lowest bit of e is 1, multiply result by the base (mod m).',
          'Square the base (mod m) and halve e, dropping its lowest bit.',
          'When e reaches 0, result holds a^e mod m.',
        ]}
        why="the base takes the values a, a², a⁴, a⁸, …, and the bits of e pick exactly the ones whose product is a^e."
        time="O(log e)"
        space="O(1)"
      />

      <div className="prose">
        <h2>Worked example: Count Primes</h2>
        <Step n={1}>Brute force first</Step>
        <p>
          For each k below n, test whether it is prime by trial division up to √k. Composites stop early, but each of the
          roughly 350,000 primes below 5 × 10⁶ needs over a thousand divisions: hundreds of millions in total, far more work
          than necessary and likely to time out.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          Each test rediscovers the same small primes. When testing 91 you divide by 2, 3, 5 and 7; when testing 93 you divide
          by 2 and 3 again. Every composite number is a multiple of a small prime, so it would be cheaper to mark the multiples
          once.
        </p>
        <Step n={3}>The rule</Step>
        <p>
          Walk p upwards. If p has not been crossed out, it is prime, so cross out p², p² + p, … Stop when p² reaches n. Each
          composite is crossed out by its prime factors, and each prime is never crossed out.
        </p>
        <Step n={4}>Cost and edge cases</Step>
        <p>
          Crossing out costs n/2 + n/3 + n/5 + … ≈ n log log n, about 15 million operations for n = 5 × 10⁶, in a typed array of
          5 MB. Edge cases: n = 0, 1 or 2 has no primes below it, and "strictly less than n" means n itself is never counted.
        </p>
      </div>

      <div className="prose">
        <h2>Which tool answers which question?</h2>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Question</th>
            <th>Tool</th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Largest size that divides every value</td><td>GCD (fold over the list)</td><td>O(n log max)</td></tr>
          <tr><td>Can steps of a and b make exactly k?</td><td>Bézout: is k a multiple of gcd(a, b)?</td><td>O(log)</td></tr>
          <tr><td>When do two cycles line up?</td><td>LCM = a / gcd × b</td><td>O(log)</td></tr>
          <tr><td>Is one number prime?</td><td>Trial division to √n</td><td>O(√n)</td></tr>
          <tr><td>All primes up to n</td><td>Sieve of Eratosthenes</td><td>O(n log log n)</td></tr>
          <tr><td>Factorise many numbers below a limit</td><td>Smallest-prime-factor sieve</td><td>O(log k) each after the sieve</td></tr>
          <tr><td>All divisors of n</td><td>Divisor pairs up to √n</td><td>O(√n)</td></tr>
          <tr><td>a^e mod m for a huge e</td><td>Fast power</td><td>O(log e)</td></tr>
          <tr><td>Divide modulo a prime p</td><td>Multiply by a^(p − 2) (Fermat)</td><td>O(log p)</td></tr>
          <tr><td>Divide modulo any m (when coprime)</td><td>Extended Euclid</td><td>O(log m)</td></tr>
        </tbody>
      </TableWrap>

      <Pitfalls
        items={[
          <>Multiplying two remainders modulo 10⁹ + 7 with plain numbers. The product passes 2⁵³ and the low digits are lost without any error. Use BigInt.</>,
          <>Forgetting that % keeps the sign of the left side: after a subtraction, add the modulus before reducing.</>,
          <>Treating 1 as prime, or counting n itself when the problem says "less than n".</>,
          <>Computing a × b / gcd instead of a / gcd × b, which overflows first.</>,
          <>Counting √n twice when n is a perfect square.</>,
          <>Using Fermat's inverse with a modulus that is not prime, or Euler's theorem when gcd(a, m) is not 1.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Run Euclid on 1071 and 462. How many division steps does it take, and what is the GCD?',
            solution: '1071 = 2 × 462 + 147; 462 = 3 × 147 + 21; 147 = 7 × 21 + 0. Three steps, GCD 21.',
          },
          {
            task: 'Jugs of 4 and 6 litres. Which totals between 1 and 10 litres can you end up with?',
            hint: 'gcd(4, 6) = 2, and the total can be at most 4 + 6.',
            solution: 'Exactly the even amounts 2, 4, 6, 8 and 10.',
          },
          {
            task: 'Find the inverse of 4 modulo 11 in two ways: by Fermat, and by trying small numbers.',
            solution: 'Fermat: 4⁹ mod 11. 4² = 16 ≡ 5, 4⁴ ≡ 25 ≡ 3, 4⁸ ≡ 9, so 4⁹ ≡ 9 × 4 = 36 ≡ 3. Check: 4 × 3 = 12 ≡ 1. The inverse is 3.',
          },
          {
            task: 'How many divisors does 720 = 2⁴ × 3² × 5 have? What is φ(720)?',
            solution: 'Divisors: (4 + 1)(2 + 1)(1 + 1) = 30. φ(720) = 720 × ½ × ⅔ × ⅘ = 192.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'Jugs hold 6 and 15 litres. Can the total ever be exactly 7 litres?',
            options: ['Yes', 'No, because 7 is not a multiple of gcd(6, 15) = 3', 'Only if you are allowed to spill', 'It depends on the order of moves'],
            answer: 1,
            why: "By Bézout's identity, every reachable total is a multiple of 3.",
          },
          {
            q: 'In the sieve, why does crossing out for the prime p start at p² instead of 2p?',
            options: [
              'It is a heuristic that is usually right',
              'Every smaller multiple k × p with k < p has a smaller prime factor and is already crossed out',
              'Numbers below p² cannot be composite',
              'To save memory',
            ],
            answer: 1,
            why: 'k < p means k has a prime factor smaller than p, which crossed k × p out earlier.',
          },
          {
            q: 'You must compute (a × b) mod (10⁹ + 7) where a and b are already remainders. What is the danger in TypeScript?',
            options: ['Division by zero', 'a × b can exceed 2⁵³ and lose precision silently', 'The % operator is slow', 'There is no danger'],
            answer: 1,
            why: 'The product can be about 10¹⁸. Use BigInt for that multiplication.',
          },
          {
            q: 'Which expression gives the inverse of a modulo a prime p (with a not divisible by p)?',
            options: ['a^(p − 1) mod p', 'a^(p − 2) mod p', 'p mod a', '(p − 1) / a'],
            answer: 1,
            why: "Fermat: a^(p − 1) ≡ 1, so a × a^(p − 2) ≡ 1.",
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          Start with the GCD problems, which are short, then the primes and divisors. The modular arithmetic problems are where
          TypeScript's number precision matters most: check every multiplication. Counting problems that use these tools, such
          as binomial coefficients modulo a prime, continue in <See id="combinatorics" />.
        </p>
      </div>
      <ProblemSet id="number-theory" />

      <Recap>
        <ul>
          <li>gcd(a, b) = gcd(b, a mod b): logarithmic time, and lcm = a / gcd × b.</li>
          <li>Bézout: combinations of a and b are exactly the multiples of their GCD; extended Euclid finds the coefficients and modular inverses.</li>
          <li>Test one number up to √n; find all primes with the sieve; factorise many numbers with a smallest-prime-factor table.</li>
          <li>Reduce modulo m after every step, add m after subtracting, use BigInt for products, and divide with an inverse (Fermat for prime moduli).</li>
          <li>Fast power turns an exponent of 10¹⁵ into about 50 squarings.</li>
        </ul>
      </Recap>
    </>
  );
}
