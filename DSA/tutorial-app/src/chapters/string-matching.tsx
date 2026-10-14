import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/string-matching';
import { kmpSearch, manacherOdd, prefixTable, zFunction } from '../traces/string-matching';
import { Walkthrough } from '../viz/Walkthrough';

const table = prefixTable('aabaaab');
const search = kmpSearch('abaababab', 'abab');
const z = zFunction('aabxaab');
const pal = manacherOdd('abacabadx');

export default function StringMatching() {
  return (
    <>
      <TopicIntro
        id="string-matching"
        time="5–6 hours, plus problems"
        before={['string', 'rolling-hash', 'trie']}
        learn={[
          'Why naive pattern search can take O(n · m), and how KMP avoids rereading the text',
          'The prefix table (borders) and what it says about periods and repetitions',
          'The Z-array, and the "pattern + separator + text" trick',
          "Manacher's algorithm for all palindromes in O(n)",
          'The ideas behind Boyer–Moore, Aho–Corasick, palindromic trees, minimal rotations and Lyndon factorisation',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          You are searching a long text for a word. The naive way lines the word up at every position and compares letter by
          letter. On ordinary text that is quick, but on text like "aaaa…ab" with the pattern "aaab", almost every alignment
          matches for a while and then fails, so the work becomes <Cost>O(n · m)</Cost>: with 10⁶ letters each, 10¹² steps.
        </p>
        <p>
          The waste is that after a partial match you already <b>know</b> the letters you just read; they are the pattern's own
          prefix. The algorithms in this chapter precompute facts about the pattern's structure so a scan never reads a text
          letter twice. That makes exact matching <Cost>O(n + m)</Cost>, guaranteed, without the collision risk of hashing (
          <See id="rolling-hash" />).
        </p>
      </div>

      <div className="prose">
        <h2>Borders: the KMP prefix table</h2>
        <p>
          A <b>border</b> of a string is a proper prefix that is also a suffix: "ab" is a border of "abcab". The prefix table pi
          stores, for every prefix p[0..i] of the pattern, the length of its longest border. Suppose j letters of the pattern match
          the text and the next letter fails. The text's last j letters equal p[0..j), so the next possible alignment keeps the
          longest border of p[0..j), which is pi[j − 1] letters long. No text letter needs rereading.
        </p>
      </div>
      <Walkthrough
        title="Build the prefix table of aabaaab"
        frames={table.frames}
        caption={`pi = [${table.pi.join(', ')}]. Each fall-back jumps to the next shorter border, read from the table itself.`}
      />
      <Walkthrough
        title="KMP search for abab"
        frames={search.frames}
        caption={`The pattern slides by its border instead of by one; the text pointer i never moves left. Matches at ${search.matches.join(' and ')}.`}
      />

      <Box kind="key" label="Key idea">
        <p>
          The longest border b of a whole string of length n gives its shortest <b>period</b>: p = n − b. The string is a block
          repeated two or more times exactly when b &gt; 0 and p divides n. Many "repeated", "prefix equals suffix" and "shortest
          palindrome" problems reduce to one prefix table.
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
          { name: 'Prefix table', ts: 'number[] or Int32Array of length m', ops: 'build O(m)', use: 'KMP search, borders, periods.' },
          { name: 'Z-array', ts: 'number[] of length n', ops: 'build O(n)', use: 'Match length with the start at every position; pattern + "#" + text.' },
          { name: 'Radius arrays', ts: 'number[] for odd and even centres', ops: 'build O(n)', use: 'Manacher: every palindrome centred at each position.' },
          { name: 'Trie with failure links', ts: 'array of nodes, each { next: Map or 26-slot array, fail, out }', ops: 'build O(total length); step amortised O(1)', use: 'Aho–Corasick: many patterns in one pass.' },
          { name: 'Array of characters', ts: 'string (index with s[i]) or string[]', ops: 'O(1) access', use: 'Comparisons. Avoid building substrings inside loops.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: KMP prefix table</h2>
      </div>
      <Recipe
        name="KMP"
        when="you need every occurrence of one pattern, a border, or a period, in guaranteed linear time."
        steps={[
          'Prefix table: pi[0] = 0. For i from 1, start with j = pi[i − 1]; while j > 0 and p[i] ≠ p[j], set j = pi[j − 1]; if p[i] = p[j], add 1 to j; store pi[i] = j.',
          'Search: j = 0. For each text letter: while j > 0 and it differs from p[j], set j = pi[j − 1].',
          'If it equals p[j], add 1 to j. When j = m, record a match at i − m + 1 and set j = pi[m − 1].',
        ]}
        why="j rises by at most one per letter and every fall-back lowers it, so the total number of steps is at most 2(n + m)."
        time="O(n + m)"
        space="O(m)"
      />
      <div className="prose">
        <p>
          KMP works on any sequence whose items can be compared for equality, not just letters: arrays of numbers, or a sequence
          of comparisons such as "up, equal, down".
        </p>

        <h2>Pattern 2: Z-array</h2>
        <p>
          z[i] is the length of the longest common prefix of s and s[i..]. It is computed left to right while remembering the{' '}
          <b>Z-box</b> [l, r): the stretch furthest to the right that is known to copy the beginning. A position inside the box
          already knows a lower bound for its answer from the mirrored position, z[i − l].
        </p>
      </div>
      <Walkthrough title="Z-array of aabxaab" frames={z.frames} caption={`z = [${z.z.join(', ')}].`} />
      <Recipe
        name="Z-array"
        when="you need, for every position, how far the string agrees with its own start; or pattern matching via pattern + '#' + text."
        steps={[
          'Set z[0] = n (or 0, by convention), l = r = 0.',
          'For each i ≥ 1: if i < r, start z[i] at min(r − i, z[i − l]); otherwise at 0.',
          'Extend z[i] while s[z[i]] = s[i + z[i]].',
          'If i + z[i] > r, move the box: l = i, r = i + z[i].',
          'For matching, positions in the text part with z = m are occurrences.',
        ]}
        why="each extension moves r to the right, and r never moves back, so all extensions together take O(n)."
        time="O(n)"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 3: Palindromes in linear time</h2>
        <p>
          Expanding around each of the 2n − 1 centres finds every palindrome, but costs <Cost>O(n²)</Cost> on strings like
          "aaaa…". <b>Manacher's algorithm</b> keeps the palindrome reaching furthest right. A new centre inside it has a mirror
          centre on the left whose radius is already known, and by symmetry the new radius is at least that (capped at the box's
          edge). Only the part beyond the box needs real comparisons.
        </p>
      </div>
      <Walkthrough
        title="Manacher on odd-length palindromes"
        frames={pal.frames}
        caption={`Radii d = [${pal.d.join(', ')}]. Longest odd palindrome: "${pal.longest}". Even lengths use a second pass, or a separator between all letters.`}
      />
      <div className="prose">
        <p>
          A related structure, the <b>palindromic tree</b> (eertree), stores every distinct palindrome of a string as a node,
          with two roots (for odd and even lengths) and suffix links between palindromes. It is built letter by letter in{' '}
          <Cost>O(n)</Cost> and answers "how many distinct palindromes?" or "longest palindromic suffix after each letter".
          LeetCode rarely needs it; Manacher covers almost every palindrome problem there.
        </p>

        <h2>Pattern 4: Rotations and lexicographic order</h2>
        <p>
          Every rotation of s is a window of length n in s + s, so "is goal a rotation of s?" is one search. The{' '}
          <b>lexicographically smallest rotation</b> can be found in <Cost>O(n)</Cost> with Booth's algorithm or a two-pointer
          comparison: keep two candidate starts and a matched length k; when they first differ, the loser and the k starts after
          it can all be discarded at once. The same skipping finds the <b>largest suffix</b> of a string.
        </p>
        <p>
          These ideas come from the theory of <b>Lyndon words</b>: strings strictly smaller than all their rotations. Every
          string splits uniquely into a non-increasing sequence of Lyndon words (Duval's algorithm does it in <Cost>O(n)</Cost>),
          and the smallest rotation starts at one of the split points. You rarely need the theory, but the two-pointer skip is
          worth knowing by heart.
        </p>

        <h2>Pattern 5: Many patterns at once</h2>
        <p>
          With a whole dictionary of patterns, run KMP's idea on a trie. <b>Aho–Corasick</b> gives every trie node a failure
          link: the longest proper suffix of that node's string that is also a path in the trie. Scanning the text, follow trie
          edges when you can and failure links when you cannot. A node is "accepting" if a word ends there or at any node reachable
          by failure links.
        </p>
      </div>
      <Recipe
        name="Aho–Corasick"
        when="many patterns must be found in one text, or in a stream of characters."
        steps={[
          'Insert every pattern into a trie; mark the nodes where patterns end.',
          'Breadth first from the root: the root\'s children fail to the root. For a child reached by letter c from node u, follow u\'s failure links until a node with a c-edge (or the root); that edge\'s target is the child\'s failure.',
          'Make a node accepting if it ends a word or its failure node is accepting.',
          'Scan the text: on each letter, follow failure links until the letter can be taken (or the root), take it, and report if the node is accepting.',
        ]}
        why="the failure link always points to the longest suffix of what was read that could still start a match, the same invariant as KMP."
        time="O(total pattern length + text length + matches)"
        space="O(total pattern length)"
      />

      <div className="prose">
        <h3>Boyer–Moore, briefly</h3>
        <p>
          Boyer–Moore compares the pattern against the text from the pattern's <b>right end</b>. On a mismatch at text letter c,
          the bad-character rule shifts the pattern so its last occurrence of c lines up with the text (or jumps past c entirely
          if c is not in the pattern). On normal text it often skips most letters, which is why text editors and search tools use
          variants of it. Its simple versions can still be slow in the worst case, so for interview problems KMP or Z is the safer
          choice.
        </p>
      </div>

      <TableWrap>
        <thead>
          <tr>
            <th>Algorithm</th>
            <th>Time</th>
            <th>Answers</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>KMP prefix table</td><td>O(n + m)</td><td>Occurrences, borders, periods, repetitions</td></tr>
          <tr><td>Z-array</td><td>O(n + m)</td><td>Match length with the start at every position</td></tr>
          <tr><td>Rabin–Karp</td><td>O(n + m) expected</td><td>Occurrences; comparing arbitrary pieces (probabilistic)</td></tr>
          <tr><td>Boyer–Moore</td><td>Often sublinear; poor worst case in simple forms</td><td>Fast single-pattern search on real text</td></tr>
          <tr><td>Manacher</td><td>O(n)</td><td>Every palindrome radius</td></tr>
          <tr><td>Aho–Corasick</td><td>O(total + n + matches)</td><td>Many patterns in one pass</td></tr>
          <tr><td>Booth / Duval</td><td>O(n)</td><td>Smallest rotation, Lyndon factorisation, largest suffix</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Worked example: shortest palindrome</h2>
        <p>
          <b>Shortest Palindrome</b> asks for the fewest letters to add in front of s to make it a palindrome.
        </p>
        <Step n={1}>Brute force first</Step>
        <p>
          Try adding 0, 1, 2, … letters (the reverse of s's last letters) and test each result: up to n tests of{' '}
          <Cost>O(n)</Cost>, so <Cost>O(n²)</Cost>, too slow for 5 × 10⁴ letters on bad inputs.
        </p>
        <Step n={2}>Find the structure</Step>
        <p>
          Whatever you add, the original s must begin with a palindrome that ends up in the middle. To add as little as possible,
          that palindromic prefix must be as long as possible.
        </p>
        <Step n={3}>Turn it into a border</Step>
        <p>
          A prefix of s is a palindrome exactly when it equals the matching suffix of reverse(s). So build t = s + "#" +
          reverse(s): its longest border is the longest palindromic prefix. The "#" stops the border from running past s.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          One prefix table of length 2n + 1: <Cost>O(n)</Cost>. With L = pi[last], the answer is reverse(s[L..]) + s. The empty
          string is already a palindrome.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Restarting j at 0 after a full match. Continue from pi[m − 1], or overlapping matches are lost.</>,
          <>Forgetting the separator in pattern + "#" + text (or s + "#" + reverse(s)), which lets matches run across the join.</>,
          <>Handling only odd palindromes in Manacher; even ones need a second array or a separator letter between every pair.</>,
          <>Building substrings inside loops (slice in every iteration), which quietly turns O(n) into O(n²).</>,
          <>Assuming the built-in search is always linear. It is fast in practice, but you should be able to explain KMP.</>,
          <>In Aho–Corasick, not propagating "accepting" along failure links, so a word inside a longer match is missed.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Compute the prefix table of "ababaa".',
            solution: '[0, 0, 1, 2, 3, 1].',
          },
          {
            task: 'The prefix table of a string of length 12 ends with 8. Is the string a repeated block? What is the block?',
            solution: 'The shortest period is 12 − 8 = 4, and 4 divides 12, so yes: the first 4 letters repeated 3 times.',
          },
          {
            task: 'Compute the Z-array of "aaaba" (use z[0] = 5).',
            solution: '[5, 2, 1, 0, 1].',
          },
          {
            task: 'Using s + s, decide whether "cdab" is a rotation of "abcd".',
            solution: 'abcd + abcd = "abcdabcd" contains "cdab" (starting at index 2), and the lengths are equal, so yes.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'During KMP search, j letters match and the next letter fails. Where does the text pointer go?',
            options: ['Back by j letters', 'It stays; j becomes pi[j − 1]', 'Forward by j letters', 'Back to the start'],
            answer: 1,
            why: 'The text pointer never moves back. Only j shrinks, to the longest border of the matched part.',
          },
          {
            q: 'Why is "pattern + # + text" useful with the Z-array?',
            options: [
              'It makes the string shorter',
              'Every text position whose Z value equals m is an occurrence, and # stops longer matches',
              'It sorts the text',
              'It removes duplicates',
            ],
            answer: 1,
            why: 'Z values in the text part measure the match with the pattern; the separator caps them at m.',
          },
          {
            q: 'What makes Manacher linear?',
            options: [
              'It only checks odd lengths',
              'Centres inside the rightmost palindrome start from their mirror\'s radius, so the right edge only moves forward',
              'It uses hashing',
              'It sorts the centres',
            ],
            answer: 1,
            why: 'Real comparisons only happen beyond the current right edge, which advances at most n times.',
          },
          {
            q: 'You must find 2,000 dictionary words in a stream of 40,000 letters. Best tool?',
            options: ['KMP for each word after every letter', 'Aho–Corasick, or a trie of reversed words', 'Sort the words', 'Rabin–Karp with one hash'],
            answer: 1,
            why: 'One automaton (or a reversed trie checked against recent letters) handles all words together.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
      </div>
      <ProblemSet id="string-matching" />

      <Recap>
        <ul>
          <li>KMP precomputes borders so the text is never reread: O(n + m), and its last value gives periods and repetitions.</li>
          <li>The Z-array gives the match with the start at every position; pattern + "#" + text turns it into a matcher.</li>
          <li>Manacher finds every palindrome radius in O(n) by reusing mirror images.</li>
          <li>Rotations live in s + s; smallest rotation and largest suffix use a two-pointer skip in O(n).</li>
          <li>Aho–Corasick generalises KMP to a trie for many patterns; Boyer–Moore skips ahead using the pattern's right end.</li>
        </ul>
      </Recap>
    </>
  );
}
