import type { Topic } from './types';

export const topic: Topic = {
  id: 'sweep-line',
  patterns: [
    { name: 'Count what is active', idea: 'Each interval becomes +1 at its start and −1 at its end; sweeping the sorted events tracks how many are active at every moment.' },
    { name: 'Difference array', idea: 'When coordinates are small, store the +v and −v changes in an array and recover every value with one running sum.' },
    { name: 'Sweep with a heap of active items', idea: 'When you need the best active item rather than a count, keep active items in a heap and drop expired ones lazily.' },
    { name: 'Sweep over the plane', idea: 'Move a vertical line across rectangles; between two events, the covered length on the line stays the same.' },
    { name: 'Queries against events', idea: 'For many point queries, sort the events once; each query becomes "how many started" minus "how many already ended".' },
  ],
  signals: [
    { see: 'The largest number of intervals overlapping at any moment', think: '+1/−1 events, sorted, with a running sum', why: 'The count of active intervals only changes at endpoints.' },
    { see: 'Many range updates, then read every position', think: 'Difference array', why: 'Each update costs two writes; one prefix sum at the end recovers all values.' },
    { see: 'Coordinates up to 10⁹, but only n intervals', think: 'Sort the events (coordinate compression) instead of using an array', why: 'Only endpoints matter, so work with at most 2n event positions.' },
    { see: 'An outline, or the tallest or smallest active item at each point', think: 'Sweep plus a heap of active items', why: 'The heap gives the best active item; items that have ended are removed when they reach the top.' },
    { see: 'Many point queries against a set of intervals', think: 'Sort queries and events and sweep together, or binary search starts and ends', why: 'Each query only needs what has started and what has ended before it.' },
    { see: 'Area or perimeter covered by overlapping rectangles', think: 'Vertical sweep with the union of y ranges', why: 'Between consecutive x events the cross-section does not change.' },
    { see: 'Several events at the same coordinate', think: 'Decide the tie order deliberately', why: 'Half-open intervals process ends first; inclusive intervals process starts first (or end at end + 1).' },
  ],
  problems: [
    // ---------- Count what is active ----------
    {
      id: 1854, title: 'Maximum Population Year', pattern: 'Count what is active', core: true,
      summary: 'From each person\'s birth and death years, find the earliest year with the most people alive. A person is not counted in the year they die.',
      hints: [
        'Each person adds 1 in their birth year and removes 1 in their death year.',
        'Years run from 1950 to 2050, so a small array of changes works.',
        'A running sum over the years gives the population of each year.',
      ],
      insight: 'Add +1 at each birth year and −1 at each death year, then take a running sum: the first year with the largest sum is the answer.',
      approach: [
        'Make an array for the years 1950 to 2050, all zero.',
        'For each person, add 1 at the birth year and subtract 1 at the death year.',
        'Sweep the years with a running sum, remembering the first year where the sum is largest.',
      ],
      ds: ['Array of changes', 'Running sum'], time: 'O(n + Y), Y = 101 years', space: 'O(Y)',
      traps: ['The death year is not counted, which is exactly what the −1 at the death year does.', 'Keep the earliest year: update only on a strictly larger population.'],
    },
    {
      id: 1094, title: 'Car Pooling', pattern: 'Count what is active', core: true,
      summary: 'A car with a fixed number of seats drives east, picking up and dropping off groups of passengers at given points. Decide whether every trip fits.',
      hints: [
        'Only the number of passengers on board at each point matters.',
        'Each trip adds its passengers at the pick-up point and removes them at the drop-off point.',
        'Sweep the points in order; drop-offs happen before pick-ups at the same point.',
      ],
      insight: 'Turn trips into +passengers and −passengers events and sweep them in order; the trips fit exactly when the running load never exceeds the capacity.',
      approach: [
        'Locations are at most 1000, so make an array of changes.',
        'For each trip, add its passengers at the start and subtract them at the end.',
        'Sweep with a running sum; if it ever exceeds the capacity, the answer is false.',
        'Otherwise the answer is true.',
      ],
      ds: ['Array of changes', 'Running sum'], time: 'O(n + L), L = last location', space: 'O(L)',
      traps: [
        'A drop-off and a pick-up at the same point land in the same cell, so the seats freed are reused automatically.',
        'With large coordinates, sort (location, change) events instead of using an array.',
      ],
    },
    {
      id: 732, title: 'My Calendar III', pattern: 'Count what is active',
      summary: 'Events are booked one at a time as half-open time ranges. After each booking, report the largest number of events that overlap at some moment.',
      hints: [
        'After each booking you need the maximum overlap of all events so far.',
        'Keep a map from time to net change: +1 at each start, −1 at each end.',
        'With at most 400 bookings, sweeping the sorted map after every booking is fast enough.',
      ],
      insight: 'Keep the +1/−1 events and sweep them in time order after each booking; the running maximum is the answer. A segment tree with lazy updates brings each booking down to O(log C).',
      approach: [
        'Keep a Map from time to net change.',
        'On each booking, add 1 at the start time and subtract 1 at the end time.',
        'Sweep the times in sorted order with a running sum and return its maximum.',
      ],
      ds: ['Map', 'Sorted keys', 'Running sum'], time: 'O(n² log n) for n bookings (fine for 400)', space: 'O(n)',
      traps: [
        'A TypeScript Map keeps insertion order, not sorted order: sort the keys before each sweep (or keep a sorted array of times).',
        'Ranges are half-open, so an event ending at 10 and one starting at 10 cancel out in the same cell, as they should.',
      ],
    },

    // ---------- Difference array ----------
    {
      id: 2848, title: 'Points That Intersect With Cars', pattern: 'Difference array',
      summary: 'Each car covers an inclusive range of integer points on a line. Count the points covered by at least one car.',
      hints: [
        'Coordinates are at most 100.',
        'Add +1 at each start and −1 just after each end, then sweep.',
        'A point is covered when the running sum is positive.',
      ],
      insight: 'A difference array over the small coordinate range turns overlapping ranges into a coverage count for every point.',
      approach: [
        'Make an array of size 102, all zero.',
        'For each car, add 1 at its start and subtract 1 at its end + 1.',
        'Sweep with a running sum and count the points where it is positive.',
      ],
      ds: ['Difference array'], time: 'O(n + C), C = 100', space: 'O(C)',
      traps: ['Ends are inclusive, so the −1 goes at end + 1.'],
    },
    {
      id: 1109, title: 'Corporate Flight Bookings', pattern: 'Difference array', core: true,
      summary: 'Each booking reserves the same number of seats on every flight in a range of flights. Return the total seats reserved on each flight.',
      hints: [
        'Adding to every flight of every range can take 4 × 10⁸ steps.',
        'Record +seats at the first flight of the range and −seats just after the last flight.',
        'A running sum turns those changes into totals.',
      ],
      insight: 'A difference array applies each range update with two writes, and one running sum recovers all the totals.',
      approach: [
        'Make an array diff of size n + 1, all zero.',
        'For each booking (first, last, seats), using 0-based indices: add seats at first − 1 and subtract seats at last.',
        'Sweep with a running sum to produce the total for each flight.',
      ],
      ds: ['Difference array', 'Running sum'], time: 'O(n + b)', space: 'O(n)',
      traps: ['Flights are numbered from 1; shift to 0-based indices consistently.'],
    },
    {
      id: 1943, title: 'Describe the Painting', pattern: 'Difference array',
      summary: 'Coloured segments overlap on a line and their colours mix. Describe the painting with the fewest half-open segments, each labelled with the sum of the colours mixed there.',
      hints: [
        'The mix only changes where some segment starts or ends.',
        'Record +colour at each start and −colour at each end in a map.',
        'Sweep the sorted positions: between two consecutive positions the mix is constant.',
      ],
      insight: 'Every start and end is a boundary even when the sum stays the same, because the set of colours changes. Sweep the sorted boundaries with a running sum and output a segment wherever the sum is positive.',
      approach: [
        'Map each position to its net change: add the colour at segment starts and subtract it at segment ends. Keep a position even when its net change comes to zero.',
        'Sort the positions.',
        'Sweep consecutive positions p and q with a running sum; if the sum after p is positive, output [p, q, sum].',
      ],
      ds: ['Map of changes', 'Sorting', 'Running sum'], time: 'O(n log n)', space: 'O(n)',
      traps: [
        'Do not merge neighbouring segments with equal sums: different colour sets can add up to the same sum.',
        'Sums reach about 2 × 10¹³: exact in TypeScript numbers, 64-bit integers elsewhere.',
      ],
    },

    // ---------- Sweep with a heap of active items ----------
    {
      id: 218, title: 'The Skyline Problem', pattern: 'Sweep with a heap of active items', core: true,
      summary: 'Given rectangular buildings on flat ground, return the key points where the outline of the city changes height.',
      hints: [
        'The outline can only change at a building\'s left or right edge.',
        'At an edge x, the height is that of the tallest building covering x (left ≤ x < right).',
        'Keep active buildings in a max-heap by height, and remove buildings whose right edge has passed only when they reach the top.',
      ],
      insight: 'Sweep the edge positions from left to right: add buildings that start, discard heap tops that have ended, and record a key point whenever the tallest active height changes.',
      approach: [
        'Collect every left and right edge, sorted, without duplicates.',
        'At each position x: push every building with left ≤ x into a max-heap of (height, right).',
        'While the top\'s right edge ≤ x, pop it: that building has ended.',
        'The current height is the top\'s height, or 0 if the heap is empty; if it differs from the last key point\'s height, record [x, height].',
      ],
      ds: ['Max-heap', 'Sorted edges'], time: 'O(n log n)', space: 'O(n)',
      traps: [
        'Record a point only when the height changes, so equal heights merge into one segment.',
        'Process every building at the same x before reading the height, or you record spurious points.',
        'Divide and conquer (merging two skylines like merge sort) is the other classic solution.',
      ],
    },
    {
      id: 1851, title: 'Minimum Interval to Include Each Query', pattern: 'Sweep with a heap of active items',
      summary: 'For each query point, return the size of the smallest interval that contains it, or −1 if none does.',
      hints: [
        'Answer the queries in sorted order rather than the given order (remember their original positions).',
        'As the query point moves right, add intervals that have started into a min-heap ordered by size.',
        'Pop intervals from the top whose end is before the query; then the top is the answer.',
      ],
      insight: 'An offline sweep: sort intervals by start and queries by value. Each interval enters the heap once and leaves once, and expired intervals are removed lazily, only when they reach the top.',
      approach: [
        'Sort intervals by left end; sort the query values together with their original indices.',
        'For each query q in increasing order: push every interval with left ≤ q into a min-heap as (size, right).',
        'Pop while the top\'s right end is less than q.',
        'The answer for q is the top\'s size, or −1 if the heap is empty; store it at q\'s original index.',
      ],
      ds: ['Min-heap', 'Sorting'], time: 'O((n + q) log n)', space: 'O(n + q)',
      traps: ['Lazy removal is safe: an interval that ends before q also ends before every later query.', 'Return the answers in the original query order.'],
    },
    {
      id: 759, title: 'Employee Free Time', pattern: 'Sweep with a heap of active items',
      summary: 'Each employee has a sorted list of non-overlapping working intervals. Return the finite intervals during which every employee is free.',
      hints: [
        'Time when everyone is free is a gap in the union of all working intervals.',
        'Merge all intervals in start order, for example with a min-heap holding each employee\'s next interval.',
        'Every gap between consecutive merged blocks is common free time.',
      ],
      insight: 'Merge everyone\'s working intervals into one union, visiting them in start order through a min-heap of each employee\'s next interval, and report the gaps between merged blocks.',
      approach: [
        'Push each employee\'s first interval into a min-heap ordered by start.',
        'Pop the earliest interval. If it starts after the current merged end, the gap between them is free time; otherwise extend the merged end.',
        'Push that employee\'s next interval, if any.',
        'Repeat until the heap is empty.',
      ],
      ds: ['Min-heap', 'Merging'], time: 'O(N log k) for N intervals and k employees', space: 'O(k)',
      traps: ['Only finite gaps count: nothing before the first start or after the last end.', 'A block that ends exactly where the next one starts leaves no free time.'],
    },

    // ---------- Sweep over the plane ----------
    {
      id: 850, title: 'Rectangle Area II', pattern: 'Sweep over the plane',
      summary: 'Compute the total area covered by a set of axis-aligned rectangles, counting overlapping parts once, modulo 10⁹ + 7.',
      hints: [
        'Sweep a vertical line from left to right across all x edges.',
        'Between two consecutive x edges the covered height is constant: the length of the union of the y ranges of the rectangles spanning that strip.',
        'Area of a strip = width × covered height. With 200 rectangles, recomputing the union for each strip is fast enough.',
      ],
      insight: 'Between consecutive x events the set of active rectangles is fixed, so the area is the sum over strips of (width × length of the union of their y ranges), computed with a merge-intervals pass or a segment tree over compressed y values.',
      approach: [
        'Collect and sort all distinct x edges.',
        'For each pair of neighbouring x values, gather the rectangles that span the whole strip and merge their y ranges into a union length.',
        'Add width × union length to the total.',
        'Return the total modulo 10⁹ + 7.',
      ],
      ds: ['Sorted x events', 'Merge intervals on y'], time: 'O(n² log n) for n rectangles', space: 'O(n)',
      traps: [
        'One strip\'s area can reach 10¹⁸, beyond the 2⁵³ that TypeScript numbers store exactly: multiply with BigInt before taking the remainder.',
        'Coordinates up to 10⁹ rule out a grid of unit cells.',
      ],
    },

    // ---------- Queries against events ----------
    {
      id: 2251, title: 'Number of Flowers in Full Bloom', pattern: 'Queries against events', core: true,
      summary: 'Flowers bloom over inclusive time ranges. For each person\'s arrival time, count the flowers in full bloom.',
      hints: [
        'A flower is blooming at time t if it has started by t and has not ended before t.',
        'So the count is (number of starts ≤ t) − (number of ends < t).',
        'Sort all starts and all ends separately and binary search both for each person.',
      ],
      insight: 'The flowers blooming at time t are those that have started minus those that have already finished, and both counts are positions in sorted arrays, found by binary search.',
      approach: [
        'Sort the start times and the end times into two separate arrays.',
        'For each arrival time t: count the starts ≤ t (upper bound) and the ends < t (lower bound).',
        'The answer for that person is the difference.',
      ],
      ds: ['Two sorted arrays', 'Binary search'], time: 'O((n + m) log n)', space: 'O(n)',
      traps: [
        'Ends are inclusive: a flower that ends at t still blooms at t, so subtract only the ends strictly before t.',
        'An offline sweep (sort the people too, then walk events and people together) works as well.',
      ],
    },
  ],
};
