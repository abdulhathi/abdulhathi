import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/rolling-hash';
import { longestDuplicate, rabinKarp } from '../traces/rolling-hash';
import { Walkthrough } from '../viz/Walkthrough';

const rk = rabinKarp('bacabdcabacd', 'cab', 31, 17);
const dup = longestDuplicate('mississippi');

export default function RollingHash() {
  return (
    <>
      <TopicIntro
        id="rolling-hash"
        time="3–4 hours, plus problems"
        before={['hash-function', 'sliding-window', 'binary-search']}
        learn={[
          'The polynomial hash of a string, and how to update it in O(1) as a window slides',
          'Prefix hashes: the hash of any substring in O(1)',
          'Choosing the base and the modulus, and why JavaScript needs a modulus below about 9.4 × 10⁷ (or BigInt)',
          'Collisions: how likely they are, and double hashing to make them negligible',
          'Rabin–Karp, and binary search on the length for "longest repeated" problems',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          Comparing two strings of length k costs k steps. Comparing two numbers costs one. A <b>hash</b> squeezes a string into a
          number, so equal strings always give equal numbers, and different strings almost always give different ones. A{' '}
          <b>rolling</b> hash goes further: when a window slides one character to the right, its new hash comes from the old one in{' '}
          <Cost>O(1)</Cost>, without rereading the window.
        </p>
        <p>
          Think of a car's odometer. Read the string as digits of a number in base B (a = 1, b = 2, …). Sliding the window is like
          the odometer rolling over: drop the leftmost digit, shift everything one place left (multiply by B), and add a new digit
          on the right. The true number would get enormous, so we keep only its remainder modulo a prime M. Searching for a
          pattern of length k in a text of length n then costs <Cost>O(n + k)</Cost> instead of <Cost>O(n · k)</Cost>.
        </p>
      </div>

      <Walkthrough
        title="Rabin–Karp: slide the hash, verify only when hashes agree"
        frames={rk.frames}
        caption={`The pattern occurs at ${rk.matches.join(' and ')}. At index ${rk.falseHits[0]} the hash matches but the letters do not: with a modulus as small as 17, collisions are common. Real code uses a huge modulus, or two.`}
      />

      <div className="prose">
        <h2>The arithmetic</h2>
        <p>
          The hash of a string s of length k is s[0]·B^(k−1) + s[1]·B^(k−2) + … + s[k−1]·B⁰, all modulo M. Three facts make it
          useful:
        </p>
        <ul>
          <li><b>Extend on the right</b>: hash(s + c) = hash(s) × B + c.</li>
          <li><b>Slide</b>: subtract the leaving character times B^(k−1), multiply by B, add the entering character.</li>
          <li><b>Any substring</b>: with prefix hashes H[i] (the hash of the first i characters) and powers P[j] = B^j, the hash of s[l..r) is H[r] − H[l] × P[r − l], modulo M.</li>
        </ul>
        <p>
          Subtraction can go negative, so after it add M and take the remainder again. Precompute the powers once; then every
          substring comparison in the rest of the algorithm is <Cost>O(1)</Cost>.
        </p>
      </div>

      <Box kind="key" label="Key idea">
        <p>
          Equal strings always have equal hashes. Different strings have equal hashes only by bad luck, with probability about
          1 in M per comparison. So a hash comparison is a fast filter: if the hashes differ, the strings certainly differ; if
          they agree, the strings are equal with high probability, and you can confirm with a direct check when it matters.
        </p>
      </Box>

      <div className="prose">
        <h3>Choosing the base and the modulus in JavaScript</h3>
        <p>
          Pick a base larger than the alphabet (31 or 131 for letters, something above the largest value for arrays of numbers)
          and a large prime modulus. JavaScript numbers are doubles: integers are exact only up to 2⁵³ ≈ 9 × 10¹⁵. Multiplying two
          residues near 10⁹ gives about 10¹⁸, and the low digits are silently lost, so the "hash" becomes garbage without any
          error. Three safe options:
        </p>
        <ul>
          <li><b>A modulus below √(2⁵³) ≈ 94,906,265</b>, for example the prime 94,906,249. Then every product of two residues stays exact.</li>
          <li><b>BigInt</b> for the multiplications. Always exact, but several times slower.</li>
          <li><b>Split multiplication</b>: break one factor into high and low 16-bit halves and combine. Exact and fast, but fiddly.</li>
        </ul>
        <h3>How likely is a collision?</h3>
        <p>
          With n different windows and a modulus M, the expected number of colliding pairs is about n² / (2M), the birthday
          paradox. For 10⁵ windows and M ≈ 9.5 × 10⁷ that is about 50 collisions: too many to ignore. Two independent hashes
          (two moduli) act like one modulus of about 9 × 10¹⁵, and the expected count drops to around 10⁻⁶. Combine them into
          one key as h1 × M2 + h2, which still fits exactly below 2⁵³. Some LeetCode tests are built specifically to break a single
          well-known modulus.
        </p>
      </div>

      <div className="prose">
        <h2>When to use it</h2>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
      </div>
      <Structures
        items={[
          { name: 'Prefix hashes', ts: 'number[] or Float64Array of length n + 1', ops: 'build O(n); substring hash O(1)', use: 'Comparing any two pieces of a string.' },
          { name: 'Powers of the base', ts: 'number[] of B^j mod M', ops: 'build O(n)', use: 'Removing the left part in the substring formula.' },
          { name: 'Set or Map of hashes', ts: 'Set<number>, Map<number, number[]>', ops: 'O(1) average', use: 'Finding repeated windows; keep start positions to verify.' },
          { name: 'BigInt', ts: 'bigint, e.g. 31n', ops: 'exact, but slower', use: 'When the modulus is given and large (up to 10⁹).' },
          { name: 'Bit mask', ts: 'number with << and &', ops: 'O(1)', use: 'Exact codes for tiny alphabets: 2 bits per DNA letter, 1 per binary digit.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Fixed-length windows</h2>
      </div>
      <Recipe
        name="Rabin–Karp (rolling window hash)"
        when="you must compare every window of length k with a pattern, or find repeated windows."
        steps={[
          'Choose a base B and a prime modulus M (or two). Precompute W = B^(k−1) mod M.',
          'Hash the first k characters.',
          'At each window, compare its hash with the target (or look it up in a set). On equality, verify the characters if a false match would be wrong.',
          'Slide: hash = ((hash − leaving × W) mod M + M) mod M, then hash = (hash × B + entering) mod M.',
        ]}
        why="the slide removes the leaving character's contribution exactly and shifts the rest up one power, which is the hash of the new window."
        time="O(n + k) expected"
        space="O(1), plus any set of hashes"
      />
      <div className="prose">
        <p>
          When the alphabet is tiny and the window short, skip the modulus entirely. DNA has four letters, so 2 bits each, and a
          10-letter window is an exact 20-bit number: shift left by 2, add the new letter, mask to 20 bits. No collisions are
          possible.
        </p>

        <h2>Pattern 2: Comparing prefixes and suffixes</h2>
        <p>
          With prefix hashes, any two pieces of a string can be compared in <Cost>O(1)</Cost>. That answers "is this prefix also a
          suffix?", "are the two halves of this substring equal?", or "does the text after position t·k equal the start?" A
          growing suffix hash can also be built from the right: suffixHash = c × B^len + suffixHash.
        </p>

        <h2>Pattern 3: Binary search on the length</h2>
        <p>
          "Longest substring that appears twice", "longest common subarray", "longest common subpath": all have the same
          shape. If a repeat of length L exists, then cutting it down gives repeats of every shorter length. So the answer is the
          largest L for which a test succeeds, and binary search finds it with <Cost>O(log n)</Cost> tests. Each test slides a
          rolling hash in <Cost>O(n)</Cost>.
        </p>
      </div>
      <Walkthrough
        title="Longest repeated substring of mississippi"
        frames={dup.frames}
        caption={`Answer: "${dup.answer}" (its two copies overlap, which is allowed).`}
      />
      <Recipe
        name="Binary search on the length with window hashes"
        when="you need the longest piece that repeats, or that several sequences share."
        steps={[
          'Set lo = 0 and hi = the largest possible length.',
          'Test mid = the upper middle: hash every window of length mid (in every input) and look for a repeat or a common hash.',
          'If found (and verified), set lo = mid; otherwise hi = mid − 1.',
          'When lo = hi, that is the answer length; keep the position found by the last successful test.',
        ]}
        why="success is monotone in the length, so binary search never discards the answer."
        time="O(n log n) expected"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 4: Hashing inside dynamic programming</h2>
        <p>
          Some DPs ask, at every step, whether two pieces are equal: "can I delete this block because the next block matches it?".
          A character-by-character check would make the DP <Cost>O(n³)</Cost>. With prefix hashes each check is <Cost>O(1)</Cost>.
          An exact alternative for n up to a few thousand is a table of longest common prefixes, lcp[i][j] = lcp[i+1][j+1] + 1 when
          s[i] = s[j], filled from the end.
        </p>
      </div>

      <TableWrap>
        <thead>
          <tr>
            <th>Tool</th>
            <th>Exact?</th>
            <th>Best at</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Rolling hash</td><td>Probabilistic (verify, or use two moduli)</td><td>Comparing arbitrary pieces in O(1); many patterns of one length; binary search on length</td></tr>
          <tr><td>KMP prefix function</td><td>Yes</td><td>One pattern in a text; borders (prefix = suffix)</td></tr>
          <tr><td>Z-function</td><td>Yes</td><td>Longest match with the prefix at every position</td></tr>
          <tr><td>Suffix array + LCP</td><td>Yes</td><td>Repeated and distinct substrings, deterministically</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          The exact tools are in <See id="string-matching" /> and <See id="suffix-array" />. Rolling hashes are often the quickest
          to write, and the most flexible when the question is about arbitrary pairs of pieces.
        </p>
      </div>

      <div className="prose">
        <h2>Worked example: a hash defined backwards</h2>
        <p>
          <b>Find Substring With Given Hash Value</b> defines the hash with the first character at power 0: val(s[0])·p⁰ +
          val(s[1])·p¹ + …, mod m, with p and m up to 10⁹. Return the first window of length k whose hash equals a target.
        </p>
        <Step n={1}>Brute force first</Step>
        <p>
          Hash every window from scratch: <Cost>O(n · k)</Cost>, up to 4 × 10⁸ steps. Too slow.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          Neighbouring windows share k − 1 characters. Sliding right would drop the character with power 0, and then every
          remaining power must go down by one: a division by p. Modulo m, division only works if p has an inverse, which is not
          guaranteed.
        </p>
        <Step n={3}>Prove a rule</Step>
        <p>
          Slide <b>from right to left</b> instead. Multiplying the hash by p raises every power by one, and the new leftmost
          character enters with power 0. The character that falls off the right end now has power k, so subtract val × p^k. No
          division needed.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          <Cost>O(n)</Cost>. Because you scan leftward, the first window in the string is the last one you see: keep updating the
          answer. And since p × hash can approach 10¹⁸, use BigInt or split multiplication, or the results are silently wrong.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Multiplying two residues around 10⁹ with plain numbers. The product passes 2⁵³ and loses precision without any error.</>,
          <>Forgetting to add M after subtracting, which leaves negative remainders that never match.</>,
          <>Mapping a character (or array value) to 0. Then "a", "aa" and "aaa" all hash to 0. Use value + 1.</>,
          <>A base not larger than the alphabet, which makes different strings collide systematically.</>,
          <>Trusting a single small hash on adversarial tests. Use two moduli, or verify matches.</>,
          <>Comparing hashes of pieces with different lengths. Include the length in the key, or only compare equal lengths.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'With a = 1, b = 2, c = 3 and base 10 (no modulus), what is the hash of "cab"? Slide one step to "abc": compute it from the old hash.',
            solution: 'cab = 3·100 + 1·10 + 2 = 312. Slide: (312 − 3·100) × 10 + 3 = 12 × 10 + 3 = 123, which is abc.',
          },
          {
            task: 'Given prefix hashes H and powers P (base 10, no modulus) of "31415", compute the hash of s[1..4) = "141" with the formula.',
            hint: 'H[4] = 3141 and H[1] = 3.',
            solution: 'H[4] − H[1] × P[3] = 3141 − 3 × 1000 = 141.',
          },
          {
            task: 'How many bits does a window of 12 DNA letters need, and is that safe for JavaScript bit operations?',
            solution: '24 bits (2 per letter). Bit operations work on 32-bit integers, so it is safe.',
          },
          {
            task: 'You hash 2 × 10⁵ windows with one modulus of about 10⁹. Roughly how many colliding pairs should you expect?',
            solution: 'About n² / (2M) = (4 × 10¹⁰) / (2 × 10⁹) = 20. Use a second modulus or verify.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'Why must a JavaScript rolling hash use a modulus below about 9.4 × 10⁷ (unless you use BigInt)?',
            options: [
              'Larger moduli are not prime',
              'Products of two residues must stay below 2⁵³ to be exact',
              'Bit operations only work on 32 bits',
              'Larger moduli cause more collisions',
            ],
            answer: 1,
            why: '√(2⁵³) ≈ 9.49 × 10⁷. Above that, residue × residue can exceed the exact integer range of a double.',
          },
          {
            q: 'Two windows have the same rolling hash. What do you know?',
            options: ['They are equal', 'They are probably equal; verify if a false match would be wrong', 'They are different', 'Nothing at all'],
            answer: 1,
            why: 'Equal strings always hash equally, but different strings can collide. Different hashes, on the other hand, prove the strings differ.',
          },
          {
            q: 'Why can "longest duplicate substring" use binary search on the length?',
            options: [
              'Because the string is sorted',
              'Because if a repeat of length L exists, repeats of every shorter length exist too',
              'Because hashes are monotone',
              'It cannot',
            ],
            answer: 1,
            why: 'Trim a repeated substring and it still repeats. That monotonicity is what binary search needs.',
          },
          {
            q: 'For 10-letter DNA windows, what is the best key?',
            options: ['The substring itself', 'A polynomial hash mod 10⁹ + 7', 'A 20-bit integer, 2 bits per letter', 'The sum of letter codes'],
            answer: 2,
            why: 'It is exact (no collisions), O(1) to roll with a shift and a mask, and needs no modulus.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
      </div>
      <ProblemSet id="rolling-hash" />

      <Recap>
        <ul>
          <li>A polynomial hash reads a string as a number in base B, mod M; slide it in O(1) by removing, shifting and adding.</li>
          <li>Prefix hashes and powers give the hash of any substring in O(1): H[r] − H[l] × B^(r−l).</li>
          <li>In JavaScript keep moduli below about 9.4 × 10⁷ (or use BigInt) so products stay exact.</li>
          <li>Collisions grow like n² / (2M): use two moduli or verify matches.</li>
          <li>"Longest repeated or common piece" = binary search on the length + a set of window hashes.</li>
        </ul>
      </Recap>
    </>
  );
}
