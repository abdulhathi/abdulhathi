import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/string';
import { anagramCount, expandAroundCentre, zigzagLayout } from '../traces/string';
import { VizFigure } from '../viz/Viz';
import { Walkthrough } from '../viz/Walkthrough';

const palindrome = expandAroundCentre('cabbad');
const anagram = anagramCount('care', 'race');
const zigzag = zigzagLayout('DATASTRUCTURES', 4);

export default function StringChapter() {
  return (
    <>
      <TopicIntro
        id="string"
        time="5–6 hours, plus problems"
        before={['array']}
        learn={[
          'How TypeScript strings work: immutable, indexed by UTF-16 code units, and costly to build one character at a time',
          'Counting characters with a 26-slot array or a Map, and canonical keys for grouping',
          'Careful parsing, building output efficiently, and formatting by rules',
          'Palindromes by expanding around centres, and comparison tricks such as searching inside s + s',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          A string is an array of characters with two twists. First, in TypeScript a string <b>cannot be changed</b>: every "edit"
          creates a new string. Second, the alphabet is usually small (26 lowercase letters, or 128 ASCII characters), which makes
          counting cheap: a fixed array of 26 counters describes the letters of a string of any length.
        </p>
        <p>
          Most string problems are array problems in disguise, solved with the same tools: two pointers for palindromes and reversals,
          sliding windows for "longest substring with...", hash maps for grouping. This chapter covers what is special to text:
          counting letters, building strings without hidden O(n²) costs, parsing by rules, palindromes and a few comparison tricks.
          The heavy machinery for searching a pattern inside a text has its own chapter, <See id="string-matching" />.
        </p>
        <p>The single most useful string idea is counting. Watch two strings turn into one table of counts:</p>
      </div>

      <Walkthrough
        title="Valid Anagram: one count per letter"
        frames={anagram.frames}
        caption="Add for every letter of the first string, subtract for every letter of the second. All zeros means the same letters."
      />

      <Box kind="key" label="Key idea">
        <p>
          When the order of letters does not matter, replace the string by its <b>letter counts</b>. Anagram checks, "can I build
          this word?", grouping, and many sliding-window problems all become comparisons of small count tables.
        </p>
      </Box>

      <div className="prose">
        <h2>How strings work in TypeScript</h2>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Operation</th>
            <th>Cost</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>s[i], s.charCodeAt(i)</td><td>O(1)</td><td>Reading a character. charCodeAt gives a number, handy for counting: code − 97 maps a to z onto 0 to 25.</td></tr>
          <tr><td>s.length</td><td>O(1)</td><td>Counted in UTF-16 code units, so an emoji can count as 2.</td></tr>
          <tr><td>s.slice(a, b), substring</td><td>O(b − a)</td><td>Creates a new string. Slicing inside a loop adds a hidden factor.</td></tr>
          <tr><td>s + t</td><td>O(|s| + |t|) in the worst case</td><td>Engines optimise some concatenation, but building a long string one piece at a time is safest with an array and join.</td></tr>
          <tr><td>split, join</td><td>O(n)</td><td>split("") gives an array of characters you can edit; join("") turns it back.</td></tr>
          <tr><td>a === b, a &lt; b</td><td>O(n)</td><td>Comparison is by UTF-16 code units, character by character ("Z" &lt; "a").</td></tr>
          <tr><td>indexOf, includes</td><td>O(n · m) worst case</td><td>Fine for small inputs; for guaranteed linear search see <See id="string-matching" />.</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>When to use it</h2>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
      </div>
      <Structures
        items={[
          { name: 'Count array', ts: 'new Array(26).fill(0), or Int32Array(26)', ops: 'O(1) per update; O(26) to compare', use: 'Letter counts when the alphabet is small and known.' },
          { name: 'Count map', ts: 'Map<string, number>', ops: 'O(1) average per update', use: 'Counts over a large or unknown alphabet: Unicode, words, mixed characters.' },
          { name: 'Character array', ts: 'string[] from split("")', ops: 'O(1) per edit; join O(n)', use: 'Editing in place: reversing, swapping, compressing.' },
          { name: 'List of pieces', ts: 'string[] with push, then join', ops: 'O(1) amortized per push, O(n) to join', use: 'Building any output from many small parts.' },
          { name: 'Canonical key', ts: 'a string built from counts or sorted letters', ops: 'O(k) or O(k log k) to build', use: 'Grouping strings that are equivalent (anagrams, shifted strings).' },
          { name: 'Two maps', ts: 'two Map objects', ops: 'O(1) per check', use: 'Checking a one-to-one correspondence in both directions.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Count characters</h2>
        <p>
          With 26 lowercase letters, an array of 26 numbers indexed by charCodeAt minus 97 is the fastest counter there is. Add for
          one string and subtract for the other to compare them; spend counts to check whether one string can be built from another;
          and write the counts out as a string to make a <b>canonical key</b> for grouping. Use a Map instead when the alphabet is large
          or unknown.
        </p>
      </div>
      <Recipe
        name="Count letters"
        when="the order of characters does not matter: anagrams, building one string from another, frequency questions, grouping."
        steps={[
          'Pick the counter: an array of 26 for lowercase letters, a Map for anything else.',
          'Count one string (or both, adding for one and subtracting for the other).',
          'Answer from the counts: all zero, none negative, the first with count 1, and so on.',
          'To group strings, turn each count table into a key string (with separators) and use it in a Map.',
        ]}
        why="two strings have the same multiset of letters exactly when their count tables are equal."
        time="O(n)"
        space="O(alphabet size)"
      />

      <div className="prose">
        <h2>Pattern 2: Build strings efficiently</h2>
        <p>
          Because strings are immutable, "add a character to the end" may copy the whole string. Do it n times and you can pay
          O(n²). The safe habit: push pieces into an array and join once at the end. For edits in place (reversing words, compressing),
          split the string into an array of characters, edit the array, and join it back. Problems like Zigzag Conversion are really
          about deciding which list each character goes into.
        </p>
      </div>
      <VizFigure
        parts={[zigzag.grid]}
        caption={`Written in a zigzag on 4 rows, then read row by row: ${zigzag.result}. You only need to track the row number, which bounces between the first and last row.`}
      />
      <Recipe
        name="Build output from pieces"
        when="the answer is a new string assembled from many parts, or a string must be edited."
        steps={[
          'Decide the units: characters, words, runs of equal characters, or rows.',
          'Collect the units in an array (or one array per row or group).',
          'Transform the array: reverse it, reorder it, repeat pieces.',
          'Join once at the end.',
        ]}
        why="each piece is copied once, into the final string, instead of once per concatenation."
        time="O(n)"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 3: Parse carefully</h2>
        <p>
          Parsing problems (string to integer, Roman numerals, equations) are not hard, they are precise. Walk the string with one index
          and go through explicit phases: skip spaces, read a sign, read digits, stop. Write down every rule in the statement as a
          separate check, and test the edge cases you can think of: empty input, only spaces, a sign with no digits, overflow.
        </p>
      </div>
      <Recipe
        name="Parse with one index"
        when="text must be turned into a value (or checked) according to a list of rules."
        steps={[
          'List the phases the input goes through, such as spaces, sign, digits.',
          'Keep one index i and advance it phase by phase, never skipping a check.',
          'Accumulate the value as you go (result × 10 + digit), clamping or stopping as soon as a limit is crossed.',
          'Return what you have when a character does not fit the current phase.',
        ]}
        why="each character is handled exactly once, by the phase it belongs to."
        time="O(n)"
        space="O(1)"
      />

      <div className="prose">
        <h2>Pattern 4: Palindromes</h2>
        <p>
          A palindrome mirrors around its centre. An odd-length palindrome has a middle character; an even-length one has a middle gap.
          So there are only 2n − 1 possible centres, and from each one you can expand outwards while the two ends match. That finds the
          longest palindromic substring, and counts all of them, in <Cost>O(n²)</Cost> time with <Cost>O(1)</Cost> space. Checking
          whether a whole string is a palindrome is the opposite-ends walk from <See id="two-pointers" />.
        </p>
      </div>
      <Walkthrough
        title="Expand around every centre"
        frames={palindrome.frames}
        caption={`Each frame shows the palindrome found at one centre; blue marks the best so far. Longest: "${palindrome.best}", found at an even centre.`}
      />
      <Recipe
        name="Expand around centres"
        when="you need the longest palindromic substring, or the number of palindromic substrings, and n is up to a few thousand."
        steps={[
          'For each index i, use two centres: (i, i) for odd lengths and (i, i + 1) for even lengths.',
          'Expand: move L left and R right while both are in range and s[L] equals s[R].',
          'Each successful step is one palindrome (for counting); the final window s[L + 1 .. R − 1] is the longest at this centre.',
          'Keep the best or the running count.',
        ]}
        why="every palindrome is found from its own centre, and an expansion stops at the first mismatch, beyond which nothing at this centre can be a palindrome."
        time="O(n²)"
        space="O(1)"
      />

      <div className="prose">
        <h2>Pattern 5: Compare and match</h2>
        <p>
          Two classic tricks. For a common prefix, compare <b>column by column</b> across all strings and stop at the first disagreement.
          For rotations and repeats, look inside <b>s + s</b>: every rotation of s is a window of s + s, and s is made of a repeated block
          exactly when s appears in s + s at some position other than the start or the end.
        </p>
      </div>
      <Recipe
        name="Search inside s + s"
        when="the question is about rotations of a string, or whether a string is a block repeated several times."
        steps={[
          'For a rotation check, first compare lengths; then search for the target in s + s.',
          'For a repetition check, remove the first and last characters of s + s and search for s in what remains.',
          'Use the built-in search for small inputs, or KMP for a guaranteed linear time.',
        ]}
        why="rotating s by k is the window of s + s that starts at k; a repeat of block length L reappears when you rotate by L."
        time="O(n) with KMP"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 6: Map one string to another</h2>
        <p>
          "Isomorphic" and "follows the pattern" mean there is a one-to-one correspondence: each symbol on one side always matches the
          same symbol on the other, and no two symbols share a partner. One map checks the first condition; a second map in the
          opposite direction checks the second. Skipping the second map is the classic wrong answer.
        </p>
      </div>
      <Recipe
        name="Check a one-to-one mapping"
        when="symbols of one sequence must correspond exactly to symbols of another."
        steps={[
          'Check the lengths (or word counts) match.',
          'Keep a forward map and a backward map.',
          'At each position, if either map already holds a different partner, return false; otherwise record the pair in both.',
          'If the loop finishes, the mapping is one-to-one.',
        ]}
        why="the forward map rules out one symbol with two partners; the backward map rules out two symbols with one partner."
        time="O(n)"
        space="O(number of distinct symbols)"
      />

      <div className="prose">
        <h2>Pattern 7: Formatting by rules</h2>
        <p>
          Text justification and numbers in English look intimidating because they have many rules, but each is a short loop once you
          break the output into chunks: lines of words, or groups of three digits. Solve one chunk with a helper, then assemble the chunks.
          Integer to Roman is the same idea with a table: include the subtractive pairs and take the largest symbol that fits, greedily.
        </p>
      </div>

      <div className="prose">
        <h2>Worked example: Longest Palindromic Substring</h2>
        <Step n={1}>Brute force first</Step>
        <p>
          Try every substring (about n²/2 of them) and check each for being a palindrome (O(n) each): <Cost>O(n³)</Cost>. For n = 1,000
          that is around 10⁸ to 10⁹ character comparisons, too slow.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          Checking "abcba" and then "xabcbax" repeats the work: the second is a palindrome exactly when the first is and the two new end
          characters match. Palindromes are built from the inside out.
        </p>
        <Step n={3}>Find the rule</Step>
        <p>
          So grow them from the inside. Every palindrome has a centre, one of 2n − 1 positions (each character, each gap). From each
          centre, extend one character on each side while they match. The last successful extension is the longest palindrome around that
          centre.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          2n − 1 centres, each expanding at most n/2 steps: <Cost>O(n²)</Cost> time and <Cost>O(1)</Cost> space, about 500,000 steps for
          n = 1,000. A single character is a palindrome, so the answer is never empty. Forgetting the gap centres would miss every
          even-length answer, such as "abba".
        </p>
      </div>

      <Pitfalls
        items={[
          <>Building a long string with repeated + inside a loop; push pieces into an array and join once.</>,
          <>Calling slice or substring inside a loop to compare windows, which quietly adds a factor of n.</>,
          <>Splitting on a single space when words can be separated by several; filter out the empty strings.</>,
          <>Using a plain object as a map of words: keys like "constructor" collide with built-in properties. Use Map.</>,
          <>Forgetting that upper and lower case are different characters, and that s.length counts UTF-16 units, not visible characters.</>,
          <>Checking only one direction of a mapping in isomorphism problems.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Build the letter-count key for "tea" and for "eat" (counts of a, e and t only). Do they match? What about "tee"?',
            solution: '"tea" and "eat" both have a:1, e:1, t:1, so the keys match. "tee" has e:2, t:1 and no a, so its key differs.',
          },
          {
            task: 'List the 2n − 1 centres of "abab" and the longest palindrome found at each.',
            solution: 'Odd centres a, b, a, b give "a", "aba", "bab", "b". The even gaps (a|b, b|a, a|b) give nothing. The longest is "aba" (or "bab"), length 3.',
          },
          {
            task: 'Is "cdeab" a rotation of "abcde"? Use the s + s trick.',
            solution: 'Yes: "abcdeabcde" contains "cdeab" starting at index 2, and the lengths match.',
          },
          {
            task: 'Why does checking only s → t accept "ab" and "cc" as isomorphic, and how does the second map reject it?',
            solution: 'a → c and b → c are each consistent on their own, so the forward map sees no conflict. The backward map records c → a, then finds c should also map to b, a conflict.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'What is the best way to build a long output string from many small pieces in TypeScript?',
            options: ['Repeated s = s + piece', 'Push the pieces into an array and join once', 'Use slice on each step', 'Use a Set'],
            answer: 1,
            why: 'Each piece is copied once into the result, instead of possibly copying the growing string on every step.',
          },
          {
            q: 'How many centres does "expand around centre" try for a string of length n?',
            options: ['n', 'n / 2', '2n − 1', 'n²'],
            answer: 2,
            why: 'n characters for odd-length palindromes and n − 1 gaps for even-length ones.',
          },
          {
            q: 'Which key groups anagrams correctly?',
            options: ['The first letter', 'The length', 'The letters sorted, or the 26 counts written with separators', 'The sum of the character codes'],
            answer: 2,
            why: 'Anagrams share exactly their multiset of letters. Sums of codes collide: "ad" and "bc" have the same sum.',
          },
          {
            q: 'goal is a rotation of s exactly when...',
            options: ['goal is a substring of s', 'they have the same letters', 'they have the same length and goal is a substring of s + s', 'reversing s gives goal'],
            answer: 2,
            why: 'Every rotation of s is a window of s + s; the length check rules out shorter matches.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          String problems reward careful reading. Before coding, list the edge cases the statement implies: empty strings, spaces, case,
          the alphabet. Substring problems with a "longest" or "shortest" are in <See id="sliding-window" />; pattern search is in{' '}
          <See id="string-matching" />.
        </p>
      </div>
      <ProblemSet id="string" />

      <Recap>
        <ul>
          <li>TypeScript strings are immutable: read characters in O(1), but build output with an array of pieces and one join.</li>
          <li>When order does not matter, count letters: a 26-slot array compares, spends and keys strings in linear time.</li>
          <li>Palindromes come from expanding around 2n − 1 centres; rotations and repeats show up inside s + s.</li>
          <li>Parse with one index through explicit phases, check mappings in both directions, and format by solving one chunk at a time.</li>
        </ul>
      </Recap>
    </>
  );
}
