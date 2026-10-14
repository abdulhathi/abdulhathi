import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/dp-sequences';
import { editDistance, lcsTable, lisPatience } from '../traces/dp-sequences';
import { Walkthrough } from '../viz/Walkthrough';

const lis = lisPatience([3, 8, 4, 1, 6, 2, 7, 9, 5]);
const lcs = lcsTable('acbde', 'abce');
const edit = editDistance('lead', 'deal');

export default function SequenceDp() {
  return (
    <>
      <TopicIntro
        id="dp-sequences"
        time="7–8 hours, plus problems"
        before={['dp', 'binary-search', 'string']}
        learn={[
          'The longest increasing subsequence in O(n²), and in O(n log n) with patience sorting',
          'The two-prefix table behind LCS, edit distance, interleaving and many disguised problems',
          'Palindromes: expanding around centres, and range tables for subsequences',
          'Wildcard and regular-expression matching, where a star means "skip it or use it once more"',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          A <b>subsequence</b> keeps some elements of a sequence in their original order, possibly with gaps: "ace" is a subsequence
          of "abcde". A string of length n has 2ⁿ subsequences, so any question that says "longest subsequence such that…" is
          hopeless to answer by listing them.
        </p>
        <p>
          The DP trick is to stop thinking about whole subsequences and think about <b>prefixes</b> (or ranges). For one sequence, the
          state is "the best subsequence ending at position i". For two sequences, it is "the answer for the first i elements of one
          and the first j of the other". Each state looks only at the last element or elements, which gives tables of size n or
          n × m: <Cost>O(n²)</Cost> or <Cost>O(n · m)</Cost> instead of exponential.
        </p>
        <p>
          The classic two-sequence table is the longest common subsequence. Watch how each cell only compares two characters and
          looks at three neighbours.
        </p>
      </div>

      <Walkthrough
        title="Longest Common Subsequence: one cell per pair of prefixes"
        frames={lcs.frames}
        caption={`A match takes the diagonal + 1; a mismatch takes the better of up and left. The last frame traces one LCS back: "${lcs.lcs}".`}
      />

      <Box kind="key" label="Key idea">
        <p>
          For two sequences, ask what happens to the <b>last element of each prefix</b>. Either they pair up (move diagonally), or
          one of them plays no part (move up or left). Almost every two-string DP, from LCS to edit distance to wildcard matching, is
          that sentence with different costs attached.
        </p>
      </Box>

      <div className="prose">
        <h2>When to use it</h2>
        <p>
          These clues point to sequence DP. The <See id="recognition" /> collects every signal from every chapter.
        </p>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
      </div>
      <Structures
        items={[
          { name: '2D table over prefixes', ts: 'Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))', ops: 'O(1) per cell', use: 'LCS, edit distance, matching. The extra row and column stand for empty prefixes.' },
          { name: 'Two rolling rows', ts: 'let prev = …, cur = …', ops: 'O(1)', use: 'When a cell reads only the row above and the cell to its left. Save the diagonal before overwriting.' },
          { name: 'Tails array + binary search', ts: 'number[]', ops: 'O(log n) per element', use: 'Patience sorting for the longest increasing subsequence.' },
          { name: 'Range table', ts: 'n × n array, filled by increasing range length', ops: 'O(1) per cell', use: 'Palindromic subsequences and other questions about s[i..j].' },
          { name: 'Map from string to value', ts: 'new Map<string, number>()', ops: 'O(1) average (plus hashing the string)', use: 'Chains of words, such as Longest String Chain.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Longest increasing subsequence</h2>
        <p>
          The O(n²) DP: len[i] is the longest increasing subsequence ending at i, and it extends the best len[j] for an earlier,
          smaller value. That is enough for n up to a few thousand, and it adapts to weights (Best Team With No Conflicts), counts
          (Number of Longest Increasing Subsequence) and other orders such as "divides" (Largest Divisible Subset).
        </p>
        <p>
          For n up to 10⁵ you need <b>patience sorting</b>. Keep tails[k] = the smallest value that can end an increasing subsequence
          of length k + 1. tails is always sorted, so each new value finds its place by binary search: past the end, it makes the
          longest subsequence longer; otherwise it replaces a larger tail, making that length easier to extend later.
        </p>
      </div>
      <Walkthrough
        title="Patience sorting: one binary search per value"
        frames={lis.frames}
        caption={`Green means the longest subsequence grew; amber means a tail got smaller. Length: ${lis.length}.`}
      />
      <Recipe
        name="Longest increasing subsequence in O(n log n)"
        when="you need the length of the longest increasing (or non-decreasing) subsequence and n is large."
        steps={[
          'Start with an empty tails list.',
          'For each value, binary search tails for the first entry ≥ the value (for non-decreasing: the first entry > the value).',
          'If no entry qualifies, append the value; otherwise overwrite that entry.',
          'The answer is the length of tails. For two-dimensional items, sort by the first dimension (ties in reverse by the second) and run this on the second.',
        ]}
        why="for every length, keeping the smallest possible tail can only make future extensions easier, and tails stays sorted so binary search applies."
        time="O(n log n)"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 2: Two sequences, one table</h2>
        <p>
          lcs[i][j] is the LCS of the first i characters of one string and the first j of the other. Many problems are LCS in
          disguise. Delete Operation for Two Strings keeps the LCS and deletes the rest. Uncrossed Lines draws lines between equal
          numbers that may not cross, which forces the same order on both sides: a common subsequence. Shortest Common Supersequence
          shares the LCS and walks the table backwards to build the answer.
        </p>
      </div>
      <Recipe
        name="Two-prefix table"
        when="the question compares, aligns or merges two sequences."
        steps={[
          'Define dp[i][j] for the first i elements of one sequence and the first j of the other; row 0 and column 0 are the empty prefixes.',
          'Fill the base row and column (0 for LCS, i or j for edit distance, running sums for weighted deletions).',
          'For each cell: if the last elements match, consider the diagonal; always consider dropping the last element of either prefix (up or left).',
          'Combine with max, min, OR or +, depending on the question, and read dp[n][m].',
          'To recover the actual sequence, walk back from dp[n][m] following the choices.',
        ]}
        why="in any solution, the last elements of the two prefixes either pair with each other or one of them is not used."
        time="O(n · m)"
        space="O(min(n, m)) with two rows"
      />

      <div className="prose">
        <h2>Pattern 3: Edit the strings</h2>
        <p>
          Edit distance asks for the fewest insertions, deletions and replacements. The last operation is one of three: replace
          (diagonal), delete from the first word (up), or insert into it (left). Distinct Subsequences counts instead of minimising:
          each character of s is skipped, or used to match the last character of t, and the two counts add. Interleaving String asks
          whether the next character of s3 can come from s1 or from s2.
        </p>
      </div>
      <Walkthrough
        title='Edit distance from "lead" to "deal"'
        frames={edit.frames}
        caption={`Each cell is free on a match, otherwise 1 + the cheapest of replace, delete and insert. Distance: ${edit.distance}.`}
      />
      <TableWrap>
        <thead>
          <tr>
            <th>Problem</th>
            <th>Cell holds</th>
            <th>On a match</th>
            <th>Otherwise</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Longest Common Subsequence</td><td>Longest length</td><td>diagonal + 1</td><td>max(up, left)</td></tr>
          <tr><td>Edit Distance</td><td>Fewest operations</td><td>diagonal</td><td>1 + min(diagonal, up, left)</td></tr>
          <tr><td>Minimum ASCII Delete Sum</td><td>Cheapest deletions</td><td>diagonal</td><td>min(up + code, left + code)</td></tr>
          <tr><td>Distinct Subsequences</td><td>Number of ways</td><td>up + diagonal</td><td>up</td></tr>
          <tr><td>Interleaving String</td><td>true / false</td><td colSpan={2}>(up and s1 supplies the next character) or (left and s2 supplies it)</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Pattern 4: Palindromes</h2>
        <p>
          For palindromic <b>substrings</b>, expand around every centre (each character and each gap between characters): there are
          2n − 1 centres and the total work is <Cost>O(n²)</Cost> with no table. For palindromic <b>subsequences</b>, use a range
          table: lps[i][j] = lps[i + 1][j − 1] + 2 when the ends match, otherwise the better of dropping either end. Fill it by
          increasing length (i downwards), because each range needs the ranges inside it. Minimum insertions to make a palindrome is
          n − LPS, and fewest palindrome cuts combines a palindrome table with a prefix DP.
        </p>
      </div>
      <Recipe
        name="Palindromes"
        when="the question asks for palindromic substrings, subsequences, or partitions."
        steps={[
          'Substrings: for each of the 2n − 1 centres, expand outwards while the ends match; each step is one palindrome.',
          'Subsequences: lps[i][i] = 1; for i from the end down and j above i, wrap matching ends (+2) or drop one end.',
          'Partitions: precompute which s[i..j] are palindromes, then run a prefix DP over the last piece.',
          'Many palindrome questions reduce to LPS: insertions = n − LPS, and LPS = LCS(s, reverse of s).',
        ]}
        why="a palindrome with its two ends removed is still a palindrome, so every palindrome grows from a smaller one."
        time="O(n²)"
        space="O(1) for centres, O(n²) for range tables"
      />

      <div className="prose">
        <h2>Pattern 5: Pattern matching</h2>
        <p>
          match[i][j] says whether the first i characters of the text match the first j characters of the pattern. A literal
          character or a single-character wildcard must match and moves diagonally. A star is the interesting part: it can match
          nothing (move left in the pattern), or absorb one more character of the text while staying available (move up). In
          Regular Expression Matching the star belongs to the character before it, so "skip" jumps back two pattern positions.
        </p>
      </div>
      <Recipe
        name="Wildcard table"
        when={'a pattern with ".", "?" or "*" must match an entire string.'}
        steps={[
          'match[0][0] = true. Fill row 0 for patterns that can match the empty string (only stars, or "x*" pairs).',
          'A plain character, "." or "?": match[i][j] = (it fits s[i − 1]) and match[i − 1][j − 1].',
          'Wildcard "*": match nothing (match[i][j − 1]) or one more character (match[i − 1][j]).',
          'Regex "x*": match nothing (match[i][j − 2]) or one more x (x fits s[i − 1] and match[i − 1][j]).',
          'Return match[n][m].',
        ]}
        why="a star either contributes nothing or contributes one more character and stays, which covers every possible number of repeats."
        time="O(n · m)"
        space="O(n · m), or O(m) with rolling rows"
      />

      <div className="prose">
        <h2>Worked example: Russian Doll Envelopes</h2>
        <p>
          Envelopes have a width and a height; one fits inside another only if both are strictly smaller. How many can be nested?
        </p>
        <Step n={1}>Brute force first</Step>
        <p>
          Sort by width and run the O(n²) LIS on the envelopes, checking both dimensions. Correct, but with 10⁵ envelopes that is
          10¹⁰ steps.
        </p>
        <Step n={2}>Reduce to one dimension</Step>
        <p>
          After sorting by width, any nesting sequence has increasing widths, so you only need increasing heights: the longest
          increasing subsequence of the heights, which patience sorting finds in <Cost>O(n log n)</Cost>.
        </p>
        <Step n={3}>Fix the trap</Step>
        <p>
          Two envelopes with the same width cannot nest, but if [3, 4] comes before [3, 5], the heights 4, 5 look increasing. Sort
          equal widths by height <b>descending</b>: then same-width envelopes appear as 5, 4, which can never both be in a strictly
          increasing run.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          Sorting plus patience sorting: <Cost>O(n log n)</Cost> time, <Cost>O(n)</Cost> space. Identical envelopes count once.
          A single envelope gives 1.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Off-by-one indexing: dp[i][j] describes the first i and j elements, so the characters compared are at i − 1 and j − 1.</>,
          <>Confusing subsequence (gaps allowed) with substring or subarray (contiguous). They need different states.</>,
          <>Using lower bound for a non-decreasing LIS, or upper bound for a strictly increasing one.</>,
          <>Reading the tails array as if it were the actual LIS.</>,
          <>Filling a range table in the wrong order; inner ranges must be ready first.</>,
          <>Forgetting row 0 in pattern matching: "a*" or "*" can match the empty string.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Run patience sorting on [2, 5, 3, 7, 4, 8]. Write tails after each value.',
            solution: '[2], [2, 5], [2, 3], [2, 3, 7], [2, 3, 4], [2, 3, 4, 8]. Length 4 (for example 2, 3, 7, 8 or 2, 3, 4, 8).',
          },
          {
            task: 'Fill the LCS table for "abc" and "acb". What is the LCS length?',
            solution: 'Length 2 ("ab" or "ac"). The last row reads 0, 1, 2, 2.',
          },
          {
            task: 'What is the edit distance from "cat" to "cut"? From "" to "abc"?',
            solution: '1 (replace "a" with "u"). 3 (three inserts).',
          },
          {
            task: 'Does the pattern "b*a.c" match the string "aqc" under the regular-expression rules? Explain the role of "b*".',
            solution: 'Yes. "b*" matches zero b\'s, "a" matches "a", "." matches "q" and "c" matches "c".',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'In patience sorting, a new value is smaller than some tails. What happens?',
            options: [
              'It is appended at the end',
              'It replaces the first tail that is ≥ it',
              'It is ignored',
              'It replaces the last tail',
            ],
            answer: 1,
            why: 'A subsequence of that length can now end with a smaller value, which can only help later values extend it.',
          },
          {
            q: 'For LCS, the last characters of the two prefixes differ. What is lcs[i][j]?',
            options: ['lcs[i − 1][j − 1]', 'lcs[i − 1][j − 1] + 1', 'max(lcs[i − 1][j], lcs[i][j − 1])', '0'],
            answer: 2,
            why: 'At least one of the two last characters is not in the LCS, so drop one of them and keep the better result.',
          },
          {
            q: 'Delete Operation for Two Strings has strings of lengths 5 and 7 whose LCS is 3. How many deletions?',
            options: ['2', '4', '6', '9'],
            answer: 2,
            why: 'Keep the LCS and delete the rest: 5 + 7 − 2 × 3 = 6.',
          },
          {
            q: 'Why does Russian Doll Envelopes sort equal widths by height descending?',
            options: [
              'To make the binary search faster',
              'So two envelopes of the same width can never both appear in a strictly increasing run of heights',
              'Because taller envelopes should come first',
              'It does not matter',
            ],
            answer: 1,
            why: 'Equal widths cannot nest; listing their heights in decreasing order keeps the LIS from chaining them.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          For two-sequence problems, write down what one cell means and what happens on a match and on a mismatch before anything
          else. Problems marked <b>Core</b> are the minimum set; mark each one Solved so the <a href="#/review">review queue</a>{' '}
          brings it back.
        </p>
      </div>
      <ProblemSet id="dp-sequences" />

      <Recap>
        <ul>
          <li>Subsequence DPs replace exponentially many subsequences with states over prefixes or ranges.</li>
          <li>LIS: O(n²) by "best ending here", O(n log n) with patience sorting; sort first for two-dimensional versions.</li>
          <li>Two sequences: on a match go diagonal, otherwise drop the last element of one side. LCS, edit distance, interleaving and matching are all this.</li>
          <li>Palindromes: expand around 2n − 1 centres for substrings, use a range table for subsequences.</li>
        </ul>
      </Recap>
    </>
  );
}
