import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/intervals';
import { keepMostByEnd, mergeIntervals } from '../traces/intervals';
import { VizFigure } from '../viz/Viz';
import { Walkthrough } from '../viz/Walkthrough';

const merge = mergeIntervals([[7, 9], [1, 4], [13, 16], [2, 5], [8, 11], [3, 4]]);
const keep = keepMostByEnd([[1, 4], [2, 3], [3, 6], [5, 7], [6, 9], [8, 10]]);

export default function Intervals() {
  return (
    <>
      <TopicIntro
        id="intervals"
        time="4–5 hours, plus problems"
        before={['sorting', 'two-pointers', 'binary-search']}
        learn={[
          'How to test two intervals for overlap and compute their intersection',
          'When to sort by start and when to sort by end, and why it matters',
          'Five patterns: merge, keep the most, rooms and groups, weighted intervals, search among intervals',
          'The exchange argument that proves greedy interval choices are safe',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          An interval is a stretch of time or space with a start and an end: a meeting from 9 to 11, a balloon from x = 2 to x = 8,
          a booking from day 3 to day 5. Interval problems ask how such stretches interact: which ones overlap, how few rooms they
          need, how many you can keep without clashes, how much value you can collect.
        </p>
        <p>
          Almost every interval problem starts the same way: <b>sort</b>. In the order you are given, two overlapping intervals can
          be anywhere in the list, so you would compare every pair, <Cost>O(n²)</Cost>. Sorted, the intervals that can interact sit
          next to each other, and one pass of <Cost>O(n)</Cost> after an <Cost>O(n log n)</Cost> sort is enough. The real decision
          is <b>what to sort by</b>: the start or the end.
        </p>
      </div>

      <div className="prose">
        <h3>Overlap in one line</h3>
        <p>
          Two closed intervals [a, b] and [c, d] overlap exactly when <b>a ≤ d and c ≤ b</b>: each one starts before the other ends.
          Their intersection is <b>[max(a, c), min(b, d)]</b> when that range is not empty. If intervals are half-open, [a, b)
          meaning b is not included, use strict comparisons instead: a &lt; d and c &lt; b. Always check which kind the problem uses,
          because "do [1, 2] and [2, 3] overlap?" has a different answer in different problems.
        </p>
      </div>
      <VizFigure
        caption="Blue overlaps green (they share 3..6). Amber lies inside green. Red only touches green at 9: an overlap for closed intervals, not for half-open ones."
        parts={[
          {
            kind: 'intervals',
            label: 'how intervals relate',
            items: [
              { start: 3, end: 9, label: 'green [3, 9]', tone: 'match' },
              { start: 1, end: 6, label: 'blue [1, 6]', tone: 'info' },
              { start: 5, end: 7, label: 'amber [5, 7]', tone: 'warn' },
              { start: 9, end: 12, label: 'red [9, 12]', tone: 'bad' },
            ],
            min: 0,
            max: 13,
          },
        ]}
      />

      <Walkthrough
        title="Merge overlapping intervals: sort by start, then one pass"
        frames={merge.frames}
        caption="After sorting by start, an interval can only overlap the block that is currently open, so each interval is compared once."
      />

      <Box kind="key" label="Key idea">
        <p>
          <b>Sort by start</b> when you build things up from the left: merging, inserting, assigning rooms as meetings arrive.{' '}
          <b>Sort by end</b> when you choose which intervals to keep: the one that finishes first leaves the most room for the
          rest. Picking the wrong key is the most common reason an interval greedy fails.
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
          { name: 'Array of pairs', ts: 'number[][] or [number, number][]', ops: 'sort O(n log n)', use: 'The intervals themselves. Sort with a comparator on start or end.' },
          { name: 'Min-heap of end times', ts: 'no built-in; a binary heap on an array', ops: 'push and pop O(log n)', use: 'Which room or group frees up first (Meeting Rooms II, Meeting Rooms III).' },
          { name: 'Two sorted arrays', ts: 'starts[] and ends[], sorted separately', ops: 'O(n log n) to sort', use: 'A heap-free way to count overlaps: sweep both arrays with two pointers.' },
          { name: 'Binary search', ts: 'a lower or upper bound on a sorted array', ops: 'O(log n)', use: 'Find the first interval starting after a time (right interval, next compatible job).' },
          { name: 'DP array', ts: 'number[] indexed by interval', ops: 'O(1) per entry', use: 'Weighted interval scheduling, where greedy fails.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Merge overlapping</h2>
        <p>
          Merge Intervals is the template. Once sorted by start, keep one "open" block. Each new interval either reaches into the
          open block (extend its end) or starts after it (close the block and open a new one). Insert Interval is the same idea on a
          list that is already sorted, so it needs no sort and runs in <Cost>O(n)</Cost>.
        </p>
      </div>
      <Recipe
        name="Merge after sorting by start"
        when="you need the union of intervals, its total length, or the gaps between merged blocks."
        steps={[
          'Sort intervals by start (skip this if they arrive sorted).',
          'Open a block with the first interval.',
          'For each next interval: if it starts at or before the block\'s end, extend the block\'s end to the larger of the two ends.',
          'Otherwise close the block (record it) and open a new block with this interval.',
          'Record the last block.',
        ]}
        why="after sorting, no later interval starts earlier, so once an interval starts beyond the block's end, nothing after it can reach back into that block."
        time="O(n log n), or O(n) if already sorted"
        space="O(n) for the output"
      />

      <div className="prose">
        <h2>Pattern 2: Keep the most, remove the fewest</h2>
        <p>
          "Remove the fewest intervals so the rest do not overlap", "shoot the fewest arrows", "build the longest chain" are all
          the same problem: choose as many non-overlapping intervals as possible. The answer is a famous greedy: sort by end, and
          keep every interval that starts after the last kept interval ends.
        </p>
      </div>
      <Walkthrough
        title="Keep the most non-overlapping intervals: sort by end"
        frames={keep.frames}
        caption="The dashed line marks the end of the last kept interval. Anything starting before it clashes and is removed."
      />
      <Recipe
        name="Greedy by earliest end"
        when="you choose a largest set of non-overlapping intervals, or equivalently remove the fewest."
        steps={[
          'Sort intervals by end.',
          'Keep the first interval and remember its end.',
          'For each next interval: if it starts after the remembered end (or at it, if touching is allowed), keep it and remember its end.',
          'Otherwise skip it; it clashes with an interval that ends no later.',
          'The number kept is the answer; the number skipped is the minimum to remove.',
        ]}
        why="an exchange argument: the earliest-ending interval can replace the first interval of any optimal answer without causing a clash, so keeping it is always safe (proof below)."
        time="O(n log n)"
        space="O(1) besides the sort"
      />

      <div className="prose">
        <h2>Pattern 3: Rooms and groups</h2>
        <p>
          "How many rooms do we need?" equals "what is the largest number of meetings happening at the same moment?". Two standard
          ways to compute it:
        </p>
        <ul>
          <li>
            <b>Min-heap of end times.</b> Process meetings by start. If the room that frees up first (the heap's top) is free by
            this start, reuse it (pop); then push this meeting's end. The heap's final size is the number of rooms.
          </li>
          <li>
            <b>Sweep of events.</b> Make a +1 event at every start and a −1 event at every end, sort them, and track the running
            total. Its peak is the answer. This needs no heap and is the topic of <See id="sweep-line" />.
          </li>
        </ul>
      </div>
      <Recipe
        name="Rooms with a min-heap"
        when="intervals must be assigned to the fewest resources (rooms, groups, machines), or you must simulate who gets which resource."
        steps={[
          'Sort intervals by start.',
          'For each interval, look at the smallest end time in the min-heap.',
          'If that room is free by this interval\'s start (strictly before it, for inclusive ends), pop it to reuse the room.',
          'Push this interval\'s end time.',
          'The heap size at the end (or its largest size, if you pop more than one per step) is the number of rooms needed.',
        ]}
        why="reusing the room that frees up earliest never blocks a later meeting that a different choice would have allowed."
        time="O(n log n)"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 4: Weighted intervals</h2>
        <p>
          When every interval has a value (profit, weight), greedy breaks: one long, valuable job can beat three short ones. The fix
          is dynamic programming. Sort by end. For each interval, the best total either skips it (the best total of the intervals
          before it) or takes it (its value plus the best total of the intervals that end before it starts). That earlier position
          is found by binary search on the sorted ends. You will meet this shape again in <See id="dp" />.
        </p>
      </div>
      <Recipe
        name="Weighted interval scheduling"
        when="intervals carry values and you maximise the total value of a non-overlapping selection."
        steps={[
          'Sort intervals by end.',
          'Let best[i] be the best total using only the first i intervals; best[0] = 0.',
          'For interval i, binary search the number c of intervals that end before (or at, if allowed) its start.',
          'best[i] = the larger of best[i − 1] and value(i) + best[c].',
          'The answer is best[n]. For "at most k intervals", add k as a second dimension.',
        ]}
        why="intervals are processed in end order, so every interval compatible with i and ending earlier is among the first c, and best[c] already holds their optimum."
        time="O(n log n)"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 5: Search among intervals</h2>
        <p>
          When intervals are sorted, finding "the first interval that starts at or after time t" is a binary search. That answers
          right-interval questions directly and is the inner step of weighted scheduling. Keep the original indices next to the
          starts before sorting, because the answer usually asks for an index.
        </p>
      </div>
      <Recipe
        name="Binary search on sorted starts"
        when="each interval or query needs the next interval in time."
        steps={[
          'Build a list of (start, original index) and sort it by start.',
          'For each query time t, binary search the first start that is ≥ t (or > t for strict versions).',
          'Report that interval\'s original index, or −1 if the search runs off the end.',
        ]}
        why="sorted starts are monotone, so the first one that reaches t is found in O(log n) steps."
        time="O(n log n) to sort, O(log n) per query"
        space="O(n)"
      />

      <div className="prose">
        <h2>Sort by start or by end?</h2>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Goal</th>
            <th>Sort by</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Merge, insert, union length</td><td>Start</td><td>Builds blocks from left to right; overlapping intervals become neighbours.</td></tr>
          <tr><td>Keep the most non-overlapping, fewest arrows</td><td>End</td><td>The earliest end leaves the most room; the exchange argument proves it.</td></tr>
          <tr><td>Rooms, groups, simulation of arrivals</td><td>Start</td><td>Meetings must be handled in the order they begin.</td></tr>
          <tr><td>Remove covered intervals</td><td>Start ascending, end descending</td><td>A covering interval then always comes before the intervals it covers.</td></tr>
          <tr><td>Weighted scheduling</td><td>End</td><td>Every compatible earlier interval forms a prefix of the sorted list.</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Worked example: why greedy by end is correct</h2>
        <Step n={1}>Brute force first</Step>
        <p>
          Non-overlapping Intervals asks for the fewest removals. Trying every subset of intervals is <Cost>O(2ⁿ)</Cost>. Sorting
          by start and keeping intervals greedily fails: [1, 100] would be kept first and block everything inside it.
        </p>
        <Step n={2}>Guess the greedy</Step>
        <p>
          Keep the interval that ends first. It is the choice that leaves the most of the timeline free for everything else.
        </p>
        <Step n={3}>Prove it with an exchange argument</Step>
        <p>
          Take any best selection and look at its first interval X. Let E be the interval with the earliest end overall. E ends no
          later than X, so swapping X for E cannot create a clash with the rest of the selection (everything else starts no earlier than
          X ends, hence no earlier than E ends). The selection is just as large and now starts with E. Repeat the argument on the intervals
          that start after E ends, and you get exactly the greedy's choices. So the greedy keeps as many intervals as any best
          answer.
        </p>
        <Step n={4}>Cost and edge cases</Step>
        <p>
          Sorting costs <Cost>O(n log n)</Cost> and the pass is <Cost>O(n)</Cost>. Touching intervals do not overlap in this
          problem, so an interval may start exactly where the last kept one ended (use ≥). In Minimum Number of Arrows, ranges are
          closed, so a balloon starting at the arrow's position is hit, and the comparison flips to "start greater than the arrow".
        </p>
      </div>

      <Pitfalls
        items={[
          <>Sorting by start for a keep-the-most problem. A long early interval blocks everything; sort by end.</>,
          <>Getting touching intervals wrong. Decide from the statement whether [1, 2] and [2, 3] overlap, then use ≤ or &lt; consistently.</>,
          <>When merging, setting the end to the new interval's end instead of the larger of the two ends.</>,
          <>Building an array indexed by time when times go up to 10⁹. Work with the intervals and sorted events instead.</>,
          <>Using greedy when intervals have values. Weighted problems need DP with binary search.</>,
          <>Losing original indices when sorting, when the answer asks for them.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Do [2, 5] and [5, 9] overlap as closed intervals? As half-open intervals [2, 5) and [5, 9)? What is the closed intersection?',
            solution: 'Closed: yes, they share the point 5, and the intersection is [5, 5]. Half-open: no, because 5 is not part of [2, 5).',
          },
          {
            task: 'Merge [1, 4], [6, 8], [2, 3], [7, 10], [11, 12] after sorting them by start.',
            solution: 'Sorted: [1, 4], [2, 3], [6, 8], [7, 10], [11, 12]. Result: [1, 4], [6, 10], [11, 12].',
          },
          {
            task: 'Find a set of intervals where "keep the one that starts first" keeps fewer intervals than "keep the one that ends first".',
            solution: '[1, 10], [2, 3], [4, 5]. Start-first keeps only [1, 10]. End-first keeps [2, 3] and [4, 5]: two.',
          },
          {
            task: 'How many rooms do the meetings [1, 4), [2, 5), [4, 6), [5, 7) need?',
            solution: '2. At time 2, two meetings run. At 4 the first ends as the third starts, and at 5 the second ends as the fourth starts, so it never reaches 3.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'To remove the fewest intervals so the rest do not overlap, you should sort by:',
            options: ['Start time', 'End time', 'Length', 'Input order'],
            answer: 1,
            why: 'Keeping the interval that ends first leaves the most room for the rest, and the exchange argument proves it is safe.',
          },
          {
            q: 'Two closed intervals [a, b] and [c, d] overlap exactly when:',
            options: ['a < c', 'a ≤ d and c ≤ b', 'b < c', 'a = c'],
            answer: 1,
            why: 'Each must start before the other ends. If either condition fails, one lies entirely after the other.',
          },
          {
            q: 'Jobs have profits. Which approach finds the maximum total profit of non-overlapping jobs?',
            options: ['Greedy by earliest end', 'Greedy by highest profit', 'Sort by end, DP with binary search', 'Merge all intervals'],
            answer: 2,
            why: 'Values break the greedy argument. The DP compares skipping a job with taking it plus the best compatible earlier total.',
          },
          {
            q: 'The minimum number of meeting rooms equals:',
            options: ['The number of meetings', 'The largest number of meetings running at the same time', 'The longest meeting', 'The number of merged blocks'],
            answer: 1,
            why: 'At the busiest moment every running meeting needs its own room, and the greedy room reuse achieves exactly that many.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          Merge Intervals, Insert Interval, Non-overlapping Intervals and Minimum Number of Arrows are the core four; after them,
          most interval problems are variations. Meeting Rooms and Meeting Rooms II need LeetCode Premium;{' '}
          <b>Divide Intervals Into Minimum Number of Groups</b> trains the same idea for free.
        </p>
      </div>
      <ProblemSet id="intervals" />

      <Recap>
        <ul>
          <li>Sort first. By start to merge, insert or assign rooms; by end to keep the most non-overlapping intervals.</li>
          <li>Closed intervals overlap when each starts at or before the other ends; read whether touching counts.</li>
          <li>Rooms needed = peak overlap: a min-heap of end times or a sorted sweep of +1/−1 events.</li>
          <li>Values break greedy: use DP over intervals sorted by end, with binary search for the last compatible one.</li>
        </ul>
      </Recap>
    </>
  );
}
