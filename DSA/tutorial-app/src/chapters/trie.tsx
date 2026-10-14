import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/trie';
import { maxXor, trieBuildAndSearch } from '../traces/trie';
import { Walkthrough } from '../viz/Walkthrough';

const build = trieBuildAndSearch(
  ['cat', 'car', 'cart', 'do', 'dog'],
  [
    { kind: 'search', text: 'car' },
    { kind: 'search', text: 'ca' },
    { kind: 'prefix', text: 'ca' },
    { kind: 'search', text: 'cow' },
  ],
);
const xor = maxXor([4, 9, 6, 12, 3], 4);

export default function Trie() {
  return (
    <>
      <TopicIntro
        id="trie"
        time="4–5 hours, plus problems"
        before={['string', 'hash-table', 'tree']}
        learn={[
          'How a trie stores words by their shared prefixes, and why a prefix query costs the length of the prefix',
          'What to keep on a node: an end flag, a count, a sum, a short list of suggestions, an index',
          'Wildcard search, reversed tries for suffixes, and using a trie to prune a grid search or a DP',
          'Binary tries for maximum XOR, and the implicit trie behind dictionary order of numbers',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          Think of the contacts app on your phone. You type "ma" and it instantly shows Maria, Mark and Max. It does not compare
          "ma" with every contact; it follows the letters m, then a, through a tree where everyone whose name starts with "ma"
          sits below the same point. That tree is a <b>trie</b> (say "try", from re<i>trie</i>val), also called a prefix tree.
        </p>
        <p>
          Each edge stands for one character, and each node stands for the prefix spelled on the way down to it. Words that share
          a beginning share a path, so "car", "cart" and "cat" use the nodes c and a only once. A node also carries a flag
          saying "a word ends here", because "car" is a word while "ca" is only a prefix.
        </p>
        <p>
          With N words of length up to L in a plain list, checking "does any word start with this prefix?" means comparing the
          prefix with every word: <Cost>O(N · L)</Cost>. In a trie it is a walk of at most L steps: <Cost>O(L)</Cost>, no
          matter whether you stored ten words or ten million.
        </p>
      </div>

      <Walkthrough
        title="Build a trie, then ask it questions"
        frames={build.frames}
        caption='While inserting, amber nodes are new and purple nodes already existed. Green marks the node where a word or a successful query ends, red a walk that ends on a node that is not a word end, and "end" marks the last letter of an inserted word.'
      />

      <Box kind="key" label="Key idea">
        <p>
          A trie turns "compare against every word" into "follow one path". The work for any prefix question is the length of
          the prefix. Everything else you will do with tries is deciding <b>what extra information to keep on each node</b> so
          that the walk can answer your particular question.
        </p>
      </Box>

      <div className="prose">
        <h2>When to use it</h2>
        <p>
          A hash set answers "is this exact word present?" just as fast. Reach for a trie when the question is about{' '}
          <b>prefixes</b>, when you must match many words at once, or when you walk a string character by character and want to
          know, at every step, whether you are still on the way to some word.
        </p>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
        <p>
          A trie is not built into TypeScript; you make it from small node objects. Choose the node layout by alphabet size and
          by how many nodes you expect.
        </p>
      </div>
      <Structures
        items={[
          { name: 'Trie node with a Map', ts: '{ children: Map<string, Node>; end: boolean }', ops: 'step O(1) average', use: 'Any alphabet (folder names, Unicode). Memory grows only with the children that exist.' },
          { name: 'Trie node with 26 slots', ts: '{ children: (Node | null)[]; end: boolean }', ops: 'step O(1), very fast', use: 'Lowercase letters only. Uses 26 slots per node even when most are empty.' },
          { name: 'Flat typed arrays', ts: 'Int32Array(maxNodes * 26) for children, plus a counts array', ops: 'step O(1), no object per node', use: 'A million nodes or more, where objects become slow and memory-hungry.' },
          { name: 'Binary trie', ts: 'two children per node: bit 0 and bit 1', ops: '31 steps per number', use: 'Maximum XOR problems on 32-bit integers.' },
          { name: 'Hash set of prefixes', ts: 'Set<string>', ops: 'has O(L) to hash the key', use: 'A simpler alternative when the number of prefixes is small (for example numbers with at most 9 digits).' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Build and walk</h2>
        <p>
          The basic trie: insert words, then answer exact and prefix questions by walking. Most variations simply add a field to
          every node and update it on the way down during insert. A <b>count</b> tells you how many words pass through a node
          (the number of words with that prefix). A <b>sum</b> totals values of keys below. A short <b>list</b> remembers the
          best few words with that prefix.
        </p>
      </div>
      <Recipe
        name="Trie with data on the nodes"
        when="you need answers about all words sharing a prefix: how many, their total, the best few."
        steps={[
          'Create a root node with an empty set of children and the end flag off.',
          'To insert a word, walk from the root, creating each missing child. On every node you pass, update the extra field (add 1 to a count, add a value to a sum).',
          'Set the end flag on the last node.',
          'To answer a query, walk the prefix. If a child is missing, no word has this prefix; otherwise read the field on the node where the walk ends.',
        ]}
        why="every word with a given prefix passes through that prefix's node, so the node can summarise all of them."
        time="O(L) per insert or query"
        space="O(total characters)"
      />

      <div className="prose">
        <h2>Pattern 2: Wildcard search</h2>
        <p>
          When a pattern contains a character that matches anything, the walk no longer has a single path to follow. At that
          character you try every child, which turns search into a small depth-first search. The trie keeps it cheap: a branch
          dies as soon as its prefix is not in the dictionary. The same trick handles "change exactly one letter": carry a flag
          that says whether the one change has been spent.
        </p>
      </div>
      <Recipe
        name="DFS inside a trie"
        when="a query character can match several letters, or you may change a limited number of letters."
        steps={[
          'Search with two arguments: the current node and the position in the pattern (plus any extra state, such as "change used").',
          'At the end of the pattern, succeed only if the node ends a word (and any extra condition holds).',
          'For a normal character, recurse into that one child, if it exists.',
          'For a wildcard, recurse into every child; stop as soon as one call succeeds.',
        ]}
        why="each recursive call matches one more character of the pattern against one more level of the trie, so nothing is skipped."
        time="O(L) per query, times the branching at wildcards"
        space="O(L) recursion"
      />

      <div className="prose">
        <h2>Pattern 3: Dictionary prefix queries</h2>
        <p>
          Here the trie holds a dictionary, and you push each query word down it. Replace Words stops at the first end flag it
          meets, which is automatically the shortest root. Search Suggestions inserts products in sorted order, so the first
          three words to pass through a node are the three smallest with that prefix. The trie answers every typed prefix in one
          step each.
        </p>

        <h2>Pattern 4: Reversed and combined keys</h2>
        <p>
          A trie only understands prefixes. To ask about <b>suffixes</b>, insert every word backwards: a suffix of a word is a
          prefix of its reverse. Stream of Characters uses this to check, after every new character, whether the stream now ends
          with a word: walk the reversed trie from the newest character backwards. When you need prefix <i>and</i> suffix at once,
          glue them into one key such as <code>suffix#word</code>, so a single walk of <code>suffix#prefix</code> checks both.
        </p>
      </div>

      <div className="prose">
        <h2>Pattern 5: Trie-guided search</h2>
        <p>
          The most powerful use of a trie is as a guide for another search. In Word Search II you walk a grid of letters looking
          for many words. Instead of searching once per word, you walk the grid and the trie <b>together</b>: from a cell, you
          only step to a neighbour if the trie has a child for that neighbour's letter. The moment the letters so far are not a
          prefix of any word, the path stops. The same idea speeds up string DPs such as Word Break: from each position, walk the
          trie along the string to discover every word that starts there.
        </p>
      </div>
      <Recipe
        name="Search two structures in step"
        when="you explore paths (in a grid or along a string) and want to know which of many words they spell."
        steps={[
          'Insert all the words into one trie, storing each full word on its end node.',
          'Start the search at every possible starting point, holding the trie root.',
          'Each time the search adds a character, move to the matching trie child. If it does not exist, abandon this path.',
          'Whenever the current trie node holds a word, record it (and clear it, so it is reported once).',
        ]}
        why="a path is only extended while its letters are a prefix of some word, so the search never explores dead ends beyond one step."
        time="bounded by the number of prefixes the paths share with the dictionary"
        space="O(total word characters)"
      />

      <div className="prose">
        <h2>Pattern 6: Bitwise trie</h2>
        <p>
          Numbers are strings too: strings of bits. Write each number in a fixed number of bits, highest first, and insert it into
          a trie with just two children per node. To find the partner that gives the largest XOR with x, walk down and at each
          level take the child whose bit is the <b>opposite</b> of x's bit, if it exists. That is greedy, and greedy is right here,
          because a 1 in a higher bit is worth more than all the lower bits together (2<sup>k</sup> &gt; 2<sup>k−1</sup> + … + 1).
        </p>
      </div>
      <Walkthrough
        title="Maximum XOR with a binary trie"
        frames={xor.frames}
        caption={`Green steps found the opposite bit, amber steps had to accept the same bit. The best XOR is ${xor.best}.`}
      />

      <div className="prose">
        <h2>Pattern 7: Implicit trie</h2>
        <p>
          Sort the numbers 1 to 13 as words and you get 1, 10, 11, 12, 13, 2, 3 and so on. That order is a pre-order walk of a
          tree where the children of a number are that number followed by one more digit. You never build this tree. You move
          through it with arithmetic: multiply by 10 to go down, add 1 to move to the next sibling, divide by 10 to go up. To
          jump to the k-th number, count how many numbers up to n lie under a prefix, and skip whole subtrees at once.
        </p>
      </div>

      <div className="prose">
        <h2>Worked example: how to think through a new problem</h2>
        <p>Here is the thinking path for <b>Word Search II</b>: a 12 × 12 grid and up to 30,000 words.</p>
        <Step n={1}>Brute force first</Step>
        <p>
          For each word, run the single-word grid search (start at every cell, DFS through neighbours, never reuse a cell). That
          is correct. But each search can cost <Cost>O(m · n · 3^L)</Cost>, and doing it 30,000 times is far too slow.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          Many words share beginnings: "oath", "oat", "oak". The brute force walks the "oa" paths in the grid once per word. The
          grid walk depends only on the letters so far, not on which word you were hoping for.
        </p>
        <Step n={3}>Prove a rule</Step>
        <p>
          Put all words in a trie and run one DFS from each cell, holding a trie node. A grid path can only ever spell a word if
          its letters so far are a prefix of that word, which means the trie has a node for them. So stopping when the trie child
          is missing never loses a word, and every word is found when its end node is reached.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          The work now depends on how many grid paths are dictionary prefixes, not on the number of words. Report each word once
          by clearing it from its node when found, and prune trie nodes that have no children left so later searches skip
          finished branches. Unmark each cell when the DFS returns, so other paths can use it.
        </p>
      </div>

      <div className="prose">
        <h2>Trie, hash set or sorted array?</h2>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Question</th>
            <th>Best tool</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Is this exact word in the list?</td>
            <td>Hash set (<See id="hash-table" />)</td>
            <td>Simplest, and O(L) to hash the word.</td>
          </tr>
          <tr>
            <td>How many words start with this prefix? Which ones?</td>
            <td>Trie</td>
            <td>The prefix's node summarises every word below it.</td>
          </tr>
          <tr>
            <td>Prefix queries on a list that never changes</td>
            <td>Sorted array + binary search (<See id="binary-search" />)</td>
            <td>Words with a prefix form one contiguous block in sorted order; less memory than a trie.</td>
          </tr>
          <tr>
            <td>Many words inside a grid or a long text</td>
            <td>Trie (or Aho–Corasick, <See id="string-matching" />)</td>
            <td>One walk follows all words at once and prunes dead paths.</td>
          </tr>
          <tr>
            <td>Maximum XOR of pairs</td>
            <td>Binary trie</td>
            <td>Greedy choice bit by bit is optimal.</td>
          </tr>
        </tbody>
      </TableWrap>

      <Pitfalls
        items={[
          <>Forgetting the <b>end-of-word flag</b>: after inserting "apple", a search for "app" must say no.</>,
          <>Using a plain string prefix test where whole tokens matter: "/a/b/ca" is not inside "/a/b/c".</>,
          <>Creating an object with 26 slots for each of a million nodes. Use a Map, or flat typed arrays, when the trie is huge.</>,
          <>Reporting the same word twice in Word Search II. Clear the word from its node after the first hit.</>,
          <>In a binary trie, using fewer bits than the largest value needs, or forgetting that JavaScript bitwise operators work on 32-bit signed integers.</>,
          <>Re-inserting a key with a new value and adding the full value to node sums instead of the difference.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Insert "tea", "ten", "to", "inn" and "in" into an empty trie. How many nodes are there, including the root? Which nodes are marked as word ends?',
            hint: 'Draw it: t has children e and o; e has children a and n; i has child n, which has child n.',
            solution: '9 nodes: root, t, te, tea, ten, to, i, in, inn. Word ends: tea, ten, to, in, inn.',
          },
          {
            task: 'In the same trie, each node counts how many words pass through it. What is the count on the node for "t"? On "in"?',
            solution: '"t" has 3 (tea, ten, to). "in" has 2 (in, inn).',
          },
          {
            task: 'With a binary trie of 3-bit numbers holding 1 (001), 4 (100) and 6 (110), which partner does the greedy walk choose for x = 3 (011), and what is the XOR?',
            solution: 'Bit 2 of x is 0, so prefer 1: go to 1xx. Bit 1 of x is 1, so prefer 0: go to 10x. Bit 0 of x is 1, prefer 0: 100 exists. Partner 4, and 3 XOR 4 = 7.',
          },
          {
            task: 'Why does inserting the reversed words let you check, after each new character of a stream, whether the stream ends with a word?',
            solution: 'Any match must end at the newest character. Reading the stream backwards from there, a word that is a suffix of the stream appears as its reverse at the start, which is exactly a prefix walk in the reversed trie.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'A trie holds 1,000,000 words. How long does "does any word start with ab?" take?',
            options: ['O(1,000,000)', 'O(2) steps: one per character of the prefix', 'O(log 1,000,000)', 'It depends on how many words start with "ab"'],
            answer: 1,
            why: 'The walk follows one edge per character of the prefix. The number of stored words does not matter.',
          },
          {
            q: 'After inserting only "apple", what do search("app") and startsWith("app") return?',
            options: ['true and true', 'false and true', 'true and false', 'false and false'],
            answer: 1,
            why: 'The walk for "app" succeeds, so the prefix exists, but the node for "app" is not marked as the end of a word.',
          },
          {
            q: 'Why is the greedy "take the opposite bit" walk optimal for maximum XOR?',
            options: [
              'Because the trie is sorted',
              'Because a 1 in a higher bit is worth more than all lower bits combined',
              'Because XOR is commutative',
              'It is not always optimal; it is a heuristic',
            ],
            answer: 1,
            why: 'Winning bit k beats any combination of bits below k, so the best choice at each level never needs to be undone.',
          },
          {
            q: 'Which problem is a natural fit for a trie of reversed words?',
            options: ['Longest Common Prefix', 'Stream of Characters', 'Implement Trie', 'Maximum XOR of Two Numbers'],
            answer: 1,
            why: 'Every match ends at the newest character, so you read the stream backwards and match reversed words as prefixes.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          Start with Implement Trie and build it from memory until it takes you five minutes. Then work through each pattern.
          Try each problem for 20–30 minutes before opening a hint, and mark it Solved so the <a href="#/review">review queue</a>{' '}
          brings it back.
        </p>
      </div>
      <ProblemSet id="trie" />

      <Recap>
        <ul>
          <li>A trie shares prefixes: a prefix question costs O(L), however many words are stored.</li>
          <li>Decide what each node must remember (end flag, count, sum, best words, index) and update it on every insert.</li>
          <li>Wildcards become a DFS over children; suffix questions become prefix questions on reversed words.</li>
          <li>Use a trie to guide another search, such as a grid DFS or a string DP, so dead paths stop immediately.</li>
          <li>Binary tries solve maximum XOR greedily; dictionary order of numbers is a walk of an implicit trie.</li>
        </ul>
      </Recap>
    </>
  );
}
