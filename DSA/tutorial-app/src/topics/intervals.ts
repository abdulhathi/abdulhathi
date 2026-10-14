import type { Topic } from './types';

export const topic: Topic = {
  id: 'intervals',
  patterns: [
    { name: 'Merge overlapping', idea: 'Sort by start; then each interval either extends the current merged block or starts a new one.' },
    { name: 'Keep the most, remove the fewest', idea: 'Sort by end and keep every interval that starts after the last kept one ends.' },
    { name: 'Rooms and groups', idea: 'Sort by start and track when resources free up, with a min-heap of end times (or +1/−1 events).' },
    { name: 'Weighted intervals', idea: 'When intervals carry values, greedy fails: sort, then use DP with binary search for the last compatible interval.' },
    { name: 'Search among intervals', idea: 'Sort the starts once and binary search for the first interval that begins at or after a given time.' },
  ],
  signals: [
    { see: 'Merge, union or total length of overlapping ranges', think: 'Sort by start, then one pass', why: 'After sorting, every interval that overlaps the current block comes right after it.' },
    { see: 'Remove the fewest intervals, or keep the most non-overlapping ones', think: 'Sort by end, then greedy', why: 'The interval that ends first leaves the most room for everything after it.' },
    { see: 'Minimum rooms, groups, platforms or machines', think: 'Peak overlap: a min-heap of end times, or sorted +1/−1 events', why: 'You need as many resources as there are intervals active at the busiest moment.' },
    { see: 'Intervals with values, profits or weights', think: 'Sort by end, DP, binary search', why: 'A greedy rule cannot weigh a long valuable interval against several short ones.' },
    { see: '"Touching" intervals: does [1, 2] overlap [2, 3]?', think: 'Read whether ends are inclusive or half-open', why: 'It decides whether you compare with ≤ or <, the most common interval bug.' },
    { see: 'Times or coordinates up to 10⁹', think: 'Work with the intervals themselves, never an array over time', why: 'Allocate by the number of intervals, not by the size of the timeline.' },
  ],
  problems: [
    // ---------- Merge overlapping ----------
    {
      id: 56, title: 'Merge Intervals', pattern: 'Merge overlapping', core: true,
      summary: 'Merge all overlapping intervals and return the non-overlapping intervals that cover the same ranges.',
      hints: [
        'Overlapping intervals can be far apart in the input. What order would put them next to each other?',
        'Sort by start.',
        'Compare each interval only with the last merged interval.',
      ],
      insight: 'After sorting by start, an interval overlaps the current merged block exactly when it starts at or before the block\'s end, so one pass merges everything.',
      approach: [
        'Sort the intervals by start.',
        'Start the result with the first interval.',
        'For each next interval: if its start ≤ the last result interval\'s end, set that end to the larger of the two ends; otherwise append the interval.',
        'Return the result.',
      ],
      ds: ['Array of intervals', 'Sorting'], time: 'O(n log n)', space: 'O(n)',
      traps: ['Take the larger of the two ends: an interval can lie completely inside the current block.', 'Here touching intervals such as [1, 4] and [4, 5] overlap and merge.'],
    },
    {
      id: 57, title: 'Insert Interval', pattern: 'Merge overlapping', core: true,
      summary: 'Insert a new interval into a sorted list of non-overlapping intervals, merging wherever needed.',
      hints: [
        'The list is already sorted, so do not sort again.',
        'There are three phases: intervals entirely before the new one, intervals that overlap it, intervals entirely after it.',
        'While intervals overlap, grow the new interval to cover them.',
      ],
      insight: 'Because the list is sorted and disjoint, the intervals that overlap the new one form a single contiguous run; absorb that run into the new interval in one pass.',
      approach: [
        'Copy every interval that ends before the new interval starts.',
        'While the next interval starts at or before the new interval\'s end, replace the new interval with the union of the two.',
        'Add the grown new interval.',
        'Copy the remaining intervals.',
      ],
      ds: ['Array of intervals'], time: 'O(n)', space: 'O(n)',
      traps: ['Intervals that touch at a single point overlap here (they share that point).', 'The list can be empty.'],
    },
    {
      id: 3169, title: 'Count Days Without Meetings', pattern: 'Merge overlapping',
      summary: 'Given a number of days and possibly overlapping meetings (inclusive ranges of days), count the days with no meeting.',
      hints: [
        'The number of days can be 10⁹, so you cannot mark days one by one.',
        'Merge the meetings into disjoint blocks.',
        'Free days = total days minus the total length of the merged blocks.',
      ],
      insight: 'Merge overlapping meetings and subtract their total length from the number of days; the length of the calendar never matters.',
      approach: [
        'Sort meetings by start day.',
        'Merge them, extending the current block while the next meeting starts on or before its end day.',
        'Add up the lengths of the merged blocks (end − start + 1).',
        'Return the number of days minus that total.',
      ],
      ds: ['Array of intervals', 'Sorting'], time: 'O(n log n)', space: 'O(1) besides the sort',
      traps: ['Days are inclusive: a block from day 2 to day 4 covers 3 days.'],
    },

    // ---------- Keep the most, remove the fewest ----------
    {
      id: 435, title: 'Non-overlapping Intervals', pattern: 'Keep the most, remove the fewest', core: true,
      summary: 'Remove the fewest intervals so that the rest do not overlap. Intervals that only touch at a point do not overlap.',
      hints: [
        'Removing the fewest is the same as keeping the most.',
        'Which interval should you keep first to leave the most room for the others?',
        'Sort by end, and keep each interval that starts at or after the last kept end.',
      ],
      insight: 'The interval that ends first is always part of some best answer, so keep intervals greedily in order of end time and count the ones that clash.',
      approach: [
        'Sort by end.',
        'lastEnd = −infinity; kept = 0.',
        'For each interval: if its start ≥ lastEnd, keep it and set lastEnd to its end; otherwise it is removed.',
        'Return n − kept.',
      ],
      ds: ['Array of intervals', 'Sorting'], time: 'O(n log n)', space: 'O(1) besides the sort',
      traps: [
        'If you sort by start instead, on a clash you must keep the interval with the smaller end; sorting by end avoids that subtlety.',
        'Touching intervals do not overlap here, so compare with ≥.',
      ],
    },
    {
      id: 452, title: 'Minimum Number of Arrows to Burst Balloons', pattern: 'Keep the most, remove the fewest', core: true,
      summary: 'Balloons cover closed ranges on a line. An arrow shot at position x bursts every balloon whose range contains x. Find the fewest arrows.',
      hints: [
        'Think about the balloon that ends first: some arrow must hit it.',
        'Shooting at its end bursts it, and as many other balloons as possible.',
        'Sort by end and shoot a new arrow only when a balloon starts after the current arrow.',
      ],
      insight: 'Shooting at the earliest end point is never worse than shooting earlier, and it bursts every balloon that has already started; so sort by end and shoot only when you must.',
      approach: [
        'Sort the balloons by end.',
        'Shoot the first arrow at the first balloon\'s end.',
        'For each next balloon: if it starts after the current arrow\'s position, shoot a new arrow at its end.',
        'Count the arrows.',
      ],
      ds: ['Array of intervals', 'Sorting'], time: 'O(n log n)', space: 'O(1) besides the sort',
      traps: [
        'Ranges are closed: a balloon that starts exactly at the arrow\'s position is burst.',
        'Coordinates reach ±2³¹. In other languages a comparator that subtracts can overflow; compare directly.',
      ],
    },
    {
      id: 646, title: 'Maximum Length of Pair Chain', pattern: 'Keep the most, remove the fewest',
      summary: 'A pair [c, d] can follow a pair [a, b] if b < c. Find the longest chain, choosing pairs in any order.',
      hints: [
        'This is interval scheduling: keep as many non-overlapping pairs as possible.',
        'Sort by the second value.',
        'Keep a pair if its first value is strictly greater than the last kept second value.',
      ],
      insight: 'Because the pairs can be picked in any order, this is the classic activity-selection problem, and greedy by earliest end gives the longest chain.',
      approach: [
        'Sort pairs by their right value.',
        'Keep the first; then keep each pair whose left value is greater than the last kept right value.',
        'Return the number kept.',
      ],
      ds: ['Array of pairs', 'Sorting'], time: 'O(n log n)', space: 'O(1) besides the sort',
      traps: ['The condition is strict (b < c): touching pairs cannot follow each other.', 'A longest-increasing-subsequence DP also works in O(n²), but is not needed.'],
    },
    {
      id: 1288, title: 'Remove Covered Intervals', pattern: 'Keep the most, remove the fewest',
      summary: 'Remove every interval that lies inside another interval of the list, and return how many intervals remain.',
      hints: [
        'Sort by start. When two starts are equal, which interval should come first?',
        'Put the longer one first (end descending), so a covered interval always comes after the interval that covers it.',
        'Track the largest end so far: an interval is covered if its end does not go beyond it.',
      ],
      insight: 'Sorted by start ascending and end descending, an interval is covered exactly when some earlier interval reaches at least as far, so a running maximum of ends decides every case.',
      approach: [
        'Sort by start ascending, and by end descending for equal starts.',
        'maxEnd = −infinity; remaining = 0.',
        'For each interval: if its end > maxEnd, it is not covered: count it and update maxEnd.',
        'Return remaining.',
      ],
      ds: ['Array of intervals', 'Sorting'], time: 'O(n log n)', space: 'O(1) besides the sort',
      traps: ['Without the end-descending tie-break, [1, 2] placed before [1, 4] would wrongly count as not covered.'],
    },

    // ---------- Rooms and groups ----------
    {
      id: 252, title: 'Meeting Rooms', pattern: 'Rooms and groups',
      summary: 'Decide whether one person can attend every meeting in a list of time intervals.',
      hints: ['Sort the meetings by start time.', 'If any meeting starts before the previous one ends, there is a clash.'],
      insight: 'After sorting by start, the first clash, if any, is always between neighbours, so compare each meeting\'s start with the previous meeting\'s end.',
      approach: ['Sort by start.', 'For each meeting after the first, if it starts before the previous meeting ends, the answer is false.', 'Otherwise the answer is true.'],
      ds: ['Array of intervals', 'Sorting'], time: 'O(n log n)', space: 'O(1) besides the sort',
      traps: ['A meeting that ends at 10 and another that starts at 10 do not clash.'],
    },
    {
      id: 253, title: 'Meeting Rooms II', pattern: 'Rooms and groups',
      summary: 'Find the minimum number of meeting rooms needed to hold all meetings.',
      hints: [
        'A room can be reused once its meeting ends.',
        'Go through meetings by start time and keep the end times of rooms in use in a min-heap.',
        'Or sweep: +1 at each start, −1 at each end, ends first when times are equal. The peak is the answer.',
      ],
      insight: 'The answer is the largest number of meetings running at the same moment; a min-heap of end times (reuse the room that frees up first) or a sorted sweep of start and end events finds it.',
      approach: [
        'Sort meetings by start.',
        'For each meeting: if the earliest-ending room (the top of a min-heap of end times) has ended by this meeting\'s start, pop it.',
        'Push this meeting\'s end time.',
        'The heap size at the end is the answer.',
      ],
      ds: ['Min-heap', 'Sorting'], time: 'O(n log n)', space: 'O(n)',
      traps: [
        'Free problem with the same idea: Divide Intervals Into Minimum Number of Groups.',
        'TypeScript has no built-in heap. Sorting the starts and the ends into two separate arrays and sweeping them with two pointers avoids needing one.',
      ],
    },
    {
      id: 2406, title: 'Divide Intervals Into Minimum Number of Groups', pattern: 'Rooms and groups', core: true,
      summary: 'Split inclusive intervals into the fewest groups so that no two intervals in the same group share a point.',
      hints: [
        'This is Meeting Rooms II with inclusive ends.',
        'The answer is the largest number of intervals covering one single point.',
        'Sort by start and keep a min-heap of group end times; reuse a group only if its end is strictly before the new start.',
      ],
      insight: 'The minimum number of groups equals the maximum overlap at any point. Greedily reuse the group that ended earliest, provided it ended strictly before the new interval starts.',
      approach: [
        'Sort intervals by start.',
        'For each interval: if the smallest end in the min-heap is less than its start, pop it (that group is reused).',
        'Push the interval\'s end.',
        'Return the heap size.',
      ],
      ds: ['Min-heap', 'Sorting'], time: 'O(n log n)', space: 'O(n)',
      traps: [
        'Ends are inclusive: [1, 5] and [5, 8] clash, so reuse needs end < start, not ≤.',
        'A sweep with +1 at each left end and −1 at each right end + 1 finds the same peak.',
      ],
    },
    {
      id: 1353, title: 'Maximum Number of Events That Can Be Attended', pattern: 'Rooms and groups',
      summary: 'Each event can be attended on any one day within its range, and only one event per day. Maximise the number of events attended.',
      hints: [
        'Go day by day.',
        'On each day, among the events that have started and not ended, which one should you attend?',
        'The one that ends soonest: keep the end days of available events in a min-heap.',
      ],
      insight: 'Each day, attend the available event with the earliest end day; events that end later can still wait, and expired events are thrown out of the heap.',
      approach: [
        'Sort events by start day.',
        'For each day d from the first start day to the last end day: push the end days of events that start on d into a min-heap.',
        'Pop end days smaller than d (those events have expired).',
        'If the heap is not empty, pop one event and count it as attended.',
      ],
      ds: ['Min-heap', 'Sorting'], time: 'O(n log n + D), D = the last day', space: 'O(n)',
      traps: ['Choosing the event that started earliest fails; the earliest end is the safe choice.', 'When the heap is empty, you can jump straight to the next start day.'],
    },
    {
      id: 2402, title: 'Meeting Rooms III', pattern: 'Rooms and groups',
      summary: 'Rooms 0 to n − 1 take meetings in order of start time: each meeting gets the lowest-numbered free room, or, if none is free, waits for the room that frees up first and keeps its length. Return the room that held the most meetings.',
      hints: [
        'Simulate meetings in order of start time.',
        'Keep free rooms in a min-heap by number, and busy rooms in a min-heap by (end time, room number).',
        'Before each meeting, move every room that has finished by its start back into the free heap.',
      ],
      insight: 'Two heaps make the simulation exact: free rooms ordered by number, busy rooms ordered by end time and then number. A delayed meeting starts when the earliest busy room frees up.',
      approach: [
        'Sort meetings by start.',
        'For each meeting: release every busy room whose end ≤ the meeting\'s start into the free heap.',
        'If a room is free, take the lowest number and mark it busy until the meeting ends.',
        'Otherwise pop the busy room with the earliest end (lowest number on ties) and book it until that end plus the meeting\'s length.',
        'Count meetings per room and return the room with the most, the lowest number on ties.',
      ],
      ds: ['Two min-heaps', 'Sorting', 'Count array'], time: 'O(m log n) for m meetings', space: 'O(n)',
      traps: [
        'Delays push end times beyond the input range. TypeScript numbers are fine; other languages need 64-bit integers.',
        'Release all finished rooms first, and only then pick the lowest-numbered one.',
      ],
    },

    // ---------- Weighted intervals ----------
    {
      id: 2054, title: 'Two Best Non-Overlapping Events', pattern: 'Weighted intervals',
      summary: 'Choose at most two non-overlapping events (start and end times are inclusive) to maximise the sum of their values.',
      hints: [
        'Sort the events by start time.',
        'Precompute, for each position, the best single value from that position to the end.',
        'For each event, binary search the first event that starts after it ends, and add the best value from there.',
      ],
      insight: 'With events sorted by start and a suffix maximum of values, each event\'s best partner is found by one binary search for the first start greater than its end.',
      approach: [
        'Sort events by start.',
        'Build suffixBest[i] = the largest value among events i to the end.',
        'For each event, binary search the first index whose start is greater than this event\'s end.',
        'The answer is the largest value + suffixBest[that index], counting 0 when there is no such index.',
      ],
      ds: ['Array', 'Sorting', 'Suffix maximum', 'Binary search'], time: 'O(n log n)', space: 'O(n)',
      traps: ['Times are inclusive, so the second event must start at end + 1 or later: search for start > end.', 'Attending a single event must also be considered.'],
    },
    {
      id: 1235, title: 'Maximum Profit in Job Scheduling', pattern: 'Weighted intervals', core: true,
      summary: 'Each job has a start time, an end time and a profit. Choose jobs that do not overlap (a job may start exactly when another ends) to maximise the total profit.',
      hints: [
        'Greedy by end time fails when profits differ.',
        'Sort jobs by end time. For job i, either skip it, or take it plus the best total among jobs that end by its start.',
        'Find that last compatible job by binary search on the end times.',
      ],
      insight: 'Weighted interval scheduling: with jobs sorted by end, best(i) = max(best(i − 1), profit(i) + best(last job ending at or before job i\'s start)), and binary search finds that last job.',
      approach: [
        'Sort jobs by end time. best[0] = 0 means "no jobs".',
        'For each job i in order, binary search how many jobs end at or before this job\'s start; call it c.',
        'best[i] = the larger of best[i − 1] (skip the job) and profit + best[c] (take it).',
        'Return best for all jobs.',
      ],
      ds: ['Array', 'Sorting', 'DP table', 'Binary search'], time: 'O(n log n)', space: 'O(n)',
      traps: ['An end equal to the next start is compatible: search with ≤.', 'Times reach 10⁹, so index the DP by job, never by time.'],
    },
    {
      id: 1751, title: 'Maximum Number of Events That Can Be Attended II', pattern: 'Weighted intervals',
      summary: 'Attend at most k non-overlapping events (inclusive days) to maximise the total value.',
      hints: [
        'This is Maximum Profit in Job Scheduling with an extra limit k.',
        'State: (position in start order, events still allowed).',
        'For each event, binary search the next event that starts after it ends.',
      ],
      insight: 'Add the number of remaining picks to the weighted-interval DP: dp[i][j] = max(dp[i + 1][j], value[i] + dp[next(i)][j − 1]), where next(i) comes from a binary search.',
      approach: [
        'Sort events by start and precompute next[i], the first event that starts after event i ends.',
        'Fill dp from the last event backwards: for j from 1 to k, take the larger of skipping (dp[i + 1][j]) and attending (value + dp[next[i]][j − 1]).',
        'dp[0][k] is the answer.',
      ],
      ds: ['Array', 'Sorting', 'DP table', 'Binary search'], time: 'O(n · k + n log n)', space: 'O(n · k)',
      traps: ['k × n ≤ 10⁶, so an n × k table fits in memory.', 'Days are inclusive: the next event must start strictly after the end day.'],
    },

    // ---------- Search among intervals ----------
    {
      id: 436, title: 'Find Right Interval', pattern: 'Search among intervals',
      summary: 'For each interval, find the interval with the smallest start that is at least its end, and return that interval\'s index (or −1 if none).',
      hints: ['The starts are unique: sort them together with their original indices.', 'For each interval, binary search the first start ≥ its end.'],
      insight: 'Sorting the starts once lets each interval find its "right interval" with a single lower-bound binary search.',
      approach: [
        'Make a list of (start, index) pairs and sort it by start.',
        'For each interval, binary search the first start that is ≥ its end.',
        'Record that start\'s original index, or −1 if there is none.',
      ],
      ds: ['Array of pairs', 'Sorting', 'Binary search'], time: 'O(n log n)', space: 'O(n)',
      traps: ['An interval can be its own right interval when its start equals its end.'],
    },
  ],
};
