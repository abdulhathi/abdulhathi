import type { Topic } from './types';

export const topic: Topic = {
  id: 'complexity',
  patterns: [
    { name: 'Count the loops', idea: 'Nested loops over the input multiply. Replacing an inner loop with a lookup or a running value removes a whole factor of n.' },
    { name: 'Halving', idea: 'When every step throws away half of what is left, the number of steps is about log₂ n.' },
    { name: 'Recursion trees', idea: 'Draw the calls as a tree. The total work is the number of calls times the work done in each one.' },
    { name: 'Amortized cost', idea: 'An occasional expensive step is fine when many cheap steps pay for it. Average over the whole sequence of operations, not one call.' },
    { name: 'Read the limits', idea: 'The input size, and any time bound in the statement, tell you which complexity the intended solution has before you write anything.' },
  ],
  signals: [
    { see: 'n ≤ 10 or 11', think: 'O(n!) is fine: try every ordering', why: '10! is about 3.6 million, which runs in well under a second.' },
    { see: 'n ≤ 20 (sometimes up to 25)', think: 'O(2ⁿ) or O(2ⁿ · n): try every subset', why: '2²⁰ is about one million subsets.' },
    { see: 'n ≤ 500', think: 'O(n³) is acceptable', why: '500³ is 1.25 × 10⁸ simple steps, near the limit but usually accepted.' },
    { see: 'n ≤ 2,000 to 5,000', think: 'O(n²): every pair, or a 2D table', why: '5,000² is 2.5 × 10⁷ steps.' },
    { see: 'n up to 10⁵ or 10⁶', think: 'O(n log n) or O(n): sort, one pass, hash map, heap, two pointers', why: 'n² would be 10¹⁰ or more, far beyond the roughly 10⁸ simple steps a judge allows per second.' },
    { see: 'n up to 10⁹ or 10¹⁸, or the input is a single number', think: 'O(log n) or O(1): binary search, math, fast power', why: 'You cannot even count up to n in time.' },
    { see: 'The statement says "must run in O(n)" or "O(1) extra space"', think: 'Sorting or an extra array is ruled out', why: 'A stated bound is a strong hint about the intended technique.' },
    { see: 'Follow-up: "can you do better than O(n²)?"', think: 'A hash map, sort, or two-pointer idea exists', why: 'The brute force is accepted, but it is not the lesson.' },
  ],
  problems: [
    // ---------- Count the loops ----------
    {
      id: 1, title: 'Two Sum', pattern: 'Count the loops', core: true,
      summary: 'Return the indices of the two numbers in an array that add up to a target. Exactly one pair works, and you may not use the same element twice.',
      hints: [
        'Checking every pair is O(n²). With up to 10⁴ values it even passes, but the follow-up asks for something faster.',
        'For each number x, the partner you need is target − x. Which structure answers "have I seen this value?" instantly?',
        'Walk the array once, checking a hash map for the partner before storing the current value with its index.',
      ],
      insight: 'Turn the inner loop into a hash map lookup. For each value, ask whether its complement has already been seen: n² pair checks become n constant-time lookups.',
      approach: [
        'Create an empty map from value to index.',
        'For each index i, compute need = target − nums[i].',
        'If need is in the map, return its index together with i.',
        'Otherwise store nums[i] → i and move on.',
      ],
      ds: ['Array', 'Hash map (Map)'], time: 'O(n)', space: 'O(n)',
      traps: [
        'Look for the complement before storing the current value, so a value cannot pair with itself.',
        'Sorting plus two pointers also works in O(n log n), but sorting loses the original indices unless you carry them along.',
      ],
    },
    {
      id: 217, title: 'Contains Duplicate', pattern: 'Count the loops',
      summary: 'Report whether any value appears at least twice in an array.',
      hints: [
        'Comparing every pair is O(n²). With 10⁵ values that is about 5 × 10⁹ comparisons.',
        'After sorting, equal values sit next to each other.',
        'Or remember every value you have seen in a set.',
      ],
      insight: 'One question, three costs: all pairs is O(n²); sorting then comparing neighbours is O(n log n) with little extra memory; a hash set is O(n) time with O(n) memory. Choosing is a trade between time and space.',
      approach: [
        'Create an empty set.',
        'For each value: if it is already in the set, return true; otherwise add it.',
        'If the loop finishes, return false.',
      ],
      ds: ['Hash set (Set)'], time: 'O(n)', space: 'O(n)',
      traps: [
        'Comparing the size of a Set built from the array with the array length is a neat shortcut, but it always processes everything; the loop can stop at the first repeat.',
        'Sorting rearranges the input. Here that is fine; in other problems you may need the original order.',
      ],
    },
    {
      id: 121, title: 'Best Time to Buy and Sell Stock', pattern: 'Count the loops', core: true,
      summary: 'Given a price for each day, find the largest profit from buying on one day and selling on a later day. If no profit is possible, the answer is 0.',
      hints: [
        'Trying every buy day with every later sell day is O(n²).',
        'Fix the sell day. Which buy day is best for it?',
        'Carry the lowest price seen so far as you walk forward.',
      ],
      insight: 'The best buy for any sell day is the cheapest price before it, and that minimum can travel along in a single variable. The inner loop disappears.',
      approach: [
        'Set minPrice to the first price and best to 0.',
        'For each later price, update best with price − minPrice if that is larger.',
        'Then update minPrice if this price is lower.',
        'Return best.',
      ],
      ds: ['Array', 'Two running values'], time: 'O(n)', space: 'O(1)',
      traps: [
        'Compute the profit before lowering the minimum, so a day is never both the buy and the sell day in variants where that matters.',
        'If prices only fall, return 0, never a negative profit.',
      ],
    },

    // ---------- Halving ----------
    {
      id: 704, title: 'Binary Search', pattern: 'Halving', core: true,
      summary: 'Find the index of a target in a sorted array of distinct values, or return −1, in O(log n) time.',
      hints: [
        'Look at the middle element first.',
        'One comparison tells you which half cannot contain the target.',
        'Keep lo and hi as the range of positions still possible, and stop when that range is empty.',
      ],
      insight: 'Each comparison halves the range of positions that could hold the target, so about log₂ n + 1 comparisons are enough: 14 for ten thousand values.',
      approach: [
        'Set lo to 0 and hi to the last index.',
        'While lo ≤ hi, let mid be the middle index (rounded down).',
        'If nums[mid] is the target, return mid.',
        'If nums[mid] is smaller, set lo to mid + 1; otherwise set hi to mid − 1.',
        'If the loop ends, return −1.',
      ],
      ds: ['Sorted array', 'Two indices'], time: 'O(log n)', space: 'O(1)',
      traps: [
        'Loop while lo ≤ hi, or a range of one element is never checked.',
        'Always move past mid (mid + 1 or mid − 1), or the loop can run forever.',
      ],
    },
    {
      id: 278, title: 'First Bad Version', pattern: 'Halving',
      summary: 'Versions 1 to n are good up to some point and bad from then on. Using a provided check that says whether a version is bad, find the first bad version with as few checks as possible.',
      hints: [
        'The answers look like good, good, ..., good, bad, bad: there is exactly one switch.',
        'n can be 2³¹ − 1, so checking versions one by one could take two billion calls.',
        'Binary search for the first version where the check says bad.',
      ],
      insight: 'A yes/no property that flips exactly once across a range can be binary searched: about 31 checks instead of up to two billion.',
      approach: [
        'Set lo to 1 and hi to n.',
        'While lo < hi, let mid be the middle of the range.',
        'If mid is bad, the first bad version is mid or earlier: set hi to mid. Otherwise it comes after mid: set lo to mid + 1.',
        'When lo equals hi, that version is the answer.',
      ],
      ds: ['Two integers'], time: 'O(log n)', space: 'O(1)',
      traps: [
        'In languages with 32-bit integers, lo + hi overflows; lo + (hi − lo) / 2 avoids it. TypeScript numbers are safe at this size, but the habit is worth having.',
        'This version keeps hi at mid, not mid − 1, because mid itself may be the first bad one.',
      ],
    },

    // ---------- Recursion trees ----------
    {
      id: 509, title: 'Fibonacci Number', pattern: 'Recursion trees',
      summary: 'Compute the n-th Fibonacci number, where the sequence starts 0, 1 and every later number is the sum of the two before it.',
      hints: [
        'The recursive definition can be coded directly. Draw its call tree for n = 5.',
        'How many times is the same smaller value worked out again?',
        'Keep only the last two values and walk upwards from the start.',
      ],
      insight: 'The direct recursion branches twice per call and keeps recomputing the same values, so its call tree grows exponentially. Building upwards from 0 and 1 needs only n steps.',
      approach: [
        'If n is 0 or 1, return n.',
        'Keep two values a = 0 and b = 1.',
        'Repeat n − 1 times: the next value is a + b; then a takes b\'s value and b takes the next value.',
        'Return b.',
      ],
      ds: ['Two variables'], time: 'O(n)', space: 'O(1)',
      traps: [
        'The naive recursion takes about 1.6ⁿ calls. With n ≤ 30 it passes, but it is the classic example of wasted work.',
        'Remembering each result in a table (memoization) also brings the recursion down to O(n).',
      ],
    },
    {
      id: 70, title: 'Climbing Stairs', pattern: 'Recursion trees',
      summary: 'Count the different ways to climb a staircase of n steps when each move climbs either 1 or 2 steps.',
      hints: [
        'Your final move was either a 1-step or a 2-step.',
        'So ways(n) = ways(n − 1) + ways(n − 2). Where have you seen that rule before?',
        'The recursion tree repeats work exactly like Fibonacci. Build the answer upwards instead.',
      ],
      insight: 'The count follows the Fibonacci rule, so the same lesson applies: a recursion that branches in two and recomputes is exponential, while carrying two values forward is linear.',
      approach: [
        'There is 1 way to climb 1 step and 2 ways to climb 2 steps.',
        'For each height from 3 to n, the number of ways is the sum of the previous two counts.',
        'Keep only the last two counts and return the final one.',
      ],
      ds: ['Two variables'], time: 'O(n)', space: 'O(1)',
      traps: [
        'n can be 45: the naive recursion then makes over a billion calls and times out.',
        'Handle n = 1 and n = 2 before the loop.',
      ],
    },

    // ---------- Amortized cost ----------
    {
      id: 232, title: 'Implement Queue using Stacks', pattern: 'Amortized cost', core: true,
      summary: 'Build a first-in, first-out queue that supports push, pop, peek and empty, using only two stacks.',
      hints: [
        'Pouring one stack into another reverses the order of its items.',
        'Use one stack for values coming in and another for values going out.',
        'Pour only when the outgoing stack is empty.',
      ],
      insight: 'Every value is pushed onto the in-stack once, moved to the out-stack once and popped once. A single pop can cost O(n), but any sequence of n operations costs O(n) in total: amortized O(1) per operation.',
      approach: [
        'push: put the value on top of the in-stack.',
        'pop or peek: if the out-stack is empty, move every value from the in-stack onto the out-stack, which reverses them so the oldest is on top.',
        'Then pop or read the top of the out-stack.',
        'empty: the queue is empty when both stacks are.',
      ],
      ds: ['Two stacks (arrays with push and pop)'], time: 'O(1) amortized per operation', space: 'O(n)',
      traps: [
        'Pouring on every pop, even when the out-stack still holds values, mixes up the order.',
        'In TypeScript an array with push and pop is a stack. Avoid shift, which moves every element and costs O(n).',
      ],
    },
    {
      id: 225, title: 'Implement Stack using Queues', pattern: 'Amortized cost',
      summary: 'Build a last-in, first-out stack that supports push, pop, top and empty, using only queue operations.',
      hints: [
        'A queue hands you its oldest value; a stack must hand you its newest.',
        'After adding a value, rotate the queue so the new value comes out first.',
        'Rotating means taking a value from the front and adding it to the back, once for every older value.',
      ],
      insight: 'Pay when pushing: after adding a value, cycle every older value behind it, so the front is always the newest. Push is O(n) and pop is O(1), and unlike problem 232 the cost does not average out.',
      approach: [
        'push x: add x to the back, then move the front value to the back size − 1 times.',
        'pop: remove the front value.',
        'top: read the front value.',
        'empty: the queue has no values.',
      ],
      ds: ['One queue'], time: 'O(n) push, O(1) pop and top', space: 'O(n)',
      traps: [
        'Compare with problem 232: there each value moves once, so the cost averages out; here every push really costs O(n).',
        'A TypeScript array used as a queue with shift costs O(n) per removal. With at most 100 calls it does not matter, but know why.',
      ],
    },

    // ---------- Read the limits ----------
    {
      id: 1512, title: 'Number of Good Pairs', pattern: 'Read the limits',
      summary: 'Count the pairs of positions i < j that hold equal values.',
      hints: [
        'The array has at most 100 values. How many pairs is that?',
        'About 5,000 pairs: the double loop is completely fine for these limits.',
        'The scalable version counts how many times each value has appeared before.',
      ],
      insight: 'Read the limits first: with n ≤ 100, O(n²) is accepted. The one-pass version adds, for each value, how many equal values came before it, because each of those forms one good pair with it.',
      approach: [
        'Keep a count for each value, starting at zero.',
        'For each value in order, add its current count to the answer.',
        'Then increase its count by one.',
        'Return the answer.',
      ],
      ds: ['Count array or Map'], time: 'O(n)', space: 'O(n), or O(1) for values up to 100',
      traps: ['Count each pair once (i < j), not twice.'],
    },
    {
      id: 128, title: 'Longest Consecutive Sequence', pattern: 'Read the limits', core: true,
      summary: 'Find the length of the longest run of consecutive integers that can be formed from the values of an unsorted array. The statement demands O(n) time.',
      hints: [
        'Sorting makes it easy, but sorting is O(n log n) and the statement asks for O(n).',
        'Put every value in a set so "is x + 1 present?" takes O(1).',
        'Only start counting from a value whose predecessor x − 1 is missing.',
      ],
      insight: 'Counting only from the start of each run means every value is visited at most twice overall, so a loop inside a loop is still O(n) in total. The inner work is amortized across the whole outer loop.',
      approach: [
        'Put all values in a set.',
        'For each value x in the set: if x − 1 is also in the set, skip x, because it is not the start of a run.',
        'Otherwise count upwards through x + 1, x + 2 and so on while they are in the set.',
        'Keep the longest count and return it.',
      ],
      ds: ['Hash set (Set)'], time: 'O(n)', space: 'O(n)',
      traps: [
        'Without the "start only at the beginning of a run" rule, an input like 1, 2, 3, ..., n makes the nested loop O(n²).',
        'Loop over the set, not the array, so repeated values are not processed twice.',
        'An empty array has answer 0.',
      ],
    },
  ],
};
