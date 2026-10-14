import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/bit-manipulation';
import { bitsOf, countingBits, kernighan, xorSingle } from '../traces/bit-manipulation';
import { VizFigure } from '../viz/Viz';
import { Walkthrough } from '../viz/Walkthrough';

const kern = kernighan(44);
const single = xorSingle([6, 3, 5, 3, 6], 3);
const counts = countingBits(8);

export default function BitManipulation() {
  return (
    <>
      <TopicIntro
        id="bit-manipulation"
        time="5–6 hours, plus problems"
        before={['math']}
        learn={[
          'How integers look in binary, including negative numbers, and how TypeScript\'s 32-bit bitwise operators behave',
          'The operator toolkit (AND, OR, XOR, NOT, shifts) and the dozen tricks built from it',
          'Six patterns: counting bits, powers of two, XOR cancellation, bit-by-bit reasoning, arithmetic with bits, masks as sets',
          'How bits give you O(1) space and tiny, fast sets',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          Inside the computer every integer is a row of bits, like a row of light switches that are each on (1) or off (0). Bit
          manipulation means working with the switches directly instead of with the number they add up to. One machine instruction
          flips, tests or combines all 32 switches at once, so bit tricks are fast and need almost no memory.
        </p>
        <p>
          The patterns are few and they recur constantly. XOR makes duplicates vanish, which finds the odd one out with O(1) memory.
          n AND (n − 1) switches off the lowest 1-bit, which counts bits and recognises powers of two. And a single integer can
          stand for a whole set of up to 32 items, turning set operations into one instruction each, which is the foundation of{' '}
          <See id="bitmask" />.
        </p>
      </div>

      <div className="prose">
        <h2>Binary in one page</h2>
        <p>
          Bit k (counting from 0 on the right) is worth 2ᵏ. So 44 = 32 + 8 + 4 is 101100 in binary. Negative numbers use{' '}
          <b>two's complement</b>: −x is (NOT x) + 1, so −1 is all 32 bits set and the top bit (bit 31) acts as the sign. The range of
          a 32-bit signed integer is −2³¹ to 2³¹ − 1.
        </p>
      </div>
      <VizFigure
        parts={[
          { kind: 'array', label: '44', items: bitsOf(44, 8), indices: false, tones: { 2: 'match', 4: 'match', 5: 'match' } },
          { kind: 'array', label: '43 = 44 − 1', items: bitsOf(43, 8), indices: false, tones: { 5: 'warn', 6: 'warn', 7: 'warn' } },
          { kind: 'array', label: '44 AND 43 = 40', items: bitsOf(40, 8), indices: false, tones: { 5: 'bad' } },
        ]}
        caption="Subtracting 1 flips the lowest 1-bit and every 0 below it. ANDing with the original therefore removes exactly the lowest 1-bit. This one fact powers half the chapter."
      />

      <div className="prose">
        <h2>The toolkit</h2>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Operator</th>
            <th>Written</th>
            <th>Rule, bit by bit</th>
            <th>Typical use</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>AND</td><td>a &amp; b</td><td>1 only if both are 1</td><td>Test or clear bits with a mask</td></tr>
          <tr><td>OR</td><td>a | b</td><td>1 if either is 1</td><td>Set bits, union of sets</td></tr>
          <tr><td>XOR</td><td>a ^ b</td><td>1 if the bits differ</td><td>Toggle bits, cancel pairs, find differences</td></tr>
          <tr><td>NOT</td><td>~a</td><td>Flip every bit</td><td>Build "everything except" masks</td></tr>
          <tr><td>Left shift</td><td>a &lt;&lt; k</td><td>Move bits k places left, fill with 0</td><td>Multiply by 2ᵏ, build the mask for bit k</td></tr>
          <tr><td>Signed right shift</td><td>a &gt;&gt; k</td><td>Move right, copy the sign bit in</td><td>Divide by 2ᵏ rounding down</td></tr>
          <tr><td>Unsigned right shift</td><td>a &gt;&gt;&gt; k</td><td>Move right, fill with 0</td><td>Treat the bits as unsigned; &gt;&gt;&gt; 0 reinterprets as unsigned</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>And the tricks built from them, worth memorising:</p>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Expression</th>
            <th>Meaning</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>(x &gt;&gt; k) &amp; 1</td><td>The value of bit k</td></tr>
          <tr><td>x | (1 &lt;&lt; k)</td><td>Set bit k</td></tr>
          <tr><td>x &amp; ~(1 &lt;&lt; k)</td><td>Clear bit k</td></tr>
          <tr><td>x ^ (1 &lt;&lt; k)</td><td>Toggle bit k</td></tr>
          <tr><td>x &amp; (x − 1)</td><td>Remove the lowest 1-bit (0 exactly when x is 0 or a power of two)</td></tr>
          <tr><td>x &amp; −x</td><td>Keep only the lowest 1-bit</td></tr>
          <tr><td>(1 &lt;&lt; n) − 1</td><td>A mask of n ones: the set of all n items</td></tr>
          <tr><td>a ^ b ^ b</td><td>Equals a: XOR undoes itself</td></tr>
          <tr><td>x &amp; 1</td><td>1 if x is odd, 0 if even</td></tr>
        </tbody>
      </TableWrap>

      <Box kind="warn" label="TypeScript gotcha">
        <p>
          TypeScript numbers are 64-bit floats, but every bitwise operator first converts its operands to <b>32-bit signed
          integers</b>. So 1 &lt;&lt; 31 is −2147483648, 1 &lt;&lt; 32 is 1 (the shift amount wraps), and any value above 2³¹ − 1 loses
          its high bits. Use &gt;&gt;&gt; 0 to read a result as unsigned, keep masks within 31 bits when you can, and switch to BigInt
          (which has its own bitwise operators) for masks wider than 32 bits.
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
          { name: 'Integer as bits', ts: 'number with bitwise operators', ops: 'every operator O(1) on 32 bits', use: 'Single values, flags, masks of up to 31 or 32 items.' },
          { name: 'Bitmask as a set', ts: 'number; bit i means item i is in the set', ops: 'union, intersection, membership O(1)', use: 'Sets of letters (26 bits), subsets of up to about 20 items.' },
          { name: 'Wide bitmask', ts: 'bigint with &, |, ^, <<', ops: 'O(width / 64) per operation', use: 'Masks over 32 bits, when a plain number is not enough.' },
          { name: 'Count table by mask', ts: 'number[] of length 2ᵏ', ops: 'index O(1)', use: 'Counting how often each parity mask or subset has appeared.' },
          { name: 'Binary trie', ts: 'nodes with two children (0 and 1)', ops: 'O(32) per insert or query', use: 'Maximum XOR queries. See Tries.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Read and count bits</h2>
        <p>
          The basic loop tests the lowest bit with AND 1 and shifts right, 32 times. Brian Kernighan's loop is smarter: it applies
          n AND (n − 1), which removes the lowest 1-bit, so it runs once per 1-bit. For counting bits of every number up to n, reuse
          answers: i shifted right by one is a smaller number whose count you already know.
        </p>
      </div>
      <Walkthrough
        title="Count the 1-bits of 44 with n AND (n − 1)"
        frames={kern.frames}
        caption={`${kern.count} rounds for ${kern.count} set bits. A number with two 1-bits out of 32 takes 2 rounds, not 32.`}
      />
      <Walkthrough
        title="Counting Bits: every answer from a smaller one"
        frames={counts.frames}
        caption={`ones(i) = ones(i >> 1) + (i AND 1). Results for 0 to 8: ${counts.ans.join(', ')}.`}
      />
      <Recipe
        name="Count or read bits"
        when="you need the number of 1-bits, specific bit values, or to rebuild a number bit by bit."
        steps={[
          'To read bit k, shift right by k and AND with 1.',
          'To count 1-bits, repeat n = n AND (n − 1) until n is 0, counting the rounds.',
          'To count bits for every number up to n, use ones(i) = ones(i >> 1) + (i AND 1).',
          'To rebuild a number bit by bit (reversing, complementing), loop a fixed number of times so leading zeros are not lost.',
        ]}
        why="each AND with n − 1 removes exactly one 1-bit; each right shift exposes the next bit."
        time="O(number of 1-bits) or O(32)"
        space="O(1)"
      />

      <div className="prose">
        <h2>Pattern 2: Powers of two</h2>
        <p>
          A power of two is a single 1-bit, so n AND (n − 1) is 0 exactly for powers of two (and for 0, which you exclude). x AND −x
          keeps only the lowest 1-bit, which is how you pick "some bit where two numbers differ". Ranges have a neat property too:
          below the first bit where left and right differ, every bit takes both values somewhere in between, so the AND of a whole
          range is just the common prefix.
        </p>
      </div>
      <Recipe
        name="Single-bit tests"
        when="the question is about powers of two, the lowest set bit, or what survives an AND over a range."
        steps={[
          'Power of two: n > 0 and n AND (n − 1) is 0.',
          'Power of four: also check the bit sits in an even position, with the mask 0x55555555.',
          'Lowest set bit: x AND −x.',
          'AND of a range: shift left and right down until they are equal, counting the shifts, then shift back.',
        ]}
        why="each test reads the structure of the bit pattern directly instead of looping over values."
        time="O(1) or O(32)"
        space="O(1)"
      />

      <div className="prose">
        <h2>Pattern 3: XOR cancels pairs</h2>
        <p>
          XOR has three properties that make it magic: x ^ x = 0, x ^ 0 = x, and the order of XORs does not matter. So if you XOR a
          list where everything appears twice except one value, the pairs switch each other off and the single value is all that
          remains, with one variable of memory.
        </p>
      </div>
      <Walkthrough
        title="Single Number: XOR everything"
        frames={single.frames}
        caption={`Watch the bits of the running value switch on and off. The survivor is ${single.single}.`}
      />
      <Recipe
        name="XOR to cancel duplicates"
        when="values appear in pairs except for one or two, or you need the XOR of a range many times."
        steps={[
          'XOR every value into an accumulator; pairs cancel and the single value remains.',
          'With two singles a and b, the accumulator is a XOR b; pick its lowest 1-bit and split all values into two groups by that bit, then XOR each group.',
          'For range queries, build prefix XORs: the XOR of [l, r] is prefix[r + 1] XOR prefix[l].',
        ]}
        why="XOR is its own inverse and the order does not matter, so every value that appears an even number of times contributes nothing."
        time="O(n)"
        space="O(1), or O(n) for prefix XORs"
      />

      <div className="prose">
        <h2>Pattern 4: Bit by bit</h2>
        <p>
          AND, OR and XOR never carry anything between positions, so many problems split into 32 independent one-bit problems. When
          every value appears three times except one, count how many values have each bit set: the count modulo 3 is the single
          value's bit. When you want the largest XOR, decide the answer from the highest bit down: a 1 in bit 30 beats every
          combination of lower bits, so greedily try to set each bit and keep it if some pair of numbers allows it.
        </p>
      </div>
      <Recipe
        name="Solve each bit position separately"
        when="the operation is AND, OR or XOR, or you are maximising a bitwise result."
        steps={[
          'Ask what the answer\'s bit k must be, looking only at bit k of the inputs.',
          'Count or decide that bit independently for k = 0 to 31 (or 30 for non-negative values).',
          'When maximising, go from the highest bit to the lowest and keep a bit only if it can still be achieved.',
          'Assemble the answer with OR.',
        ]}
        why="bitwise operators never mix positions, and the highest bit dominates the value."
        time="O(32 · n)"
        space="O(1), or O(n) for a prefix set"
      />

      <div className="prose">
        <h2>Pattern 5: Arithmetic with bits</h2>
        <p>
          Hardware adds with gates, and so can you. For two bits, the sum digit is XOR and the carry is AND. For whole numbers, a ^ b
          is the sum ignoring carries and (a &amp; b) &lt;&lt; 1 is the carries; add those two the same way until no carry is left.
          Division is long division in base 2: from the highest power down, subtract the divisor shifted left by k whenever it fits,
          and set bit k of the quotient.
        </p>
      </div>
      <Recipe
        name="Add or divide with bits"
        when="the problem forbids the arithmetic operators, or asks how a computer does them."
        steps={[
          'Add: while b is not 0, carry = (a AND b) shifted left by 1; a = a XOR b; b = carry.',
          'Divide: handle the overflow case and the signs first, then work with absolute values.',
          'From k = 31 down to 0, if the divisor doubled k times fits in the remainder, subtract it and add 2ᵏ to the quotient.',
          'Reapply the sign.',
        ]}
        why="it is the school algorithm in base 2: sum digits without carry, then add the carries; subtract the biggest multiple that fits."
        time="O(32)"
        space="O(1)"
      />

      <div className="prose">
        <h2>Pattern 6: Masks as sets</h2>
        <p>
          Number the items 0 to n − 1. Then an integer whose bit i is 1 exactly when item i is in the set <i>is</i> the set. Union is
          OR, intersection is AND, "disjoint" is AND equals 0, and the integers 0 to 2ⁿ − 1 are every subset. Letters fit in 26 bits,
          so "do these two words share a letter?" becomes one AND. A <b>parity mask</b> is a set of "letters seen an odd number of
          times"; the parity of a substring is the XOR of two prefix masks, which you will see again in <See id="prefix-sum" />.
        </p>
      </div>
      <Recipe
        name="Represent a small set as an integer"
        when="the items fit in about 20 to 30 positions: letters, small arrays, choices."
        steps={[
          'Give each item a bit position.',
          'Build masks with OR (add an item) and test with AND (is it there?).',
          'Enumerate all subsets as the integers 0 to 2ⁿ − 1.',
          'For odd/even questions, keep a running parity mask and XOR in each new item; count earlier masks in an array of size 2ᵏ.',
        ]}
        why="each set operation becomes one instruction on all items at once."
        time="O(1) per set operation, O(2ⁿ) to list all subsets"
        space="O(1) per set"
      />

      <div className="prose">
        <h2>Worked example: Single Number III</h2>
        <p>Every value appears twice except two, a and b. Find both, in O(n) time and O(1) space.</p>
        <Step n={1}>Brute force first</Step>
        <p>
          Count each value in a hash map and return the two with count 1: <Cost>O(n)</Cost> time, but <Cost>O(n)</Cost> space, which
          the problem forbids.
        </p>
        <Step n={2}>Use what XOR gives you</Step>
        <p>
          XOR of everything cancels the pairs and leaves x = a ^ b. That is not either answer, but it is information: x is not 0, and
          every 1-bit of x is a position where a and b differ.
        </p>
        <Step n={3}>Split the problem in two</Step>
        <p>
          Pick one such bit, say the lowest, low = x &amp; −x. Put every value with that bit set in group 1 and the rest in group 2. a
          and b land in different groups (they differ there), and both copies of every paired value land in the same group (they are
          equal). So each group is a Single Number problem: XOR each group and you get a and b.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          Two passes, two accumulators: <Cost>O(n)</Cost> time, <Cost>O(1)</Cost> space. If the chosen bit is bit 31, value AND low is
          negative for that group, so test "not equal to 0", never "greater than 0".
        </p>
      </div>

      <Pitfalls
        items={[
          <>Forgetting that TypeScript bitwise operators work on <b>32-bit signed</b> integers: 1 &lt;&lt; 31 is negative, and values over 2³¹ lose bits.</>,
          <>Using &gt;&gt; on a value with the top bit set, which copies the sign bit in and can loop forever. Use &gt;&gt;&gt; when the bits are unsigned.</>,
          <>Operator precedence: in TypeScript, comparison binds tighter than &amp;, so write (x &amp; mask) === 0 with brackets. A missing pair of brackets is a classic silent bug.</>,
          <>Testing a bit with "greater than 0" instead of "not equal to 0", which fails for bit 31.</>,
          <>Stopping a bit-reversal loop when the number reaches 0, which loses the zeros.</>,
          <>Reaching for bits when a plain approach is clearer. Bits shine for O(1) space and small sets; elsewhere they only make code harder to read.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Write 13 and 10 in binary, then compute 13 AND 10, 13 OR 10 and 13 XOR 10.',
            solution: '13 = 1101 and 10 = 1010. AND = 1000 (8), OR = 1111 (15), XOR = 0111 (7).',
          },
          {
            task: 'Apply n = n AND (n − 1) repeatedly to n = 52. List the values, and say how many 1-bits 52 has.',
            solution: '52 (110100) → 48 (110000) → 32 (100000) → 0. Three rounds, so three 1-bits.',
          },
          {
            task: 'The array is 5, 3, 5, 7, 3. Track the running XOR. What is left?',
            solution: '5, then 5 XOR 3 = 6, 6 XOR 5 = 3, 3 XOR 7 = 4, 4 XOR 3 = 7. The single value is 7.',
          },
          {
            task: 'Which mask represents the set of letters in the word "bead", with a as bit 0? Do "bead" and "fig" share a letter?',
            hint: 'b is bit 1, e is bit 4, a is bit 0, d is bit 3.',
            solution: 'Bits 0, 1, 3, 4: 11011 in binary, which is 27. "fig" uses bits 5, 8 and 6. The masks AND to 0, so the words share no letter.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'What does n AND (n − 1) do?',
            options: ['Sets the lowest 0-bit', 'Removes the lowest 1-bit', 'Divides n by 2', 'Flips every bit'],
            answer: 1,
            why: 'n − 1 flips the lowest 1-bit and the 0s below it, so the AND keeps everything above and clears that bit.',
          },
          {
            q: 'In TypeScript, what is 1 << 31?',
            options: ['2147483648', '−2147483648', '0', 'Infinity'],
            answer: 1,
            why: 'Shifts produce 32-bit signed integers, and bit 31 is the sign bit, so the result is the most negative 32-bit value.',
          },
          {
            q: 'Every value appears three times except one. Why does XOR alone not find it?',
            options: [
              'XOR is too slow',
              'Three copies XOR to the value itself, not to 0, so the triples do not cancel',
              'XOR does not work on negative numbers',
              'It does find it',
            ],
            answer: 1,
            why: 'x ^ x ^ x = x. Count each bit modulo 3 instead.',
          },
          {
            q: 'How do you test whether two words share no letters, given their 26-bit letter masks?',
            options: ['mask1 OR mask2 equals 0', 'mask1 AND mask2 equals 0', 'mask1 XOR mask2 equals 0', 'mask1 equals mask2'],
            answer: 1,
            why: 'AND keeps the letters in both sets; if nothing is left, the sets are disjoint.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          Draw the bits on paper for the first example of every problem; the trick usually becomes visible in the picture. Bitmask DP
          (subsets as DP states) has its own chapter, <See id="bitmask" />.
        </p>
      </div>
      <ProblemSet id="bit-manipulation" />

      <Recap>
        <ul>
          <li>Integers are rows of bits; TypeScript's bitwise operators work on 32-bit signed integers, so watch bit 31 and use &gt;&gt;&gt; for unsigned values.</li>
          <li>n AND (n − 1) removes the lowest 1-bit: count bits, recognise powers of two. x AND −x isolates it.</li>
          <li>XOR cancels pairs: find the odd one out in O(1) space, split by a differing bit for two singles, prefix XORs for ranges.</li>
          <li>Bits are independent under AND, OR and XOR, so solve one position at a time, greedily from the top when maximising; and use integers as tiny, fast sets.</li>
        </ul>
      </Recap>
    </>
  );
}
