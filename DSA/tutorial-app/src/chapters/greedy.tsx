import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/greedy';
import { candy, intervalScheduling, jumpGame } from '../traces/greedy';
import { Walkthrough } from '../viz/Walkthrough';

const jump = jumpGame([1, 3, 1, 0, 2, 0, 1]);
const stuck = jumpGame([3, 2, 1, 0, 4]);
const schedule = intervalScheduling([[1, 10], [2, 3], [3, 5], [4, 7], [6, 8], [8, 9]]);
const candies = candy([1, 3, 4, 5, 2, 1, 2]);

export default function Greedy() {
  return (
    <>
      <TopicIntro
        id="greedy"
        time="6–7 hours, plus problems"
        before={['sorting', 'intervals', 'heap']}
        learn={[
          'What a greedy algorithm is, and why it is so much faster than trying every option',
          'How to prove a greedy choice is safe: the exchange argument and "greedy stays ahead"',
          'Six patterns: best option now, furthest reach, interval scheduling, two passes, sort by a key, greedy with a heap',
          'How to spot the problems where greedy fails, so you switch to dynamic programming in time',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          A <b>greedy algorithm</b> builds its answer one decision at a time, and at every step it takes the option that looks
          best right now. It never goes back to change an earlier decision. Think of paying a shop assistant with the fewest
          notes: you hand over the largest note that does not exceed what you still owe, again and again.
        </p>
        <p>
          The appeal is speed. A problem with n decisions and two choices each has 2ⁿ possible answers; trying them all is hopeless
          beyond n ≈ 25. A greedy algorithm makes one choice per step, so it is usually one sort plus one scan:{' '}
          <Cost>O(n log n)</Cost>.
        </p>
        <p>
          The catch is that the locally best choice is not always globally best. Greedy is correct only when you can show that
          the choice it makes never rules out an optimal answer. Most of this chapter is about recognising those situations, and
          the rest is about the patterns that keep coming back. Watch the simplest one first: can you jump from the start of the
          array to its end?
        </p>
      </div>

      <Walkthrough
        title="Jump Game: keep only the furthest reach"
        frames={jump.frames}
        caption="You never choose a specific jump. The window of reachable indices only grows, the 0 at index 3 is simply jumped over, and one scan settles the question."
      />
      <Walkthrough
        title="Jump Game: when the reach stops growing"
        frames={stuck.frames}
        caption="Index 3 holds a 0 and nothing before it reaches past it, so index 4 is out of reach."
      />

      <Box kind="key" label="Key idea">
        <p>
          A greedy algorithm is correct when you can finish this sentence: <i>"Taking this choice now is safe, because any
          optimal answer can be changed to include it without getting worse."</i> If you cannot, test the idea on a few tiny
          inputs before you trust it. Greedy ideas that "feel right" fail hidden test cases more often than any other kind.
        </p>
      </Box>

      <div className="prose">
        <h2>How to prove a greedy choice</h2>
        <p>You do not need formal proofs in an interview, but you need one of these two arguments in your head.</p>
        <h3>The exchange argument</h3>
        <p>
          Take any optimal answer. If it does not contain the greedy choice, swap the greedy choice in for something else, and
          show the answer is still valid and no worse. Then an optimal answer that agrees with greedy exists, and you can repeat
          the argument for the next step. Example: in interval scheduling, the interval that ends first can replace the first
          interval of any optimal selection, because it ends no later, so everything after it still fits.
        </p>
        <h3>Greedy stays ahead</h3>
        <p>
          Show that after every step, the greedy partial answer is at least as good as any other partial answer of the same
          size. Example: in Jump Game II, after k jumps the greedy reach is the furthest any k jumps can reach, so no strategy can
          arrive with fewer jumps.
        </p>
        <h3>When greedy fails</h3>
        <p>
          Greedy breaks when an early choice changes which later choices are possible: a shared capacity, limited copies, or
          options that block each other. Keep these counterexamples in mind; they are the fastest way to kill a wrong idea.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Problem</th>
            <th>Tempting greedy</th>
            <th>Counterexample</th>
            <th>What works</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Fewest coins for an amount</td>
            <td>Always take the largest coin that fits</td>
            <td>Coins 1, 3, 4 and amount 6: greedy uses 4 + 1 + 1, the best is 3 + 3</td>
            <td>DP (<See id="knapsack" />). Greedy is only safe for coin systems like 1, 2, 5, 10.</td>
          </tr>
          <tr>
            <td>0/1 knapsack</td>
            <td>Take items with the best value per kilogram</td>
            <td>Capacity 50; items (10 kg, 60), (20 kg, 100), (30 kg, 120): greedy gets 160, the best is 220</td>
            <td>DP. Greedy by ratio is right only when items can be cut into fractions.</td>
          </tr>
          <tr>
            <td>Fewest jumps (Jump Game II)</td>
            <td>Always jump as far as possible</td>
            <td>[2, 3, 1, 1, 4]: jumping to index 2 needs 3 jumps, but going to index 1 needs only 2</td>
            <td>Greedy by levels: extend the range to the furthest reach inside it.</td>
          </tr>
          <tr>
            <td>Most non-overlapping intervals</td>
            <td>Take the interval that starts first, or the shortest one</td>
            <td>[1, 10] starts first and blocks [2, 3], [4, 5], [6, 7]</td>
            <td>Greedy by earliest end.</td>
          </tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>When to use it</h2>
        <p>
          These clues point to a greedy solution. The <See id="recognition" /> collects every signal from every chapter.
        </p>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
        <p>Greedy solutions are usually a sort followed by a scan, sometimes with a heap to fetch the best current option.</p>
      </div>
      <Structures
        items={[
          { name: 'Sorted array', ts: 'an array sorted with a comparator (for example by end time)', ops: 'sort O(n log n); scan O(n)', use: 'Putting items in the order the greedy rule needs: by end time, by ratio, by a custom comparison.' },
          { name: 'Heap (priority queue)', ts: 'no built-in: write a binary heap, or use the priority queue library LeetCode provides', ops: 'push and pop O(log n); peek O(1)', use: 'Taking the best available option over and over as new options appear (IPO, refuelling, ladders).' },
          { name: 'Counters and running values', ts: 'plain number variables', ops: 'O(1)', use: 'The furthest reach, the fuel in the tank, the current end of a range.' },
          { name: 'Frequency array', ts: 'number[] of length 26, filled with 0', ops: 'O(1) per update', use: 'Letter counts for scheduling and rearranging strings.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Best option now</h2>
        <p>
          The simplest greedy problems have choices that do not interact. Every cookie costs one cookie, every box takes one slot,
          every daily price rise is independent of the others. Then the best local choice is simply the best choice: give the
          smallest cookie that fits, load the most valuable boxes first, collect every positive price change.
        </p>
      </div>
      <Recipe
        name="Take the best option now"
        when="each choice uses the same amount of a shared resource, or choices do not affect each other at all."
        steps={[
          'Decide what "best" means for a single step (most units per box, smallest cookie that fits, any positive gain).',
          'Sort the options by that measure, or simply scan them if they come in order.',
          'Take the best option that is still allowed, update what is left, and repeat.',
          'Stop when the resource runs out or the options do.',
        ]}
        why="when choices do not interact, swapping any chosen option for a better one can only improve the total."
        time="O(n log n) with a sort, O(n) without"
        space="O(1)"
      />

      <div className="prose">
        <h2>Pattern 2: Furthest reach</h2>
        <p>
          Instead of choosing individual moves, keep one number: the furthest point you can reach (Jump Game), the furthest point
          the current piece must stretch to (Partition Labels), or the furthest point your current jump count covers (Jump Game
          II). Scan once and act only when the index arrives at that point. The same idea in Gas Station uses a running fuel
          balance: when it goes negative, every start so far is ruled out at once.
        </p>
      </div>
      <Recipe
        name="Track the furthest reach"
        when="positions are visited left to right and each one extends how far you can (or must) go."
        steps={[
          'Keep reach (or end) = the furthest point covered so far.',
          'Scan the indices in order. At each one, extend reach using that index\'s value.',
          'If the index ever passes reach, you are stuck (or, in Jump Game II, you must take another jump).',
          'When the index arrives exactly at the end of the current range, act: cut a piece, count a jump, or restart.',
        ]}
        why="every point up to the furthest reach is reachable, so remembering one number loses no information."
        time="O(n)"
        space="O(1)"
      />

      <div className="prose">
        <h2>Pattern 3: Interval scheduling</h2>
        <p>
          To keep the most non-overlapping intervals (or, the same thing, remove the fewest), sort by <b>end</b> and keep each
          interval that starts after the last one you kept. The earliest-ending interval is the safest one to keep, because it
          leaves the most room for everything else. Burst balloons with arrows and building chains of pairs are the same
          problem in disguise. Intervals have a whole chapter, <See id="intervals" />, for merging and inserting.
        </p>
      </div>
      <Walkthrough
        title="Non-overlapping Intervals: sort by end, keep greedily"
        frames={schedule.frames}
        caption={`Green intervals are kept, red ones removed. [1, 10] starts first but ends last; sorting by start would have kept it and lost three others. Removed: ${schedule.removed}.`}
      />
      <Recipe
        name="Earliest end first"
        when="you must keep the most non-overlapping intervals, or cover or pierce all intervals with the fewest points."
        steps={[
          'Sort the intervals by end.',
          'Keep the first interval and remember its end.',
          'For each next interval: if it starts after the remembered end (or at it, when touching is allowed), keep it and remember its end; otherwise skip it.',
          'The kept count is the maximum; the skipped count is the minimum number to remove.',
        ]}
        why="exchange argument: the earliest-ending interval can replace the first interval of any optimal answer without causing a new overlap."
        time="O(n log n)"
        space="O(1) besides the sort"
      />

      <div className="prose">
        <h2>Pattern 4: Two passes</h2>
        <p>
          Some rules look both ways: a child must get more candy than <i>each</i> lower-rated neighbour. A single left-to-right
          scan sees only the left neighbour. Solve each direction with its own pass, then keep the larger requirement at every
          position, which satisfies both rules with the smallest values.
        </p>
      </div>
      <Walkthrough
        title="Candy: one pass for each direction"
        frames={candies.frames}
        caption={`The left pass handles rising runs, the right pass handles falling runs. Total: ${candies.total}.`}
      />
      <Recipe
        name="Two passes, keep the stricter value"
        when="each element has a rule about its left neighbour and another about its right neighbour."
        steps={[
          'Start every element at the smallest allowed value.',
          'Scan left to right and enforce the rule about the left neighbour.',
          'Scan right to left and enforce the rule about the right neighbour, keeping the larger of the old and new value.',
          'Combine the values (sum them, check them) for the answer.',
        ]}
        why="each pass gives the smallest values meeting its own rule, so their maximum is the smallest that meets both."
        time="O(n)"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 5: Sort by a key</h2>
        <p>
          When the question is "in what order?", look for a rule that compares two items. If putting a before b is never worse
          whenever the rule says so, then sorting by the rule is optimal, because any other order contains a neighbouring pair you
          could swap to improve it. The rule is not always obvious: Largest Number compares the two ways of joining the numbers,
          Two City Scheduling compares the difference between the two costs.
        </p>
      </div>
      <Recipe
        name="Exchange two neighbours"
        when="the answer is an ordering or an assignment, and the total depends on which items go where."
        steps={[
          'Take two neighbouring items a and b and write down the total with a first, then with b first.',
          'Simplify the comparison until it depends only on a and b (often a difference or a joined string).',
          'Sort all items with that comparison.',
          'Read off the answer from the sorted order.',
        ]}
        why="any order that breaks the rule has two neighbours you can swap without making the answer worse, so the sorted order is optimal."
        time="O(n log n)"
        space="O(1) besides the sort"
      />

      <div className="prose">
        <h2>Pattern 6: Greedy with a heap</h2>
        <p>
          Sometimes options appear over time. In IPO, finishing projects raises your capital and unlocks new projects; in
          Minimum Number of Refueling Stops, every station you drive past becomes a possible stop. A max-heap keeps all the options
          currently available and hands you the best one in <Cost>O(log n)</Cost>. A powerful twist is the <b>regret</b> version:
          make a choice provisionally, and undo the worst one later when you learn more (ladders in Furthest Building You Can Reach,
          dropped courses in Course Schedule III).
        </p>
      </div>
      <Recipe
        name="Best available option from a heap"
        when="options become available as you go, and you repeatedly want the best one so far, or want to undo the worst one."
        steps={[
          'Sort the options by when they become available (capital needed, position, deadline).',
          'As you advance, push every newly available option into a heap ordered by how good it is.',
          'When you must act, pop the best option (or, for regret, pop the worst choice you made and replace it).',
          'Repeat until you run out of steps or options.',
        ]}
        why="the heap always holds exactly the options you are allowed to take, so popping its top is the locally best legal choice."
        time="O(n log n)"
        space="O(n)"
      />

      <div className="prose">
        <h2>Worked example: Gas Station</h2>
        <p>
          Stations sit on a circle. Station i gives gas[i] and the drive to the next costs cost[i]. Find the start from which you
          can go all the way round.
        </p>
        <Step n={1}>Brute force first</Step>
        <p>
          Try each station as the start and simulate the whole loop. That is n starts × n stations = <Cost>O(n²)</Cost>, too
          slow for 10⁵ stations.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          Suppose you start at station s and the tank goes negative right after station j. The brute force would now try s + 1,
          s + 2, and so on. But you arrived at each of those stations with a tank of zero or more, so starting there with an empty
          tank can only be worse. They all fail at j too.
        </p>
        <Step n={3}>Prove a rule</Step>
        <p>
          So when the tank goes negative after j, the next possible start is j + 1. One more fact finishes it: if the total gas is
          at least the total cost, a valid start exists, and the last start you tried is it, because the stretch from it to the end
          never went negative, and the rest of the loop is paid for by the surplus.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          One pass: <Cost>O(n)</Cost> time, <Cost>O(1)</Cost> space. If the total is negative, return -1. A single station works if
          its gas covers its cost. You never need to simulate the wrap-around.
        </p>
      </div>

      <div className="prose">
        <h2>Greedy, dynamic programming or backtracking?</h2>
        <p>The three solve optimisation problems at very different costs. Try them in this order of thinking.</p>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Approach</th>
            <th>Explores</th>
            <th>Typical cost</th>
            <th>Use it when</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Greedy</td>
            <td>One choice per step</td>
            <td>O(n log n)</td>
            <td>You can prove the local choice is safe (exchange argument or stays ahead).</td>
          </tr>
          <tr>
            <td>Dynamic programming (<See id="dp" />)</td>
            <td>Every choice, but each subproblem once</td>
            <td>O(states × choices)</td>
            <td>Choices interact, and the problem breaks into overlapping subproblems.</td>
          </tr>
          <tr>
            <td>Backtracking (<See id="backtracking" />)</td>
            <td>Every full candidate, with pruning</td>
            <td>Exponential</td>
            <td>You must list all answers, or n is tiny (about 20 or less).</td>
          </tr>
        </tbody>
      </TableWrap>

      <Pitfalls
        items={[
          <>Trusting a greedy idea without a proof or a counterexample search. Try three tiny inputs by hand, including one designed to break it.</>,
          <>Sorting by the wrong key: start instead of end in interval scheduling, value instead of the joined string in Largest Number.</>,
          <>Mixing up whether touching intervals overlap. Non-overlapping Intervals says they do not; burst balloons says they do.</>,
          <>Jumping as far as possible in Jump Game II instead of reasoning in levels.</>,
          <>Using greedy on coin change or 0/1 knapsack. Shared capacity is the classic sign that you need DP.</>,
          <>Forgetting the final check, such as total gas ≥ total cost, or the answer never being below the number of tasks.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Run the furthest-reach scan on [1, 2, 0, 1, 0, 3]. Write the reach after each index. Can you reach the end?',
            hint: 'Reach after index 0 is 1, after index 1 it is 3.',
            solution: 'Reach: 1, 3, 3, 4, 4. At index 5 the loop finds 5 > 4, so the end cannot be reached.',
          },
          {
            task: 'Find a counterexample to "for the most non-overlapping intervals, always keep the shortest interval first".',
            solution: 'Intervals [1, 5], [6, 10] and [4, 7]. The shortest, [4, 7], overlaps both others, so keeping it gives 1 interval, but [1, 5] and [6, 10] give 2.',
          },
          {
            task: 'Largest Number: in which order should 3 and 30 go? Explain using the comparison rule.',
            solution: '"330" is larger than "303", so 3 goes before 30.',
          },
          {
            task: 'Coins 1, 5 and 6, amount 10. What does "largest coin first" give, and what is the true minimum?',
            solution: 'Greedy takes 6 + 1 + 1 + 1 + 1 (five coins). The minimum is 5 + 5 (two coins). A DP is needed.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'To keep the most non-overlapping intervals, you should sort by…',
            options: ['Start time', 'End time', 'Length', 'Start time, longest first'],
            answer: 1,
            why: 'The interval that ends first leaves the most room for the others; an exchange argument proves it is always safe to keep.',
          },
          {
            q: 'Which problem is NOT safe to solve greedily?',
            options: ['Best Time to Buy and Sell Stock II', 'Coin change with coins 1, 3 and 4', 'Jump Game', 'Assign Cookies'],
            answer: 1,
            why: 'With coins 1, 3, 4 and amount 6, largest-first uses three coins but 3 + 3 uses two. Coin change needs DP.',
          },
          {
            q: 'In Gas Station the tank goes negative right after station 7, having started at station 3. Where should the next attempt start?',
            options: ['Station 4', 'Station 7', 'Station 8', 'Station 0'],
            answer: 2,
            why: 'Every start from 4 to 7 would reach station 7 with no more gas than you had, so they all fail. The next candidate is 8.',
          },
          {
            q: 'Furthest Building You Can Reach keeps the climbs that used ladders in a min-heap. Why a min-heap?',
            options: [
              'To find the largest climb quickly',
              'To find the smallest ladder climb, which is the cheapest to pay for with bricks instead',
              'Because heaps are faster than arrays for everything',
              'To sort the buildings by height',
            ],
            answer: 1,
            why: 'When ladders run out, the smallest climb that used a ladder is the one to switch to bricks, so ladders stay on the biggest climbs.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          For each problem, state the greedy choice and the reason it is safe before you write anything. If you cannot, look for a
          counterexample. Problems marked <b>Core</b> are the minimum set; mark each one Solved when you finish it so the{' '}
          <a href="#/review">review queue</a> brings it back.
        </p>
      </div>
      <ProblemSet id="greedy" />

      <Recap>
        <ul>
          <li>Greedy commits to the locally best choice and never reconsiders; it is usually a sort plus a scan, O(n log n).</li>
          <li>It is only correct with a reason: an exchange argument or "greedy stays ahead". Without one, hunt for a counterexample.</li>
          <li>Recurring shapes: best option now, furthest reach, earliest end first, two passes, sort by a pairwise key, and a heap of available options.</li>
          <li>Shared capacity, limited copies or choices that block each other usually mean greedy fails and DP is needed.</li>
        </ul>
      </Recap>
    </>
  );
}
