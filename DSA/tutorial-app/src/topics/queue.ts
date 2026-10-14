import type { Topic } from './types';

export const topic: Topic = {
  id: 'queue',
  patterns: [
    { name: 'Process in arrival order', idea: 'Items wait in line and are served from the front; some go back to the end of the line for another turn.' },
    { name: 'Expire old items', idea: 'New items join at the back, and items that have become too old leave from the front.' },
    { name: 'Build a queue', idea: 'Make a queue or deque out of arrays or stacks so that every operation is O(1).' },
    { name: 'Pending effects', idea: 'A queue remembers effects that started earlier and drops each one from the front once it wears off.' },
  ],
  signals: [
    { see: 'Serve or process things in the order they arrive', think: 'A queue (first in, first out)', why: 'The item that has waited longest is always the next one served.' },
    { see: 'People take turns in a line or a circle, and someone goes to the back', think: 'Rotate a queue', why: 'Taking from the front and adding at the back models a circle exactly.' },
    { see: 'Count or keep events from the last T time units, and times arrive in increasing order', think: 'A queue of timestamps', why: 'The expired events are always the oldest ones, at the front.' },
    { see: 'An action affects the next k positions and then wears off', think: 'A queue of start positions (or a difference array)', why: 'Drop an effect from the front once it is k positions old; what remains is everything still active.' },
    { see: 'Design a fixed-size buffer, or a structure with fast operations at both ends', think: 'A ring buffer or a deque', why: 'Indices taken modulo the capacity give O(1) at both ends without shifting anything.' },
    { see: 'Fewest steps or moves in an unweighted graph or grid', think: 'Breadth-first search with a queue (see the Breadth-first search chapter)', why: 'A queue visits places in order of their distance from the start.' },
    { see: 'The maximum or minimum of every window of size k', think: 'A monotonic deque (see the Monotonic queue chapter)', why: 'A deque kept in sorted order hands you the window\'s extreme in O(1).' },
  ],
  problems: [
    // ---------- Process in arrival order ----------
    {
      id: 2073, title: 'Time Needed to Buy Tickets', pattern: 'Process in arrival order',
      summary: 'People in a line each want some number of tickets. Buying one ticket takes a second and sends the buyer to the back of the line. Return when the person at position k has all their tickets.',
      hints: [
        'A queue of (person, tickets left) simulates it directly.',
        'Faster: count how many tickets everyone else buys before person k is done.',
        'People ahead of k buy at most tickets[k]; people behind k buy at most tickets[k] − 1.',
      ],
      insight: 'Person k finishes in round tickets[k]. By then everyone ahead has bought min(their tickets, tickets[k]) and everyone behind has bought min(their tickets, tickets[k] − 1).',
      approach: [
        'Simulation: keep a queue of indices; take the front person, give them one ticket, add a second, and put them at the back if they still need more. Stop when person k reaches zero.',
        'Counting: for each i up to and including k, add min(tickets[i], tickets[k]); for each i after k, add min(tickets[i], tickets[k] − 1).',
        'Return the total.',
      ],
      ds: ['Queue (simulation)', 'Counter'], time: 'O(n) by counting, O(n · max tickets) by simulation', space: 'O(1)',
      traps: ['People behind k get one turn fewer, because k leaves the line before they come round again.'],
    },
    {
      id: 1700, title: 'Number of Students Unable to Eat Lunch', pattern: 'Process in arrival order',
      summary: 'Students queue for sandwiches of two types piled on a counter. A student takes the top sandwich if it is their type; otherwise they go to the back of the queue. Return how many students never eat.',
      hints: [
        'A simulation works, but needs a rule for when to stop.',
        'The order of the queue never matters: anyone who wants the top sandwich will eventually reach the front.',
        'Count how many students want each type, and serve sandwiches from the top while someone still wants that type.',
      ],
      insight: 'Because the queue keeps rotating, the process only stops when no remaining student wants the top sandwich, so counts by type are all you need.',
      approach: ['Count the students who want each of the two types.', 'Go through the sandwiches from the top: if someone wants this type, decrease that count; otherwise stop.', 'Return the number of students left, which is the sum of both counts.'],
      ds: ['Two counters'], time: 'O(n)', space: 'O(1)',
      traps: ['A simulation must detect an endless loop: a full rotation of the queue with nobody eating.'],
    },
    {
      id: 1823, title: 'Find the Winner of the Circular Game', pattern: 'Process in arrival order', core: true,
      summary: 'n friends sit in a circle. Starting from the current friend, count k friends clockwise; the k-th leaves, and counting restarts with the next friend. Return the last friend remaining.',
      hints: [
        'A queue models the circle: moving clockwise means taking from the front and adding at the back.',
        'Move k − 1 friends from the front to the back, then remove the front friend.',
        'The follow-up wants O(n) time and O(1) space: this is the Josephus problem, which has a short recurrence.',
      ],
      insight: 'A queue turns the circle into a line that keeps rotating: k − 1 friends move to the back, then the friend at the front leaves.',
      approach: [
        'Put friends 1 to n in a queue.',
        'While more than one friend remains: move the front friend to the back k − 1 times, then remove the front friend.',
        'The remaining friend wins.',
        'For O(1) space: winner = 0; for size from 2 to n, winner = (winner + k) mod size; the answer is winner + 1.',
      ],
      ds: ['Queue'], time: 'O(n · k) with the queue, O(n) with the recurrence', space: 'O(n), or O(1) with the recurrence',
      traps: ['Friends are numbered from 1 but the recurrence counts from 0: add 1 at the end.', 'Use a head index or a real queue; Array.prototype.shift is O(n) per call.'],
    },
    {
      id: 950, title: 'Reveal Cards In Increasing Order', pattern: 'Process in arrival order',
      summary: 'You reveal the top card of a deck, then move the next card to the bottom, and repeat until no cards are left. Arrange the deck so that the revealed cards come out in increasing order.',
      hints: [
        'Run the process on positions instead of on values.',
        'Put positions 0 to n − 1 in a queue and perform the reveal steps: the order in which positions are revealed is the order the sorted values must fill.',
        'Give the smallest value to the first revealed position, the next value to the second, and so on.',
      ],
      insight: 'Simulating the reveal on positions tells you which position is revealed first, second, third, and so on; place the sorted values in those positions in that order.',
      approach: [
        'Sort the deck.',
        'Fill a queue with the positions 0 to n − 1.',
        'For each value in sorted order: take the front position and put the value there; then, if the queue is not empty, move the next front position to the back.',
        'Return the filled array.',
      ],
      ds: ['Queue of positions', 'Sorting'], time: 'O(n log n)', space: 'O(n)',
      traps: ['Simulate on positions, not values; otherwise you have to run the whole process backwards by hand.'],
    },
    {
      id: 649, title: 'Dota2 Senate', pattern: 'Process in arrival order', core: true,
      summary: 'Senators from two parties act in order, round after round. Each can permanently ban one other senator. Assuming everyone plays perfectly for their party, return which party wins.',
      hints: [
        'The best move is to ban the next opponent who would act.',
        'Keep one queue of turn positions for each party.',
        'Compare the two fronts: the earlier senator bans the other and rejoins the line at position + n, for the next round.',
      ],
      insight: 'Banning the nearest upcoming opponent is optimal. Two queues of turn positions simulate the rounds, and a survivor re-enters at position + n so it comes after everyone still waiting this round.',
      approach: [
        'Put the positions of Radiant senators in one queue and of Dire senators in another.',
        'While both queues are non-empty: take both fronts. The smaller position wins this duel and is pushed back with position + n; the other is dropped.',
        'The party whose queue still has senators wins.',
      ],
      ds: ['Two queues of positions'], time: 'O(n)', space: 'O(n)',
      traps: ['Adding n is what keeps a survivor behind everyone who still has a turn in the current round.'],
    },

    // ---------- Expire old items ----------
    {
      id: 933, title: 'Number of Recent Calls', pattern: 'Expire old items', core: true,
      summary: 'Calls arrive with strictly increasing times in milliseconds. After each call, return how many calls happened in the last 3000 milliseconds, the current one included.',
      hints: ['Times only increase, so a call that has fallen out of range never comes back.', 'Add the new time at the back, and remove times older than t − 3000 from the front.'],
      insight: 'Because times arrive in increasing order, the calls that have expired are always at the front of a queue.',
      approach: ['Keep a queue of times.', 'ping(t): add t at the back, then remove times from the front while they are less than t − 3000.', 'Return the size of the queue.'],
      ds: ['Queue'], time: 'O(1) amortised per call', space: 'O(w) for w calls inside the window',
      traps: ['The range is inclusive: a call at exactly t − 3000 still counts.', 'With a plain array, advance a head index instead of calling shift().'],
    },
    {
      id: 387, title: 'First Unique Character in a String', pattern: 'Expire old items',
      summary: 'Return the index of the first character in a string that appears exactly once, or −1 if there is none.',
      hints: [
        'Count every character first.',
        'Then scan again and return the first index whose character has a count of 1.',
        'If the characters arrived as a stream, a queue of candidates whose front is discarded once it repeats would give the answer after every character.',
      ],
      insight: 'Two passes: counts first, then the first index with a count of 1. For streaming input, a queue keeps the still-unique characters in arrival order and drops repeats from the front.',
      approach: ['Count each letter in an array of 26 counters (or a Map).', 'Scan the string again and return the first index whose letter has a count of 1.', 'Return −1 if no such index exists.'],
      ds: ['Frequency array', 'Queue (streaming version)'], time: 'O(n)', space: 'O(1), only 26 letters',
      traps: ['Return the index, not the character.'],
    },
    {
      id: 2526, title: 'Find Consecutive Integers from a Data Stream', pattern: 'Expire old items',
      summary: 'Numbers arrive one at a time. After each one, report whether the last k numbers were all equal to a given value.',
      hints: ['A queue of the last k numbers works, but it can hold 10⁵ items and you would still need to check them.', 'All you really need is the length of the current run of the given value.'],
      insight: 'The last k numbers all equal the value exactly when the current run of that value is at least k long, so one counter replaces the whole window.',
      approach: ['streak = 0.', 'consec(num): if num equals the value, add 1 to streak; otherwise reset streak to 0.', 'Return whether streak is at least k.'],
      ds: ['Counter (instead of a queue of size k)'], time: 'O(1) per call', space: 'O(1)',
      traps: ['Before k numbers have arrived the answer must be false; the counter handles that automatically.'],
    },

    // ---------- Build a queue ----------
    {
      id: 232, title: 'Implement Queue using Stacks', pattern: 'Build a queue', core: true,
      summary: 'Build a first-in-first-out queue using only stack operations, with every operation O(1) amortised.',
      hints: ['One stack receives new elements. Pouring it into a second stack reverses it, which puts the oldest element on top.', 'Only pour from the input stack into the output stack when the output stack is empty.'],
      insight: 'Two stacks reverse the order twice. Pushes go onto an in stack, and the out stack is refilled only when it is empty, so each element moves at most once and every operation is O(1) amortised.',
      approach: [
        'push(x): push onto the in stack.',
        'pop() and peek(): if the out stack is empty, pop everything off the in stack and push it onto the out stack. Then pop or read the top of the out stack.',
        'empty(): both stacks are empty.',
      ],
      ds: ['Two stacks'], time: 'O(1) amortised per operation', space: 'O(n)',
      traps: ['Pouring into the out stack while it still holds elements puts newer elements above older ones and breaks the order.'],
    },
    {
      id: 622, title: 'Design Circular Queue', pattern: 'Build a queue', core: true,
      summary: 'Implement a fixed-capacity first-in-first-out queue (a ring buffer) with enqueue, dequeue, front, rear, isEmpty and isFull, without a built-in queue.',
      hints: ['Use an array of size k, a head index and a count.', 'The next free slot is (head + count) mod k.', 'Moving the head forward is (head + 1) mod k; nothing is ever shifted.'],
      insight: 'Keeping head and count separately makes indices wrap with modulo, and empty versus full is never ambiguous.',
      approach: [
        'Array of size k, head = 0, count = 0.',
        'enQueue: if full return false; otherwise write at (head + count) mod k and add 1 to count.',
        'deQueue: if empty return false; otherwise head = (head + 1) mod k and subtract 1 from count.',
        'Front reads array[head]; Rear reads array[(head + count − 1) mod k]; both return −1 when empty.',
      ],
      ds: ['Fixed-size array', 'Head index and count'], time: 'O(1) per operation', space: 'O(k)',
      traps: ['With only a head and a tail index, "empty" and "full" look the same unless you keep a count or leave one slot unused.'],
    },
    {
      id: 641, title: 'Design Circular Deque', pattern: 'Build a queue',
      summary: 'Implement a fixed-capacity double-ended queue that can insert and delete at both the front and the back.',
      hints: ['Extend the circular queue: now the front can also move backwards.', 'Moving the head back one step is (head − 1 + k) mod k.'],
      insight: 'The same ring buffer works at both ends: the front moves with (head ± 1) mod k, and the back is always at (head + count − 1) mod k.',
      approach: [
        'Array of size k, head = 0, count = 0.',
        'insertFront: head = (head − 1 + k) mod k, write there, add 1 to count. insertLast: write at (head + count) mod k, add 1 to count.',
        'deleteFront: head = (head + 1) mod k, subtract 1 from count. deleteLast: subtract 1 from count.',
        'Check full or empty first; getFront and getRear read the two ends and return −1 when empty.',
      ],
      ds: ['Fixed-size array', 'Head index and count'], time: 'O(1) per operation', space: 'O(k)',
      traps: ['In JavaScript, −1 % k is −1, not k − 1: add k before taking the remainder.'],
    },
    {
      id: 1670, title: 'Design Front Middle Back Queue', pattern: 'Build a queue',
      summary: 'Design a queue that can push and pop at the front, in the middle and at the back. When there are two middle positions, the front one counts as the middle.',
      hints: [
        'Split the queue into a front half and a back half.',
        'Keep them balanced: the back half holds as many elements as the front half, or one more.',
        'Then the middle is at the boundary: the end of the front half or the start of the back half.',
      ],
      insight: 'Two deques hold the two halves. Rebalancing after every operation keeps the middle at the boundary, where it can be reached in O(1).',
      approach: [
        'Keep deque A (front half) and deque B (back half), with B the same size as A or one larger.',
        'pushFront adds to the front of A; pushBack adds to the back of B; popFront takes from A (or from B if A is empty); popBack takes from B.',
        'pushMiddle: if the halves are equal, add to the front of B; otherwise add to the back of A. popMiddle: if the halves are equal, take from the back of A; otherwise take from the front of B.',
        'After every operation, move one element across the boundary if the size rule is broken.',
      ],
      ds: ['Two deques'], time: 'O(1) per operation with real deques', space: 'O(n)',
      traps: ['JavaScript has no built-in deque. With at most 1000 calls, plain arrays also pass, but know the O(1) design.', 'The "front middle" rule is what decides which half the middle belongs to.'],
    },

    // ---------- Pending effects ----------
    {
      id: 3191, title: 'Minimum Operations to Make Binary Array Elements Equal to One I', pattern: 'Pending effects',
      summary: 'In a binary array you may flip any three consecutive elements. Return the fewest flips that make every element 1, or −1 if that is impossible.',
      hints: ['Look at the leftmost 0. Which flips can still change it?', 'Only the flip that starts exactly there can fix it, so that flip is forced.', 'Scan left to right and flip whenever you meet a 0; a 0 in the last two positions means it is impossible.'],
      insight: 'The leftmost 0 can only be fixed by the window that starts at it, so the left-to-right greedy scan makes only forced moves and is therefore optimal.',
      approach: [
        'Scan i from left to right.',
        'If nums[i] is 0 and positions i + 1 and i + 2 exist, flip all three and count one operation.',
        'If nums[i] is 0 and there is no room for a window, return −1.',
        'Return the count.',
      ],
      ds: ['Array'], time: 'O(n)', space: 'O(1)',
      traps: ['Flipping three cells directly is fine here; for a general window size k, use the queue idea from problem 995.'],
    },
    {
      id: 995, title: 'Minimum Number of K Consecutive Bit Flips', pattern: 'Pending effects',
      summary: 'In a binary array you may flip any k consecutive elements. Return the fewest flips that make every element 1, or −1 if that is impossible.',
      hints: [
        'As with windows of three, the leftmost 0 forces a flip that starts there.',
        'Flipping k cells every time is O(n · k). Instead, track how many active flips cover the current position.',
        'Keep a queue of the positions where flips started, and drop the front once it is k or more positions behind.',
      ],
      insight: 'Whether position i is currently flipped depends only on how many flips started in the last k positions, and a queue of start positions (or a difference array) tracks that in O(1) per step.',
      approach: [
        'Keep a queue of start positions of flips that still cover the current position.',
        'At each i, remove starts from the front while they are at most i − k.',
        'The current value is nums[i] flipped once for each start in the queue, so only the parity of the queue size matters. If the current value is 0, a flip must start here: if i + k is past the end, return −1; otherwise push i and count it.',
        'Return the count.',
      ],
      ds: ['Queue of flip start positions (or a difference array)'], time: 'O(n)', space: 'O(k)',
      traps: ['Only the parity (odd or even) of active flips matters.', 'Flipping the whole window each time is O(n · k), too slow for n = 10⁵.'],
    },
  ],
};
