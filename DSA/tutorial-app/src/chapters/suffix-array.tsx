import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/suffix-array';
import { lcpArray, suffixArray } from '../traces/suffix-array';
import { Walkthrough } from '../viz/Walkthrough';

const built = suffixArray('cocoa');
const lcp = lcpArray('cocoa', built.sa);

export default function SuffixArray() {
  return (
    <>
      <TopicIntro
        id="suffix-array"
        time="3–4 hours, plus problems"
        before={['string-matching', 'rolling-hash', 'sorting', 'range-queries']}
        learn={[
          'What a suffix array is, and how prefix doubling builds it in O(n log n) to O(n log² n)',
          "The LCP array with Kasai's algorithm, and the questions it answers at once",
          'Finding every occurrence of a word with binary search over sorted suffixes',
          'One suffix array for several strings, using separators',
          'What suffix automata and suffix trees are, and when they beat a suffix array',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          The index at the back of a book lists words in alphabetical order with their page numbers, so you can find any word
          quickly. A <b>suffix array</b> is that index for every position of a string: it lists all suffixes (the string from
          position i to the end) in dictionary order, storing just their starting positions.
        </p>
        <p>
          Why suffixes? Every substring is the beginning of some suffix. So questions about all n² / 2 substrings, such as "which
          substrings repeat?" or "how many different ones are there?", become questions about n sorted suffixes and how much
          neighbouring suffixes have in common. A string of length 10⁵ has 5 × 10⁹ substrings; you cannot list them, but you can
          sort 10⁵ suffixes.
        </p>
      </div>

      <Walkthrough
        title="Suffix array of cocoa by prefix doubling"
        frames={built.frames}
        caption={`Each round doubles how many letters the order accounts for, using the previous round's ranks. Result: [${built.sa.join(', ')}].`}
      />

      <div className="prose">
        <h2>The LCP array</h2>
        <p>
          The <b>LCP array</b> stores, for each suffix in sorted order, the length of its longest common prefix with the suffix
          just before it. Neighbours in sorted order are the most similar suffixes, so this one array answers a lot:
        </p>
        <ul>
          <li>The <b>longest repeated substring</b> has length max(lcp).</li>
          <li>The number of <b>distinct substrings</b> is n(n + 1)/2 − sum(lcp): each suffix adds only its prefixes longer than its LCP.</li>
          <li>The LCP of <b>any two</b> suffixes is the minimum of lcp between their ranks, a range-minimum query (<See id="range-queries" />).</li>
        </ul>
        <p>
          Comparing every neighbour letter by letter could cost <Cost>O(n²)</Cost>. Kasai's algorithm visits suffixes in text
          order instead. If suffix i shares h letters with its sorted predecessor, then suffix i + 1 shares at least h − 1 with
          its own predecessor, so the match length never restarts from zero and the whole array takes <Cost>O(n)</Cost>.
        </p>
      </div>
      <Walkthrough
        title="Kasai's LCP array for cocoa"
        frames={lcp.frames}
        caption={`LCP = [${lcp.lcp.slice(1).join(', ')}] (between neighbours). Distinct substrings of cocoa: ${lcp.distinct}.`}
      />

      <Box kind="key" label="Key idea">
        <p>
          Sort the suffixes and compare neighbours. Any two suffixes that share a long prefix sit close together in sorted order,
          and everything between them shares at least that prefix too. That is why one sorted list plus one LCP array can replace
          comparing all pairs of substrings.
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
          { name: 'Suffix array', ts: 'number[] or Int32Array: start positions in sorted order', ops: 'build O(n log² n) with comparison sorts, O(n log n) with radix sort', use: 'The sorted order of all suffixes.' },
          { name: 'Rank array', ts: 'Int32Array: rank[start] = position in the suffix array', ops: 'O(1) lookup', use: 'Going from a start position to its place in sorted order (Kasai, LCP queries).' },
          { name: 'LCP array', ts: 'Int32Array of length n', ops: 'build O(n) with Kasai', use: 'Repeats, distinct counts, LCP of any two suffixes via range minimum.' },
          { name: 'Sparse table over LCP', ts: 'number[][]', ops: 'O(n log n) build, O(1) query', use: 'LCP of arbitrary pairs of suffixes.' },
          { name: 'Suffix automaton', ts: 'arrays of states with transitions (Map or 26 slots), link and len', ops: 'build O(n) online', use: 'Distinct substrings, longest common substring of two strings, substring checks.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Suffix array and LCP</h2>
      </div>
      <Recipe
        name="Suffix array by prefix doubling"
        when="you need all suffixes in sorted order for a string or array up to about 10⁵."
        steps={[
          'Rank every suffix by its first character.',
          'For k = 1, 2, 4, …: the first 2k characters of suffix i are described by the pair (rank[i], rank[i + k]), using 0 (or −1) past the end.',
          'Sort the starts by that pair and renumber: equal pairs get equal ranks, the next different pair gets the next rank.',
          'Stop when all ranks are different. The sorted starts are the suffix array.',
        ]}
        why="if you know the order of all substrings of length k, the order of length 2k follows from comparing two halves of length k."
        time="O(n log² n) with a comparison sort; O(n log n) with a radix sort of the pairs"
        space="O(n)"
      />
      <Recipe
        name="Kasai's LCP"
        when="you have the suffix array and need the common prefix length of each pair of neighbours."
        steps={[
          'Build rank[start] from the suffix array.',
          'Keep h = 0. For i = 0 to n − 1 in text order: if rank[i] is 0, set h = 0 and continue.',
          'Let j be the suffix just before i in sorted order. Extend h while s[i + h] = s[j + h].',
          'Store lcp[rank[i]] = h, then lower h by one (if positive) before the next i.',
        ]}
        why="removing the first letter of two suffixes that share h letters leaves two suffixes sharing h − 1, and they stay in the same order, so the next suffix's predecessor shares at least h − 1."
        time="O(n)"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 2: Comparing a suffix with the whole string</h2>
        <p>
          The LCP of suffixes at ranks a &lt; b is the minimum of lcp[a + 1 .. b]. Build a sparse table over the LCP array and any
          pair costs <Cost>O(1)</Cost>. That gives "how far does the string agree with itself from position i?" (which the
          Z-array also answers), and lets you compare any two substrings exactly: compare their LCP with their lengths, then the next
          letter.
        </p>

        <h2>Pattern 3: Several sequences at once</h2>
        <p>
          To compare several strings, join them into one, putting a <b>different separator</b> after each (a character or value
          that appears nowhere else). Build one suffix array. A common substring of all strings is a common prefix of suffixes
          that start in every string. Slide a window over the sorted suffixes until it contains suffixes from every string; the
          common prefix of the window is the minimum LCP inside it. The separators make sure no match runs from one string into
          the next.
        </p>

        <h2>Pattern 4: Matching many words against one text</h2>
        <p>
          All suffixes that start with a word w sit together in one block of the suffix array, because they are sorted. Two binary
          searches find the block in <Cost>O(|w| log n)</Cost>, and every suffix in it is an occurrence of w. So one suffix array of
          the text answers "where does each of these words occur?" for a whole dictionary.
        </p>

        <h2>Suffix automata and suffix trees</h2>
        <p>
          Two other structures answer the same family of questions:
        </p>
        <ul>
          <li>
            A <b>suffix tree</b> is a trie of all suffixes with chains of single children squeezed into one edge. It has at most 2n
            nodes and can be built in <Cost>O(n)</Cost> (Ukkonen's algorithm), but the construction is long and easy to get wrong.
            A depth-first walk of a suffix tree visits suffixes in suffix array order, and the depths where branches split are the
            LCP values, so the suffix array plus LCP array carry the same information in a simpler form.
          </li>
          <li>
            A <b>suffix automaton</b> is the smallest machine that accepts exactly the substrings of a string. It has at most 2n − 1
            states, is built online one letter at a time in <Cost>O(n)</Cost>, and each state stands for a group of substrings that
            end at the same set of positions. It counts distinct substrings and finds the longest common substring of two strings
            in linear time.
          </li>
        </ul>
        <p>
          For interviews and LeetCode, the suffix array is usually the right investment: it is the simplest to write and reason
          about. Rolling hashes (<See id="rolling-hash" />) are simpler still when a probabilistic answer is acceptable.
        </p>
      </div>

      <TableWrap>
        <thead>
          <tr>
            <th>Tool</th>
            <th>Build</th>
            <th>Strengths</th>
            <th>Weaknesses</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Rolling hash + binary search</td><td>O(n log n)</td><td>Short code, flexible</td><td>Probabilistic; adversarial tests exist</td></tr>
          <tr><td>Suffix array + LCP</td><td>O(n log n)</td><td>Deterministic, moderate code, range-minimum tricks</td><td>Offline: rebuild if the string changes</td></tr>
          <tr><td>Suffix automaton</td><td>O(n)</td><td>Online, compact, distinct substrings and common substrings</td><td>Harder to understand and debug</td></tr>
          <tr><td>Suffix tree</td><td>O(n)</td><td>Most direct model of all substrings</td><td>Long, error-prone construction; heavy memory</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Worked example: counting distinct substrings</h2>
        <p>
          <b>Number of Distinct Substrings in a String</b> asks how many different substrings a string has.
        </p>
        <Step n={1}>Brute force first</Step>
        <p>
          Put every substring in a Set: n² / 2 substrings, each up to n letters to build and hash, so <Cost>O(n³)</Cost>.
        </p>
        <Step n={2}>Find the structure</Step>
        <p>
          Every substring is a prefix of a suffix. A suffix of length L has L prefixes. If every prefix of every suffix were
          different, the answer would be 1 + 2 + … + n = n(n + 1)/2. The only duplicates are prefixes shared between suffixes.
        </p>
        <Step n={3}>Prove a rule</Step>
        <p>
          Go through suffixes in sorted order. The prefixes of the current suffix that already appeared in earlier suffixes are
          exactly its first lcp[r] prefixes, because its closest earlier suffix is the one just before it. So it adds (length −
          lcp[r]) new substrings.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          Suffix array and LCP: <Cost>O(n log n)</Cost>. Answer = n(n + 1)/2 − sum(lcp). For "aaaa": 10 − (1 + 2 + 3) = 4, the
          substrings a, aa, aaa and aaaa. Correct.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Building the suffix array by sorting the suffix strings themselves: each comparison is O(n), so O(n² log n) time and O(n²) memory.</>,
          <>Forgetting that "past the end" must sort before every real character in the doubling pairs.</>,
          <>Reusing one separator for every string when joining several. Separators must differ, or matches cross the joins.</>,
          <>Mixing up rank (start → position) and sa (position → start). Kasai uses both.</>,
          <>Using a comparison sort with O(n log² n) on 4 × 10⁵ characters in JavaScript. Radix-sort the pairs or pick a linear method.</>,
          <>Taking the LCP of two arbitrary suffixes as a single lcp entry. It is the minimum over the range between their ranks.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Write the suffix array of "abab".',
            hint: 'The suffixes are abab, bab, ab, b.',
            solution: 'Sorted: ab (2), abab (0), b (3), bab (1). Suffix array [2, 0, 3, 1].',
          },
          {
            task: 'Compute the LCP array (between neighbours) for that order, and the number of distinct substrings of "abab".',
            solution: 'ab–abab: 2. abab–b: 0. b–bab: 1. Sum 3. Distinct = 10 − 3 = 7 (a, b, ab, ba, aba, bab, abab).',
          },
          {
            task: 'Ranks of two suffixes are 3 and 7. Which LCP entries decide their common prefix?',
            solution: 'The minimum of lcp[4], lcp[5], lcp[6] and lcp[7].',
          },
          {
            task: 'You join "abc" and "bcd" as "abc#bcd$". Why two different separators?',
            solution: 'A shared separator can be matched like a letter. Joining "x" and "x" as "x#x#", the suffixes at 0 and 2 share "x#", so the LCP counts the separator as part of a common substring. Separators that each appear once never match anything, so every common prefix stops at the end of its own string.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'What does a suffix array store?',
            options: ['All substrings', 'The starting positions of all suffixes in sorted order', 'A trie of the string', 'Hashes of all prefixes'],
            answer: 1,
            why: 'Just n integers. The suffixes themselves are never copied.',
          },
          {
            q: 'How do you get the longest repeated substring from the suffix array?',
            options: ['The first suffix', 'The largest LCP value', 'The smallest LCP value', 'The last suffix'],
            answer: 1,
            why: 'The two suffixes sharing the longest prefix are neighbours in sorted order, so their LCP is the largest entry.',
          },
          {
            q: 'Why is Kasai\'s algorithm linear?',
            options: [
              'It sorts in linear time',
              'The match length drops by at most one between consecutive text positions, so it never restarts from zero',
              'It uses hashing',
              'It only compares the first letter',
            ],
            answer: 1,
            why: 'h increases at most n times in total and decreases by one per step, so the total work is O(n).',
          },
          {
            q: 'Which structure is built online, one letter at a time, in O(n)?',
            options: ['Suffix array by doubling', 'Suffix automaton', 'Sparse table', 'LCP array'],
            answer: 1,
            why: 'The suffix automaton extends itself with each new letter. The suffix array needs the whole string up front.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          LeetCode has only a handful of problems built for suffix structures, and most also have a hashing or Z-array solution.
          Solve each one both ways when you can: the second method is where the understanding comes from.
        </p>
      </div>
      <ProblemSet id="suffix-array" />

      <Recap>
        <ul>
          <li>A suffix array lists suffix starts in sorted order; prefix doubling builds it from ranks of length 1, 2, 4, ….</li>
          <li>Kasai's LCP array, in O(n), gives the longest repeat (max), distinct substrings (n(n + 1)/2 − sum) and any pair's LCP (range minimum).</li>
          <li>All occurrences of a word form one block of the suffix array, found by binary search.</li>
          <li>Several strings: join with unique separators and slide a window that covers every string.</li>
          <li>Suffix trees and automata answer the same questions in O(n) build time, at the price of harder code.</li>
        </ul>
      </Recap>
    </>
  );
}
