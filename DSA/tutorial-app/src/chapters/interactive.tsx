import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/interactive';
import { firstBadVersion, mountainSearch } from '../traces/interactive';
import { Walkthrough } from '../viz/Walkthrough';

const bad = firstBadVersion(12, 8);
const mountain = mountainSearch([1, 3, 5, 8, 12, 9, 7, 4, 2], 7);

export default function Interactive() {
  return (
    <>
      <TopicIntro
        id="interactive"
        time="2–3 hours, plus problems"
        before={['binary-search', 'two-pointers', 'dfs']}
        learn={[
          'How interactive problems work on LeetCode: a hidden input behind an API, and a limit on calls',
          'Budgeting queries: why 100 calls on 10⁴ items means a few binary searches',
          'Binary search, exponential search and staircase walks driven by an API',
          'Eliminating candidates with each query, and exploring a world you cannot see with DFS',
          'How to test your solution locally with a mock judge that counts calls',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          In a normal problem you get the whole input. In an <b>interactive</b> problem the input is hidden inside a judge, and
          you learn about it only by asking: "is version 6 bad?", "what is at index 42?", "how many letters does this word share
          with the secret?". On LeetCode the judge is an object or function you call (isBadVersion, MountainArray.get,
          Master.guess). Usually there is a <b>budget</b>: a maximum number of calls, or a score based on how few you use.
        </p>
        <p>
          So the algorithm is really a <b>questioning strategy</b>. Think of the game twenty questions: a good question splits
          the remaining possibilities in half, whatever the answer. Interactive problems reward exactly that.
        </p>
      </div>

      <Walkthrough
        title="First Bad Version: every question halves the range"
        frames={bad.frames}
        caption={`The first bad version of 12 is ${bad.answer}, found with ${bad.calls} calls to the API.`}
      />

      <Box kind="key" label="Key idea">
        <p>
          Before writing anything, compare the budget with the size of the search space. k yes/no answers can tell apart at most
          2ᵏ possibilities, so a budget of about log₂ n calls means binary search, a few times log₂ n means a few binary searches
          in a row, and a budget near n means you may scan once. The limit tells you which algorithm is expected.
        </p>
      </Box>

      <TableWrap>
        <thead>
          <tr>
            <th>Search space n</th>
            <th>log₂ n (one binary search)</th>
            <th>Typical meaning of the budget</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>10⁴</td><td>about 14</td><td>A limit of 100 allows several binary searches, never a scan</td></tr>
          <tr><td>10⁹</td><td>about 30</td><td>"Minimise calls": binary search</td></tr>
          <tr><td>2³¹ − 1</td><td>31</td><td>Guess Number, First Bad Version</td></tr>
          <tr><td>100 words, 10 guesses</td><td>not enough for halving alone</td><td>Each answer must cut the candidates by much more than half on average</td></tr>
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
          { name: 'Two bounds', ts: 'let lo, hi (numbers)', ops: 'O(1)', use: 'The range of indices or values still possible.' },
          { name: 'Read cache', ts: 'Map<number, number>', ops: 'O(1) average', use: 'Remembering values already read so a repeated get() does not cost another call.' },
          { name: 'Candidate list', ts: 'string[] or number[]', ops: 'O(n) filter per answer', use: 'Words or people still consistent with every answer so far.' },
          { name: 'Visited set in relative coordinates', ts: 'Set<string> with "x,y"', ops: 'O(1) average', use: 'Exploring an unseen grid with a robot.' },
          { name: 'Leftover buffer', ts: 'string[] plus a read index', ops: 'O(1) per character', use: 'Chunked readers like read4 that are called many times.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Binary search through an API</h2>
      </div>
      <Recipe
        name="Binary search with a judge"
        when="the judge answers a monotone question (too high or too low, good or bad) over a range."
        steps={[
          'Set lo and hi to the first and last possible answers.',
          'Ask about mid = lo + ⌊(hi − lo) / 2⌋.',
          'Shrink the range to the half that can still contain the answer. For "first true", keep mid when it is true (hi = mid) and skip it when false (lo = mid + 1).',
          'Stop when lo equals hi (or when the judge says "correct"), and return lo.',
        ]}
        why="each answer removes half of the remaining candidates, so ⌈log₂ n⌉ questions always suffice."
        time="O(log n) queries"
        space="O(1)"
      />
      <div className="prose">
        <p>
          When the size is unknown (reading past the end returns a sentinel), first find a bound by <b>exponential search</b>:
          read at 1, 2, 4, 8, … until the value reaches the target, then binary search inside the last doubling. Both phases use{' '}
          <Cost>O(log k)</Cost> reads, where k is the target's position. When a matrix's rows are sorted, a <b>staircase walk</b>{' '}
          from the top-right corner (left on a 1, down on a 0) needs at most rows + columns reads, which beats a binary search in
          every row.
        </p>

        <h2>Pattern 2: Searching hidden structured data</h2>
        <p>
          The problem promises a structure: a mountain shape, a function increasing in both arguments. Use it to pick questions
          that discard as much as possible. On a mountain, comparing get(mid) with get(mid + 1) says which side of the peak you
          are on; after that, each side is sorted. On a function increasing in x and y, start at the smallest x and largest y: a
          value that is too big rules out that whole y, too small rules out that whole x, exactly the{' '}
          <See id="two-pointers" /> argument on a grid.
        </p>
      </div>
      <Walkthrough
        title="Find in Mountain Array: peak first, then each side"
        frames={mountain.frames}
        caption={`Target 7 is at index ${mountain.answer}; ${mountain.calls} calls to get().`}
      />

      <div className="prose">
        <h2>Pattern 3: Elimination by queries</h2>
        <p>
          Some judges answer questions about pairs or candidates. Then think in terms of <b>what each answer rules out</b>. In
          Find the Celebrity, knows(a, b) eliminates one of the two people whatever the answer: if a knows b, a is not the
          celebrity; if not, b is not. One pass leaves a single candidate, which you then verify. In Guess the Word, each answer
          (the number of matching positions) keeps only the words with that same match count; choose the guess whose worst-case
          group of survivors is smallest.
        </p>
      </div>
      <Recipe
        name="Candidate elimination"
        when="every query answer is consistent with only some of the candidates, and the budget is limited."
        steps={[
          'Keep the set of candidates consistent with every answer so far.',
          'For each possible query, imagine every possible answer and count how many candidates would survive each one.',
          'Ask the query whose largest surviving group is smallest (minimax). If a query always eliminates one candidate, a simple pass is enough.',
          'Filter the candidates by the actual answer and repeat; verify the last candidate if the problem allows "none".',
        ]}
        why="minimising the worst case guarantees steady progress no matter what the hidden answer is."
        time="O(queries × cost of scoring)"
        space="O(candidates)"
      />

      <div className="prose">
        <h2>Pattern 4: Exploring a hidden world</h2>
        <p>
          In Robot Room Cleaner you control a robot that can move, turn and clean, but you never see the room or your position.
          Keep your own coordinates relative to the start and a set of visited cells, and run a <See id="dfs" />: clean the cell,
          try the four directions, and after exploring a neighbour, physically come back (turn around, step, turn around again)
          so the robot is where your recursion thinks it is, facing the same way.
        </p>

        <h2>Pattern 5: Stateful readers</h2>
        <p>
          A reader that only returns fixed-size chunks (read4) forces you to copy carefully: take only as many characters as you
          still need, stop at the end of the file, and, if read is called repeatedly, keep the unused part of the last chunk for
          the next call.
        </p>
      </div>

      <Box kind="tip" label="Test with a mock judge">
        <p>
          You cannot see LeetCode's judge, so build your own in a scratch file. Make an object that holds the hidden answer (the
          first bad version, the secret word, the mountain array), exposes the same API as the problem, counts every call, and
          throws an error if the count passes the limit. Then run your strategy against many hidden answers, including the
          edges: the first and last positions, a target that is missing, the smallest possible input. If your call count stays
          within the budget on every case, the submission will too.
        </p>
      </Box>

      <div className="prose">
        <h2>Worked example: Find in Mountain Array</h2>
        <Step n={1}>Brute force first</Step>
        <p>
          Read every element and return the first index holding the target. Up to 10⁴ reads; the limit is 100. Rejected.
        </p>
        <Step n={2}>Use the structure</Step>
        <p>
          The array rises then falls. Comparing two neighbours tells you whether you are left or right of the peak, so the peak
          can be found by binary search with two reads per step: about 28 reads.
        </p>
        <Step n={3}>The rule</Step>
        <p>
          Each side of the peak is sorted: increasing on the left, decreasing on the right. Binary search the left side first,
          because the problem wants the smallest index and a value can appear on both sides. If it is not there, binary search the
          right side with the comparison reversed.
        </p>
        <Step n={4}>Cost and edge cases</Step>
        <p>
          About 28 + 14 + 14 = 56 reads in the worst case, within 100. Caching reads in a map saves a few more. The peak itself
          belongs to the left search, so a target equal to the peak is found there.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Scanning when the budget only allows logarithmic queries.</>,
          <>Misreading the API's sign convention (in Guess Number, −1 means your guess was too high).</>,
          <>Setting hi = mid − 1 in a "first true" search and skipping the answer.</>,
          <>Forgetting to verify the final candidate in elimination problems that may have no answer.</>,
          <>In DFS with a physical robot, not restoring its position and direction after each branch.</>,
          <>Reading the same index twice and paying for it; cache reads when the budget is tight.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'n = 1000 versions. What is the largest number of isBadVersion calls binary search can need?',
            solution: '⌈log₂ 1000⌉ = 10.',
          },
          {
            task: 'Exponential search for a target at index 70 of an array of unknown size: which indices are read before the binary search starts?',
            solution: '1, 2, 4, 8, 16, 32, 64, 128 (the first value at least the target, assuming increasing values). The binary search then runs in [64, 128].',
          },
          {
            task: 'Find the Celebrity with 6 people: what is the largest total number of knows() calls in the elimination-plus-verification strategy?',
            solution: '5 calls in the first pass, plus up to 2 × 5 = 10 in verification: at most 15, which is under 3n = 18.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'A problem has 10⁴ hidden elements and allows at most 100 calls. Which approach fits?',
            options: ['Read everything once', 'A small number of binary searches', 'Read a random sample of 100', 'Any approach; the limit is generous'],
            answer: 1,
            why: 'One binary search is about 14 calls, so a few of them fit; a scan needs 10⁴.',
          },
          {
            q: 'In First Bad Version, mid turns out to be bad. What is the next range?',
            options: ['[lo, mid − 1]', '[lo, mid]', '[mid + 1, hi]', '[mid, hi]'],
            answer: 1,
            why: 'mid itself may be the first bad version, so it must stay in the range.',
          },
          {
            q: 'knows(a, b) returns true. What do you learn in Find the Celebrity?',
            options: ['a is the celebrity', 'b is not the celebrity', 'a is not the celebrity', 'Nothing'],
            answer: 2,
            why: 'A celebrity knows nobody, so a person who knows someone cannot be the celebrity.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          Several classic interactive problems need LeetCode Premium; they are included because they teach distinct strategies.
          For each one, write down the call budget and the size of the search space before you start.
        </p>
      </div>
      <ProblemSet id="interactive" />

      <Recap>
        <ul>
          <li>The input is behind an API; the algorithm is the questioning strategy, and the budget tells you which one.</li>
          <li>Monotone answers mean binary search; unknown sizes mean exponential search first; sorted rows allow a staircase walk.</li>
          <li>Use promised structure (mountains, monotone functions) to discard large regions with each query.</li>
          <li>Elimination: keep consistent candidates, ask the question with the smallest worst case, verify at the end.</li>
          <li>Test locally with a mock judge that counts calls and fails when the budget is exceeded.</li>
        </ul>
      </Recap>
    </>
  );
}
