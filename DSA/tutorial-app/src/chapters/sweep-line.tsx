import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/sweep-line';
import { maxOverlap, rangeAddDifference } from '../traces/sweep-line';
import { Walkthrough } from '../viz/Walkthrough';

const rooms = maxOverlap([[1, 5], [2, 6], [5, 8], [7, 9], [3, 4]]);
const diff = rangeAddDifference(6, [[0, 2, 10], [1, 4, 5], [3, 5, 2]]);

export default function SweepLine() {
  return (
    <>
      <TopicIntro
        id="sweep-line"
        time="4–5 hours, plus problems"
        before={['intervals', 'sorting', 'prefix-sum']}
        learn={[
          'How to turn intervals into start and end events and sweep them in order',
          'The tie rules at equal coordinates, and why they decide correctness',
          'Difference arrays for many range updates, and coordinate compression for huge coordinates',
          'Sweeps that keep a heap of active items: the skyline, smallest covering interval, free time',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          A ticket inspector on a train does not recount everyone between stations; the number of passengers can only change at
          a station, where people get on (+) or off (−). A <b>sweep line</b> works the same way. Picture a vertical line moving
          from left to right across all the intervals. Nothing interesting happens between endpoints, so the line jumps from one{' '}
          <b>event</b> to the next and updates a small amount of state: how many intervals are active, which ones, or the tallest
          of them.
        </p>
        <p>
          Checking every pair of intervals for overlap is <Cost>O(n²)</Cost>, and marking every time unit is impossible when times
          reach 10⁹. A sweep sorts the 2n events in <Cost>O(n log n)</Cost> and processes each one in <Cost>O(1)</Cost> or{' '}
          <Cost>O(log n)</Cost>, no matter how large the coordinates are.
        </p>
      </div>

      <Walkthrough
        title="How many rooms? Sweep +1 and −1 events"
        frames={rooms.frames}
        caption={`The dashed line is the sweep position. The running count of active meetings peaks at ${rooms.best}, so that many rooms are needed.`}
      />

      <Box kind="key" label="Key idea">
        <p>
          Turn every interval into a <b>start event</b> and an <b>end event</b>, sort all events by coordinate, and walk through
          them keeping a running state. Then settle one detail on purpose: what happens when an end and a start share a
          coordinate. For half-open intervals [s, e) process ends first, so back-to-back meetings share a room. For inclusive
          intervals [s, e] either process starts first or move each end event to e + 1.
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
          { name: 'Event list', ts: 'array of [coordinate, change] pairs', ops: 'sort O(n log n)', use: 'The general sweep. Sort by coordinate, then by the tie rule.' },
          { name: 'Difference array', ts: 'number[] of size (range + 1)', ops: 'two writes per update, one O(range) prefix sum', use: 'Small coordinates and many range updates.' },
          { name: 'Map of changes', ts: 'Map<number, number>, keys sorted before the sweep', ops: 'O(1) per update, O(k log k) to sort k keys', use: 'Large coordinates: only positions that appear as endpoints get a cell.' },
          { name: 'Heap of active items', ts: 'no built-in; a binary heap on an array', ops: 'push and pop O(log n)', use: 'The best active item: the tallest building, the smallest covering interval.' },
          { name: 'Two sorted arrays', ts: 'starts[] and ends[]', ops: 'binary search O(log n)', use: 'Answer "how many are active at time t" for many queries.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Count what is active</h2>
        <p>
          The most common sweep keeps one number: how many intervals contain the current position. Its maximum is the number of
          rooms, cars or overlapping bookings needed. When coordinates are small (years, kilometres up to 1000) a plain array of
          changes works; when they are large, sort the events instead.
        </p>
      </div>
      <Recipe
        name="Active count sweep"
        when="you need the maximum or the full profile of how many intervals overlap."
        steps={[
          'For each interval, create a +1 (or +weight) event at its start and a −1 (or −weight) event at its end.',
          'Sort the events by coordinate; at equal coordinates, apply the tie rule (ends first for half-open intervals).',
          'Walk the events, adding each change to a running total.',
          'Record the maximum (or whatever the question asks) after each event or after each group of events at the same coordinate.',
        ]}
        why="the number of active intervals can only change at an endpoint, so checking just after every event sees every value it ever takes."
        time="O(n log n)"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 2: Difference array</h2>
        <p>
          A difference array is a sweep stored in an array. To add v to every position from l to r, write +v at l and −v at r + 1.
          After all updates, a running sum from left to right turns the changes into the final values. Each update costs two
          writes instead of r − l + 1, and the final sweep is one pass. It is the reverse of a prefix sum, covered in{' '}
          <See id="prefix-sum" />.
        </p>
      </div>
      <Walkthrough
        title="Three range additions with a difference array"
        frames={diff.frames}
        caption="Green marks where an addition starts, red where it stops. The running sum rebuilds every value in one pass."
      />
      <Recipe
        name="Difference array"
        when="you apply many 'add v to every position in l..r' updates and read the values only at the end."
        steps={[
          'Make an array diff one longer than the number of positions, filled with zeros.',
          'For each update (l, r, v): add v to diff[l] and subtract v from diff[r + 1].',
          'Sweep from left to right with a running sum; the running sum at position i is the final value there.',
        ]}
        why="the running sum at i adds up exactly the updates whose start is at or before i and whose stop is after i, which are the updates covering i."
        time="O(n + number of updates)"
        space="O(n)"
      />
      <div className="prose">
        <p>
          <b>Coordinate compression.</b> If positions go up to 10⁹, store the changes in a Map keyed by coordinate instead, then
          sort the keys and sweep them. Only the 2n coordinates that are actually endpoints get a cell. Between two consecutive
          keys, the running value is constant, which is exactly what Describe the Painting needs.
        </p>
      </div>

      <div className="prose">
        <h2>Pattern 3: Sweep with a heap of active items</h2>
        <p>
          Sometimes a count is not enough: you need the <b>best</b> active item. In the skyline you need the tallest building that
          covers x; for each query point you need the smallest interval containing it. Keep the active items in a{' '}
          <See id="heap" /> ordered by what "best" means. Removing an item from the middle of a heap is awkward, so use{' '}
          <b>lazy deletion</b>: leave ended items in the heap, and pop them only when they reach the top and you notice their end
          has passed.
        </p>
      </div>
      <Recipe
        name="Sweep with lazy heap deletion"
        when="at each event or query you need the maximum or minimum among the currently active items."
        steps={[
          'Sort the items by start, and sort the event positions or queries.',
          'At each position, push every item that has started into the heap, keyed by the quantity you optimise (height, size) and carrying its end.',
          'While the heap\'s top has already ended, pop it.',
          'Now the top is the best active item; read the answer from it (or 0 / −1 if the heap is empty).',
        ]}
        why="an ended item can never become relevant again as the sweep moves right, so removing it late, only when it surfaces, is as good as removing it immediately."
        time="O(n log n)"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 4: Sweep over the plane</h2>
        <p>
          For rectangles, sweep a vertical line along the x axis. The events are the left and right edges. Between two consecutive
          x events, the set of rectangles crossing the line does not change, so the covered height is constant on that strip: it is
          the total length of the union of their y ranges (a merge-intervals pass, see <See id="intervals" />). The area is the sum
          of strip width × covered height. With many rectangles, a <See id="segment-tree" /> over compressed y coordinates
          maintains the covered length in <Cost>O(log n)</Cost> per event.
        </p>
      </div>
      <Recipe
        name="Area by vertical sweep"
        when="you need the area (or perimeter) covered by overlapping axis-aligned rectangles."
        steps={[
          'Collect all distinct x coordinates of left and right edges and sort them.',
          'For each pair of neighbouring x values, find the rectangles that span the strip between them.',
          'Merge their y ranges and add up the length of the union.',
          'Add strip width × union length to the area.',
        ]}
        why="inside a strip nothing starts or ends, so the cross-section is the same at every x in it."
        time="O(n² log n) simply, O(n log n) with a segment tree"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 5: Queries against events</h2>
        <p>
          When many people ask "how many flowers are blooming when I arrive?", you do not need a sweep per person. The number of
          intervals active at time t is the number that have started by t minus the number that have ended before t. Sort the
          starts and the ends into two separate arrays, and each question becomes two binary searches. Alternatively, sort the
          queries too and sweep events and queries together: that is called answering the queries <b>offline</b>.
        </p>
      </div>
      <Recipe
        name="Started minus ended"
        when="many point queries ask how many intervals contain a point."
        steps={[
          'Sort all starts into one array and all ends into another.',
          'For a query at t, count the starts ≤ t with an upper-bound binary search.',
          'Count the ends that are already over (ends < t for inclusive intervals) with a lower-bound binary search.',
          'The answer is the difference.',
        ]}
        why="an interval contains t exactly when it started by t and did not end before t; every interval that ended has also started, so subtracting is exact."
        time="O((n + q) log n)"
        space="O(n)"
      />

      <div className="prose">
        <h2>Choosing a tool</h2>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Situation</th>
            <th>Tool</th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Small coordinates, many range updates, read everything once</td><td>Difference array</td><td>O(n + range)</td></tr>
          <tr><td>Large coordinates, need the maximum overlap</td><td>Sorted events or a Map with sorted keys</td><td>O(n log n)</td></tr>
          <tr><td>Need the best active item (tallest, smallest)</td><td>Sweep + heap with lazy deletion</td><td>O(n log n)</td></tr>
          <tr><td>Many point queries, intervals fixed</td><td>Sorted starts and ends + binary search, or an offline sweep</td><td>O((n + q) log n)</td></tr>
          <tr><td>Updates and queries mixed, online</td><td><See id="segment-tree" /> or <See id="binary-indexed-tree" /></td><td>O(log n) each</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Worked example: The Skyline Problem</h2>
        <Step n={1}>Brute force first</Step>
        <p>
          For every x where something might change, look at all buildings and take the tallest one covering x. There are up to 2n
          such x values and n buildings each: <Cost>O(n²)</Cost>, about 2 × 10⁸ steps for 10⁴ buildings. Too slow, but it tells
          you where to look: the outline can only change at a left or right edge.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          Between two neighbouring edges, the set of buildings covering x does not change, yet the brute force rescans all of them.
          You only need to know which buildings are active and which is the tallest, and that set changes by one building per
          event.
        </p>
        <Step n={3}>Choose the structure</Step>
        <p>
          A max-heap ordered by height gives the tallest active building instantly. Buildings enter the heap when the sweep
          reaches their left edge. Instead of deleting a building at its right edge, check the top before reading the height: if
          the top's right edge is at or before x, pop it, and repeat. Whenever the height you read differs from the last height you
          recorded, record the key point [x, height].
        </p>
        <Step n={4}>Cost and edge cases</Step>
        <p>
          Each building is pushed and popped once: <Cost>O(n log n)</Cost>. Process all buildings that start at the same x before
          reading the height, or two buildings starting together produce an extra point. A building's right edge is not covered by
          it (left ≤ x &lt; right), so when one building ends exactly where another starts at the same height, no point is
          recorded, which is what the problem wants.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Ignoring the tie order at equal coordinates. Half-open intervals need ends before starts; inclusive ones need the opposite (or end + 1).</>,
          <>Allocating an array over coordinates up to 10⁹. Sort the events or use a Map with sorted keys.</>,
          <>Iterating a TypeScript Map and assuming its keys come out sorted. They come out in insertion order.</>,
          <>Merging neighbouring segments just because their values are equal, when the problem cares about what is active (Describe the Painting).</>,
          <>Products of large coordinates overflowing 2⁵³ (rectangle areas up to 10¹⁸). Use BigInt for the multiplication.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Half-open meetings [1, 3), [3, 5), [2, 4). What is the maximum overlap, and what would you get if you processed starts before ends at time 3?',
            solution: 'With ends first the maximum is 2 (for example at time 2). Processing the start at 3 before the end at 3 would briefly count 3 meetings and give a wrong answer of 3.',
          },
          {
            task: 'Apply "add 4 to 1..3" and "add 1 to 2..5" on positions 0..5 with a difference array. Write the array and the final values.',
            solution: 'diff = [0, 4, 1, 0, −4, 0, −1] (size 7). Running sums: 0, 4, 5, 5, 1, 1.',
          },
          {
            task: 'Flowers bloom over [1, 4], [2, 6] and [5, 9] (inclusive). How many bloom at time 5, using "starts ≤ t minus ends < t"?',
            solution: 'Starts ≤ 5: 1, 2 and 5 make 3. Ends < 5: only 4 makes 1. Answer 2 (the second and third flowers).',
          },
          {
            task: 'Why is lazy deletion safe in the skyline sweep?',
            solution: 'The sweep only moves right. A building whose right edge has passed can never cover any later x, so it may stay in the heap until it reaches the top, where it is removed before its height could be read.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'Car trips add passengers at the pick-up point and remove them at the drop-off point. What decides whether a car of capacity c is enough?',
            options: ['The longest trip', 'The maximum running sum of the sorted +/− events', 'The number of trips', 'The sum of all passengers'],
            answer: 1,
            why: 'The running sum is the load at each point; the car is enough exactly when that sum never exceeds c.',
          },
          {
            q: 'For half-open intervals [s, e), which event goes first when an end and a start share a coordinate?',
            options: ['The start', 'The end', 'It does not matter', 'The longer interval'],
            answer: 1,
            why: 'The interval ending at e does not include e, so it must be gone before the one starting at e is counted.',
          },
          {
            q: 'You apply 10⁵ range additions to an array of 10⁵ positions and read all values once. Best tool?',
            options: ['Update every position of every range', 'A difference array', 'A heap', 'Sorting each range'],
            answer: 1,
            why: 'Two writes per update plus one final running sum: O(n + updates) instead of up to 10¹⁰ steps.',
          },
          {
            q: 'In the skyline sweep, the heap holds:',
            options: ['All buildings sorted by left edge', 'The active buildings, ordered by height', 'The key points', 'Only the tallest building'],
            answer: 1,
            why: 'The top of a max-heap of active buildings is the current outline height; buildings that ended are popped when they reach the top.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          Begin with Maximum Population Year, Car Pooling and Corporate Flight Bookings to make the +1/−1 idea automatic. Then the
          Hard problems each add one ingredient: a heap (The Skyline Problem, Minimum Interval to Include Each Query), binary
          search (Number of Flowers in Full Bloom), or a second dimension (Rectangle Area II).
        </p>
      </div>
      <ProblemSet id="sweep-line" />

      <Recap>
        <ul>
          <li>Turn intervals into start and end events, sort them, and keep running state; nothing changes between events.</li>
          <li>Decide the tie rule deliberately: ends first for half-open intervals, starts first (or end + 1) for inclusive ones.</li>
          <li>Small coordinates: a difference array. Large coordinates: sorted events or a Map with sorted keys.</li>
          <li>Need the best active item: add a heap with lazy deletion. Many point queries: started minus ended, by binary search.</li>
        </ul>
      </Recap>
    </>
  );
}
