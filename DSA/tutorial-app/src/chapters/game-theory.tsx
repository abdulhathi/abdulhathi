import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/game-theory';
import { flipGrundy, predictTheWinner, squareGame } from '../traces/game-theory';
import { Walkthrough } from '../viz/Walkthrough';

const squares = squareGame(12);
const minimax = predictTheWinner([4, 10, 50, 6]);
const grundy = flipGrundy(8);

export default function GameTheory() {
  return (
    <>
      <TopicIntro
        id="game-theory"
        time="4–5 hours, plus problems"
        before={['dp', 'memoization', 'bit-manipulation', 'dp-interval']}
        learn={[
          'Winning and losing positions, and how to compute them backwards from the end of the game',
          'Nim, the XOR rule, and Grundy numbers (the Sprague–Grundy theorem) for sums of games',
          'Minimax on score difference: the standard DP for "both players play optimally"',
          'When a game collapses to a formula, a parity argument or a greedy order',
          'Games on graphs with draws, solved by backward BFS (retrograde analysis)',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          In these problems two players alternate, both see everything, there is no luck, and "both play optimally". Then the
          outcome is already decided before the first move, and your job is to compute it. The method is the one chess endgame
          tables use: start from positions where the game is over, and work backwards.
        </p>
        <p>
          A position is <b>losing</b> (L) for the player to move if every move leads to a position that is winning for the
          opponent, including the case where there is no move at all. It is <b>winning</b> (W) if at least one move leads to a
          losing position for the opponent. That one definition, applied in order, solves every finite game of this kind.
        </p>
      </div>

      <Walkthrough
        title="Remove a square number of stones: label every pile W or L"
        frames={squares.frames}
        caption={`Losing piles up to 12: ${squares.win.map((w, i) => (w ? null : i)).filter((v) => v !== null).join(', ')}. With L positions known, the winning move is "go to an L".`}
      />

      <Box kind="key" label="Key idea">
        <p>
          W = some move reaches an L. L = every move reaches a W (or there is no move). Compute positions in an order where
          every position's moves have already been labelled: from small piles up, from short arrays up, or backwards from the
          end states.
        </p>
      </Box>

      <div className="prose">
        <h2>Two kinds of game</h2>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Kind</th>
            <th>What it means</th>
            <th>Tool</th>
            <th>Examples</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Impartial</td>
            <td>Both players have the same moves; the last player to move wins</td>
            <td>W/L table, Nim XOR, Grundy numbers</td>
            <td>Nim, Divisor Game, Stone Game IV, Flip Game II</td>
          </tr>
          <tr>
            <td>Zero-sum scoring</td>
            <td>Players collect points; one player's gain is the other's loss</td>
            <td>Minimax DP on score difference</td>
            <td>Predict the Winner, Stone Games I, II, III and VII</td>
          </tr>
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
          { name: 'Boolean table', ts: 'boolean[] or Uint8Array', ops: 'O(1)', use: 'win[pile] for one-number positions such as stone counts.' },
          { name: 'Bitmask memo', ts: 'Map<number, boolean> or Int8Array(1 << n)', ops: 'O(1)', use: 'Positions described by a set of used items (Can I Win), for n up to about 20.' },
          { name: 'Interval table', ts: 'number[][]', ops: 'O(1) per cell', use: 'best[i][j] when players take from either end of a row.' },
          { name: 'Grundy array', ts: 'number[] plus a Set for the mex', ops: 'O(options) per entry', use: 'Grundy numbers of independent parts, combined with XOR.' },
          { name: 'Queue and degree counters', ts: 'array as queue, Int32Array counters', ops: 'O(1) per step', use: 'Retrograde analysis on graph games with draws.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Winning and losing positions</h2>
      </div>
      <Recipe
        name="Win/lose table"
        when="positions are small enough to enumerate and the same moves are available to both players."
        steps={[
          'Define the position (stones left, number on the board, set of used numbers).',
          'Label the terminal positions: no move available means the player to move loses (unless the rules say otherwise).',
          'Go through positions so that every move leads to an already-labelled position.',
          'A position is W if any move leads to an L; otherwise it is L.',
          'Answer with the label of the starting position. If the input can be huge, print the table for small cases, find the pattern, and prove it.',
        ]}
        why="optimal play means the mover picks a move into an L if one exists; if none does, every option hands the opponent a win."
        time="O(positions × moves)"
        space="O(positions)"
      />
      <div className="prose">
        <p>
          The pattern step matters. In Nim Game (take 1 to 3) the table reads L, W, W, W, L, W, W, W, …: multiples of 4 lose,
          because whatever you take, the opponent takes the rest of that 4. In Divisor Game, even numbers win. Spot it in the
          table, then explain it with a strategy: that explanation is your proof. More on finding such patterns in{' '}
          <See id="brainteaser" />.
        </p>

        <h2>Pattern 2: Nim and Grundy numbers</h2>
        <p>
          In <b>Nim</b>, there are several piles, and a move removes any number of stones from one pile. Bouton proved that the
          player to move loses exactly when the <b>XOR of all pile sizes is 0</b>. From XOR 0 every move changes one pile and
          makes the XOR non-zero; from a non-zero XOR there is always a move back to 0 (shrink a pile that has the XOR's highest
          bit set). So the XOR-0 positions are precisely the L positions.
        </p>
        <p>
          The <b>Sprague–Grundy theorem</b> extends this to any impartial game. Give every position a <b>Grundy number</b>: the
          mex (minimum excludant, the smallest non-negative integer not present) of the Grundy numbers of the positions you can
          move to. A position is L exactly when its Grundy number is 0. And when a game splits into independent parts, its Grundy
          number is the XOR of the parts' numbers, exactly like Nim piles.
        </p>
      </div>
      <Walkthrough
        title="Grundy numbers for runs of plus signs in Flip Game"
        frames={grundy.frames}
        caption={`g(0…8) = ${grundy.g.join(', ')}. A board with runs of lengths 4 and 5 has XOR 2 ^ 0 = 2 ≠ 0: the first player wins.`}
      />
      <Recipe
        name="Sprague–Grundy for a sum of games"
        when="an impartial game splits into independent parts (separate piles, separate segments of a string)."
        steps={[
          'For one part, compute g(position) = mex of g over the positions one move away; positions with no move have g = 0.',
          'If a move splits a part into two independent parts, the value of that option is the XOR of the two parts\' g values.',
          'For the whole game, XOR the g values of all parts.',
          'The player to move wins exactly when the total is not 0.',
        ]}
        why="each part behaves like a Nim pile of size g, and Nim is decided by XOR."
        time="O(sizes × options) for the table"
        space="O(sizes)"
      />

      <div className="prose">
        <h2>Pattern 3: Minimax on score difference</h2>
        <p>
          When players collect points, tracking two scores is messy. Track one number instead:{' '}
          <b>how far ahead the player to move finishes</b> from this state with best play. After you move, the opponent becomes
          the player to move, and their advantage counts against you, so your value is (points you just took) − (their value
          from the next state). Maximise that over your moves. This is minimax written as a single max.
        </p>
      </div>
      <Walkthrough
        title="Predict the Winner on [4, 10, 50, 6]"
        frames={minimax.frames}
        caption={`best[0][3] = ${minimax.diff}: taking 4 first sets player 1 up to take 50 next.`}
      />
      <Recipe
        name="Minimax DP on score difference"
        when="two players collect points, both play optimally, and you need the winner or the final difference."
        steps={[
          'Choose the state (a range i…j, a start index, a pair (index, M)).',
          'Define best(state) = (score of the player to move) − (score of the other player) from here, with optimal play.',
          'For each move: value = points gained now − best(next state). Take the maximum.',
          'Fill the table in an order where next states are already computed (shorter ranges first, or from the end backwards).',
          'Read the winner from the sign of best(start). For "how many points does Alice get", combine with the total: Alice = (total + difference) / 2, or use suffix sums as in Stone Game II.',
        ]}
        why="the game is zero-sum: the opponent maximising their own difference is the same as minimising yours."
        time="O(states × moves)"
        space="O(states)"
      />

      <div className="prose">
        <h2>Pattern 4: Greedy and parity shortcuts</h2>
        <p>
          Before writing a DP, ask what a move really changes. In Stone Game VI, taking a stone gains your value and denies the
          opponent theirs, so every stone is worth the sum of both values to the mover, and both players simply take stones in
          that order. In Remove Colored Pieces, Alice's moves never affect Bob's, so each player has a fixed number of moves and
          counting decides it. In Stone Game I, an even number of piles lets the first player take all the even-indexed or all
          the odd-indexed piles, so she always wins.
        </p>

        <h2>Pattern 5: Games on graphs</h2>
        <p>
          When positions can repeat (a cat chasing a mouse around a cycle), plain recursion loops forever, and "draw" becomes a
          third outcome. Solve it backwards, like <See id="topological-sort" />: start a queue with the states whose result is
          known, and propagate.
        </p>
      </div>
      <Recipe
        name="Retrograde analysis"
        when="a two-player game has cycles or draws, and the number of states is small enough to list."
        steps={[
          'List the states (positions plus whose turn) and, for each, its number of possible moves.',
          'Mark the terminal states as wins for one side and put them in a queue.',
          'Pop a state; for each parent state (one move earlier): if the parent\'s mover wins by moving here, mark the parent as their win and enqueue it.',
          'Otherwise decrease the parent\'s count of unexplored moves; when it reaches 0, every move loses, so mark the parent as the other side\'s win and enqueue it.',
          'States never marked are draws.',
        ]}
        why="a state is a win as soon as one move wins, and a loss only when all moves lose; counting unresolved moves detects the second case."
        time="O(states × moves)"
        space="O(states)"
      />

      <div className="prose">
        <h2>Worked example: Predict the Winner</h2>
        <Step n={1}>Brute force first</Step>
        <p>
          Explore the game tree: at every turn try taking the left end and the right end, recursively. With 20 numbers that is
          2²⁰ ≈ a million leaves, which passes, but the same sub-arrays appear over and over.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          Whatever happened before, the remaining numbers always form a contiguous range nums[i..j], and there are only about
          n² / 2 ranges. The past only matters through the scores, and the difference trick removes even that.
        </p>
        <Step n={3}>The rule</Step>
        <p>
          best(i, j) = max(nums[i] − best(i + 1, j), nums[j] − best(i, j − 1)), with best(i, i) = nums[i]. Greedy fails: on
          [4, 10, 50, 6], grabbing the larger end (6) lets the opponent take 50. Taking 4 first forces them to open up 50 for
          you.
        </p>
        <Step n={4}>Cost and edge cases</Step>
        <p>
          <Cost>O(n²)</Cost> states, <Cost>O(1)</Cost> work each. Player 1 wins when best(0, n − 1) ≥ 0, because a tie counts as
          a win. One element: player 1 takes it and wins.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Playing greedily ("take the biggest now") when the rules reward looking ahead.</>,
          <>Mixing up whose turn it is. The score-difference formulation avoids tracking it at all.</>,
          <>Adding pile sizes instead of XOR-ing them in Nim.</>,
          <>Forgetting the base case: a player with no legal move loses (in normal play).</>,
          <>Recursing on games with cycles without memoising states or handling draws.</>,
          <>Memoising on more than the true state (for example the bitmask and the total, when the total follows from the mask).</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Players take 1 or 2 stones; whoever takes the last stone wins. Label piles 0 to 9 as W or L. What is the pattern?',
            solution: 'L, W, W, L, W, W, L, W, W, L: multiples of 3 lose.',
          },
          {
            task: 'Nim with piles 3, 5 and 6. Is the first player winning? If so, find a winning move.',
            solution: '3 ^ 5 ^ 6 = 0, so the first player loses: every move gives the opponent a winning position.',
          },
          {
            task: 'Nim with piles 2, 4 and 7. Find a winning move.',
            hint: 'The XOR is 2 ^ 4 ^ 7 = 1. Find a pile p with p ^ 1 < p.',
            solution: 'Change the 7 to 7 ^ 1 = 6 (remove one stone). Then 2 ^ 4 ^ 6 = 0.',
          },
          {
            task: 'Fill best[i][j] for Predict the Winner on [3, 9, 1, 2]. Does player 1 win?',
            solution: 'Singles: 3, 9, 1, 2. Pairs: best[0][1] = 6, best[1][2] = 8, best[2][3] = 1. Triples: best[0][2] = max(3 − 8, 1 − 6) = −5, best[1][3] = max(9 − 1, 2 − 8) = 8. Whole: max(3 − 8, 2 − (−5)) = 7 ≥ 0, so yes: take 2 first.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'A position from which every legal move leads to a winning position for the opponent is…',
            options: ['Winning', 'Losing', 'A draw', 'Impossible'],
            answer: 1,
            why: 'Whatever the mover does, the opponent wins, so the mover loses with optimal play.',
          },
          {
            q: 'Nim with piles 1, 4 and 5. Who wins?',
            options: ['The first player', 'The second player', 'It depends on the first move', 'It is a draw'],
            answer: 1,
            why: '1 ^ 4 ^ 5 = 0, so the player to move is in a losing position.',
          },
          {
            q: 'In minimax on score difference, what is the value of taking x points and leaving state s to the opponent?',
            options: ['x + best(s)', 'x − best(s)', 'max(x, best(s))', 'best(s) − x'],
            answer: 1,
            why: 'best(s) is how far ahead the opponent will finish from s, which counts against you.',
          },
          {
            q: 'A game splits into two independent parts with Grundy numbers 3 and 3. What is the outcome for the player to move?',
            options: ['Win, because 3 + 3 = 6', 'Loss, because 3 XOR 3 = 0', 'Win, because both parts are winning', 'Cannot tell'],
            answer: 1,
            why: 'Sums of impartial games combine by XOR; 0 means the player to move loses (the opponent mirrors).',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          Start with the W/L problems and write out the small tables by hand; the patterns are the point. Then do the minimax
          problems in the order listed (Predict the Winner, Stone Game, Stone Game II, Stone Game VII, Stone Game III): they all
          use the same score-difference idea with different states.
        </p>
      </div>
      <ProblemSet id="game-theory" />

      <Recap>
        <ul>
          <li>W if some move reaches L; L if every move reaches W. Compute backwards from the end.</li>
          <li>Nim is decided by the XOR of the piles; Grundy numbers (mex of options) turn any impartial game into Nim piles.</li>
          <li>For scoring games, store "how far ahead the player to move finishes" and subtract the opponent's value.</li>
          <li>Look for shortcuts first: patterns in small tables, parity, and greedy orders by combined value.</li>
          <li>Games with cycles and draws are solved backwards from decided states, counting each state's unresolved moves.</li>
        </ul>
      </Recap>
    </>
  );
}
