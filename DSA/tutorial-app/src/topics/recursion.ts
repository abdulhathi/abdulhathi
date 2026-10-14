import type { Topic } from './types';

export const topic: Topic = {
  id: 'recursion',
  patterns: [
    { name: 'Shrink by one', idea: 'Solve the problem for the rest of the input, then fix up the answer using the current element. The natural shape on linked lists.' },
    { name: 'Split in half', idea: 'Solve one half-size problem and reuse its answer, so the recursion is log n deep instead of n.' },
    { name: 'Self-similar sequences', idea: 'Row n is built from row n − 1, so a position in a huge row maps back to a position in a smaller one. You never build the row.' },
    { name: 'Nested structure', idea: 'Brackets inside brackets: one call handles everything inside a pair and hands back where it stopped.' },
    { name: 'Try every split', idea: 'Split the input at every possible point, solve both sides recursively, and combine every pair of results.' },
  ],
  signals: [
    { see: 'The input is defined in terms of itself: a tree, a nested list, an expression with brackets', think: 'Recursion that follows the structure', why: 'Each sub-part is a smaller copy of the same problem.' },
    { see: 'A linked list task (reverse, merge, remove) where "the rest of the list" is the same task', think: 'Recurse on head.next, then attach head', why: 'The recursive call hands you the rest already solved.' },
    { see: 'Row n (or string n) is built from row n − 1 by copying, doubling or mirroring', think: 'Map position k back to a position in the previous row', why: 'You walk down the definition instead of building something exponentially long.' },
    { see: 'A power, or a repeated operation with n up to 10⁹ or more', think: 'Halve the problem in each call', why: 'Depth log n instead of n: about 30 calls for a billion.' },
    { see: '"All possible ways" to group or build something, with small n', think: 'Split at every point and combine the sub-results; memoize repeats', why: 'Every grouping has a last operation or a root, which splits it into two independent parts.' },
    { see: 'People in a circle, every k-th one eliminated', think: 'The Josephus recurrence from n − 1 to n', why: 'After one elimination the circle is a smaller circle with its seats renumbered.' },
    { see: 'Recursion that would go 10⁵ levels deep', think: 'Rewrite it as a loop, or with your own stack', why: 'JavaScript engines overflow the call stack after roughly ten thousand nested calls.' },
  ],
  problems: [
    // ---------- Shrink by one ----------
    {
      id: 326, title: 'Power of Three', pattern: 'Shrink by one',
      summary: 'Decide whether an integer is an exact power of 3.',
      hints: [
        'What is the smallest power of 3? What does that say about 0 and negative numbers?',
        'If n is divisible by 3, then n is a power of 3 exactly when n / 3 is.',
        'The base cases: n = 1 is a power of 3 (3⁰), and a number not divisible by 3 is not.',
      ],
      insight: 'A power of 3 divided by 3 is a smaller power of 3, so each call removes one factor of 3 until you reach 1 or hit a remainder.',
      approach: [
        'If n is less than 1, return false.',
        'If n is 1, return true.',
        'If n is not divisible by 3, return false.',
        'Otherwise return the answer for n / 3.',
      ],
      ds: ['Integer'], time: 'O(log n)', space: 'O(log n) as a recursion, O(1) as a loop',
      traps: [
        'Without the n < 1 check, 0 recurses forever, because 0 is divisible by 3.',
        'The follow-up without loops: 3¹⁹ = 1,162,261,467 is the largest power of 3 that fits in 32 bits, and n is a power of 3 exactly when n > 0 and n divides it.',
      ],
    },
    {
      id: 206, title: 'Reverse Linked List', pattern: 'Shrink by one', core: true,
      summary: 'Reverse a singly linked list and return its new head.',
      hints: [
        'Trust the recursive call: assume it correctly reverses everything after the head and returns the new head.',
        'After that call, head.next is the last node of the reversed rest. Where should its next pointer go?',
        'Point head.next.next back at head, then cut head.next.',
      ],
      insight: 'Reverse the rest first, then hook the current node onto its end. The old second node is now the tail of the reversed rest, so it should point back at the current node.',
      approach: [
        'Base case: an empty list or a single node is already reversed; return it.',
        'Recursively reverse the list starting at head.next and keep the new head it returns.',
        'Set head.next.next to head, so the old second node points back.',
        'Set head.next to null, so the old head becomes the tail.',
        'Return the new head from the recursive call.',
      ],
      ds: ['Linked list', 'Call stack'], time: 'O(n)', space: 'O(n) for the call stack',
      traps: [
        'Forgetting to set head.next to null leaves a two-node loop at the end.',
        'The iterative version with three pointers (previous, current, next) uses O(1) space. The follow-up asks for both; know both.',
      ],
    },
    {
      id: 21, title: 'Merge Two Sorted Lists', pattern: 'Shrink by one', core: true,
      summary: 'Splice two sorted linked lists together into one sorted list and return its head.',
      hints: [
        'Which node must be first in the merged list?',
        'Once you pick the smaller head, the rest of the answer is the merge of what remains.',
        'Base case: if either list is empty, the answer is the other one.',
      ],
      insight: 'The smaller of the two heads is the head of the result, and its next is simply the merge of the remaining lists: one recursive call per node.',
      approach: [
        'If list1 is empty, return list2. If list2 is empty, return list1.',
        'If list1\'s head value is smaller or equal, set list1.next to the merge of list1.next and list2, and return list1.',
        'Otherwise set list2.next to the merge of list1 and list2.next, and return list2.',
      ],
      ds: ['Linked list'], time: 'O(m + n)', space: 'O(m + n) for the call stack',
      traps: [
        'The recursion is as deep as both lists together; the loop version with a dummy head uses O(1) space.',
        'Taking from list1 when the values tie keeps equal values in their original order, a good habit.',
      ],
    },
    {
      id: 203, title: 'Remove Linked List Elements', pattern: 'Shrink by one',
      summary: 'Remove every node holding a given value from a linked list and return the new head.',
      hints: [
        'The head itself might need removing, possibly several times in a row.',
        'Let the recursive call clean the rest of the list first.',
        'Then decide whether to keep the current node or skip it.',
      ],
      insight: 'Clean the rest recursively, then return either the current node (now pointing at the cleaned rest) or the cleaned rest itself. The head needs no special case.',
      approach: [
        'Base case: an empty list stays empty.',
        'Set head.next to the result of removing the value from the list starting at head.next.',
        'If head holds the value, return head.next; otherwise return head.',
      ],
      ds: ['Linked list'], time: 'O(n)', space: 'O(n) for the call stack',
      traps: ['With up to 10⁴ nodes the recursion is 10⁴ deep, near the limit in some environments. The loop version with a dummy node is the safer choice.'],
    },
    {
      id: 24, title: 'Swap Nodes in Pairs', pattern: 'Shrink by one', core: true,
      summary: 'Swap every two adjacent nodes in a linked list by relinking them (not by changing values) and return the new head.',
      hints: [
        'Look only at the first two nodes. After swapping them, what is left?',
        'The list from the third node on is the same problem.',
        'Base case: fewer than two nodes means nothing to swap.',
      ],
      insight: 'Swap the first pair and let the recursive call handle everything from the third node on. The old first node then points at whatever that call returns.',
      approach: [
        'If head or head.next is missing, return head.',
        'Let second be head.next.',
        'Set head.next to the result of swapping pairs in the list that starts at second.next.',
        'Set second.next to head and return second as the new head.',
      ],
      ds: ['Linked list'], time: 'O(n)', space: 'O(n / 2) for the call stack',
      traps: ['Make the recursive call on second.next before overwriting second.next, or the rest of the list is lost.', 'Swapping values is not allowed.'],
    },
    {
      id: 25, title: 'Reverse Nodes in k-Group', pattern: 'Shrink by one',
      summary: 'Reverse the nodes of a linked list k at a time. A final group with fewer than k nodes stays as it is.',
      hints: [
        'First check that at least k nodes remain; if not, return the head unchanged.',
        'Reverse exactly the first k nodes, the same way you would reverse a whole list.',
        'The group\'s old first node is now its last; attach to it the result of solving the rest recursively.',
      ],
      insight: 'Each group is an independent smaller problem: count k nodes, reverse just those, and connect the group\'s new tail to the recursively processed remainder.',
      approach: [
        'Walk k nodes from head. If the list ends first, return head unchanged.',
        'Reverse those k nodes in place, keeping a pointer to the node just after the group.',
        'The original head is now the group\'s tail: set its next to the result of processing the node after the group.',
        'Return the group\'s new head, which was its k-th node.',
      ],
      ds: ['Linked list'], time: 'O(n)', space: 'O(n / k) for the call stack',
      traps: [
        'Count the group before reversing it, or the final short group is reversed by mistake.',
        'The follow-up asks for O(1) extra memory: do the same group by group in a loop, using a dummy head.',
      ],
    },

    // ---------- Split in half ----------
    {
      id: 50, title: 'Pow(x, n)', pattern: 'Split in half', core: true,
      summary: 'Compute x raised to an integer power n, where n may be negative and as large as about two billion in size.',
      hints: [
        'Multiplying x by itself n times is O(n): up to two billion multiplications.',
        'xⁿ equals (x^(n/2))² when n is even. What changes when n is odd?',
        'For a negative n, compute x to the power −n and take one over the result.',
      ],
      insight: 'Compute the half power once and square it, so each call halves n: about 31 calls instead of two billion multiplications.',
      approach: [
        'If n is negative, compute the answer for −n and return 1 divided by it.',
        'Base case: n = 0 gives 1.',
        'Compute half = x to the power floor(n / 2) with one recursive call.',
        'Return half × half if n is even, or half × half × x if n is odd.',
      ],
      ds: ['Numbers', 'Call stack'], time: 'O(log n)', space: 'O(log n) as a recursion, O(1) as a loop',
      traps: [
        'Making the half-power call twice instead of storing its result brings the cost back up to O(n).',
        'In 32-bit languages, negating −2³¹ overflows. TypeScript numbers handle it, but remember it when you use another language.',
      ],
    },
    {
      id: 1922, title: 'Count Good Numbers', pattern: 'Split in half',
      summary: 'Count digit strings of length n where every even position holds an even digit and every odd position holds a prime digit, modulo 10⁹ + 7. n can be as large as 10¹⁵.',
      hints: [
        'Positions are independent: an even position has 5 choices and an odd position has 4.',
        'So the answer is 5 to the power (number of even positions) times 4 to the power (number of odd positions).',
        'With n up to 10¹⁵, compute each power by repeated squaring, taking the remainder after every multiplication.',
      ],
      insight: 'The count becomes two huge powers, and fast power by halving needs only about 50 multiplications each, even for n = 10¹⁵.',
      approach: [
        'Even positions: ceil(n / 2). Odd positions: floor(n / 2).',
        'Compute 5 to the first count and 4 to the second with fast power, reducing modulo 10⁹ + 7 after each multiplication.',
        'Multiply the two results and reduce once more.',
      ],
      ds: ['Numbers (BigInt for the products)'], time: 'O(log n)', space: 'O(log n) recursive, O(1) as a loop',
      traps: [
        'Two numbers near 10⁹ multiply to about 10¹⁸, beyond the 2⁵³ a TypeScript number holds exactly. Use BigInt for the multiplications, or the answer is silently wrong.',
        'Positions start at 0, so position 0 is even.',
      ],
    },

    // ---------- Self-similar sequences ----------
    {
      id: 779, title: 'K-th Symbol in Grammar', pattern: 'Self-similar sequences', core: true,
      summary: 'Row 1 is "0", and every next row replaces each 0 with 01 and each 1 with 10. Return the k-th symbol of row n.',
      hints: [
        'Row n has 2ⁿ⁻¹ symbols, so building row 30 means half a billion characters.',
        'Symbol k of row n is produced by symbol ceil(k / 2) of row n − 1.',
        'A first child equals its parent; a second child is the parent flipped.',
      ],
      insight: 'You never need the row itself. Each symbol has one parent in the previous row, so recurse on the parent\'s position and flip the result when k is a second child.',
      approach: [
        'Base case: row 1 is a single 0.',
        'Find the parent: the answer for row n − 1 at position ceil(k / 2).',
        'If k is odd (a first child), return the parent; if k is even, return 1 minus the parent.',
      ],
      ds: ['Integers'], time: 'O(n)', space: 'O(n) for the call stack',
      traps: ['Building the rows runs out of memory long before row 30.', 'A second view of the same fact: the answer is the parity of the number of 1-bits in k − 1.'],
    },
    {
      id: 1545, title: 'Find Kth Bit in Nth Binary String', pattern: 'Self-similar sequences',
      summary: 'S1 is "0", and each next string is the previous one, then "1", then the previous one inverted and reversed. Return the k-th bit of Sn.',
      hints: [
        'Sn has length 2ⁿ − 1, and its middle character is always 1.',
        'A position in the left half holds the same bit as in S(n − 1).',
        'A position in the right half is the mirrored position in S(n − 1), inverted.',
      ],
      insight: 'The definition is a mirror around the middle, so a position in the right half maps to its mirror image in the previous string, with the bit flipped.',
      approach: [
        'Base case: S1 is 0.',
        'Let len = 2ⁿ − 1 and mid = (len + 1) / 2.',
        'If k is mid, return 1. If k is before mid, return the answer for n − 1 and k.',
        'Otherwise return the flipped answer for n − 1 at position len − k + 1.',
      ],
      ds: ['Integers'], time: 'O(n)', space: 'O(n) for the call stack',
      traps: ['Building S20 means a string of about a million characters. It passes, but the recursion is the real lesson.', 'The mirror position is len − k + 1, counting from 1.'],
    },
    {
      id: 1823, title: 'Find the Winner of the Circular Game', pattern: 'Self-similar sequences',
      summary: 'n friends sit in a circle. Counting k friends clockwise from the current one, the k-th leaves; counting restarts just after them. Return the last friend left.',
      hints: [
        'Simulating with a queue works for n ≤ 500. Can you find the winner without simulating?',
        'After the first friend leaves, the other n − 1 play the same game, with seats renumbered from just after the one who left.',
        'If w is the winner\'s 0-based seat in the game of n − 1, their seat in the game of n is (w + k) mod n.',
      ],
      insight: 'The Josephus recurrence: the winner among n people is the winner among n − 1 people shifted k seats round the circle, so you build up from a circle of one.',
      approach: [
        'The winner of a circle of 1 is seat 0.',
        'For m from 2 up to n: winner = (winner + k) mod m.',
        'Return winner + 1 to turn the 0-based seat into the friend\'s number.',
      ],
      ds: ['Integer'], time: 'O(n)', space: 'O(1)',
      traps: ['Mixing 0-based and 1-based seats is the classic bug: run the recurrence 0-based and add 1 at the end.', 'A queue simulation costs O(n · k): fine here, slower in general.'],
    },
    {
      id: 390, title: 'Elimination Game', pattern: 'Self-similar sequences',
      summary: 'Start with the numbers 1 to n. Remove every other number, alternating passes from the left and from the right, until one remains. n can be 10⁹.',
      hints: [
        'You cannot build the list. Track only the first remaining number, the gap between neighbours, and how many remain.',
        'Each pass halves the count and doubles the gap.',
        'The first number changes on every left-to-right pass, and on a right-to-left pass only when the count is odd.',
      ],
      insight: 'The survivors always form an evenly spaced sequence, so three numbers describe them: the first one, the gap and the count. Each pass updates all three in O(1), and there are about log₂ n passes.',
      approach: [
        'head = 1, gap = 1, remaining = n, and the first pass goes left to right.',
        'On each pass, if it goes left to right or remaining is odd, move head forward by gap.',
        'Halve remaining (rounding down), double the gap and flip the direction.',
        'When one number remains, return head.',
      ],
      ds: ['Integers'], time: 'O(log n)', space: 'O(1)',
      traps: ['A right-to-left pass removes the first number only when the count is odd; that condition is easy to get backwards.', 'A recursive identity exists too, but the head, gap and count version is easier to get right.'],
    },

    // ---------- Nested structure ----------
    {
      id: 394, title: 'Decode String', pattern: 'Nested structure', core: true,
      summary: 'Decode a string where k[text] means text repeated k times; the brackets can be nested.',
      hints: [
        'Brackets inside brackets: the part inside a pair is itself an encoded string.',
        'Write a recursive decoder that reads until a closing bracket, and reports what it decoded and where it stopped.',
        'When you read a number and an opening bracket, decode the inside with a recursive call, then repeat its result.',
      ],
      insight: 'The recursion mirrors the nesting: one call decodes everything up to its matching closing bracket, so a repeat count simply multiplies whatever that call returns.',
      approach: [
        'Keep one shared reading position.',
        'Decode: collect letters into a result until the input ends or a closing bracket appears.',
        'On a digit, read the whole number, skip the opening bracket, decode the inside recursively, skip the closing bracket, and append the inside repeated that many times.',
        'Return the collected result to the caller.',
      ],
      ds: ['String', 'Call stack (or an explicit stack)'], time: 'O(length of the output)', space: 'O(nesting depth) plus the output',
      traps: ['Counts can have several digits, as in 100[a].', 'An explicit stack of (count, text so far) pairs does the same job without recursion; the Stacks chapter shows it.'],
    },
    {
      id: 1106, title: 'Parsing A Boolean Expression', pattern: 'Nested structure',
      summary: 'Evaluate a boolean expression built from t, f, NOT, AND and OR, where AND and OR take any number of comma-separated arguments and expressions can nest.',
      hints: [
        'Every sub-expression is either a single letter or an operator followed by bracketed arguments.',
        'Write a recursive evaluator that reads one expression at the current position and returns its value.',
        'For an operator, evaluate arguments one by one until the closing bracket, then combine them.',
      ],
      insight: 'The grammar is recursive, so the parser is too: evaluating an operator means evaluating each bracketed argument with the same routine and combining the results.',
      approach: [
        'Keep one shared reading position.',
        'If the current character is t or f, consume it and return true or false.',
        'Otherwise remember the operator, skip it and the opening bracket, then evaluate arguments (skipping commas) until the closing bracket, and skip that too.',
        'Return NOT of the single argument, AND of all of them, or OR of all of them.',
      ],
      ds: ['String', 'Call stack (or an explicit stack)'], time: 'O(n)', space: 'O(nesting depth)',
      traps: [
        'Even when the result is already decided, keep reading the remaining arguments, or the position does not move past the closing bracket.',
        'An explicit stack also works: push characters, and at a closing bracket pop back to the operator and combine.',
      ],
    },

    // ---------- Try every split ----------
    {
      id: 241, title: 'Different Ways to Add Parentheses', pattern: 'Try every split',
      summary: 'Given an expression of numbers joined by +, − and ×, return the result of every possible way to place parentheses.',
      hints: [
        'Every grouping has one operator that is applied last.',
        'Split at each operator: compute every result for the left side and every result for the right side.',
        'Combine each left result with each right result using that operator. A plain number is the base case.',
      ],
      insight: 'Choosing which operator is applied last splits the expression into two independent sub-expressions; the full answer is every combination of their answer lists.',
      approach: [
        'If the expression is a plain number, return a list containing just that number.',
        'For each operator position, recursively get all results for the text before it and the text after it.',
        'For every pair of a left result and a right result, apply the operator and add the value to the output.',
        'Return the output. Remember results per substring so shared pieces are not recomputed.',
      ],
      ds: ['String', 'Arrays of results', 'Map for memoization'], time: 'O(4ᵐ) for m operators: exponential, like the number of groupings', space: 'O(4ᵐ) for the results',
      traps: ['Numbers can have two digits, so split only at operators, not at every character.', 'Equal results from different groupings all count; do not remove duplicates.'],
    },
    {
      id: 894, title: 'All Possible Full Binary Trees', pattern: 'Try every split',
      summary: 'List every full binary tree (each node has 0 or 2 children) that has exactly n nodes.',
      hints: [
        'A full binary tree always has an odd number of nodes, so an even n has no answers.',
        'The root takes one node; the left subtree gets i nodes and the right n − 1 − i, both odd.',
        'Build every left tree and every right tree recursively, then pair them under a new root.',
      ],
      insight: 'Every full tree is a root plus a full left tree and a full right tree, so try each odd split of the remaining nodes and combine every left option with every right option.',
      approach: [
        'If n is even, return an empty list. If n is 1, return a list with a single node.',
        'For each odd left size i from 1 to n − 2, get all full trees of size i and of size n − 1 − i.',
        'For each pair, make a new root with that left and right child, and add it to the output.',
        'Remember the list for each n, because the same sizes are requested many times.',
      ],
      ds: ['Binary tree nodes', 'Map from size to list of trees'], time: 'O(2ⁿ): the number of trees grows exponentially', space: 'O(2ⁿ) for the output',
      traps: ['Answers may share subtree objects, which saves memory, as long as nothing modifies them afterwards.', 'Forgetting the even-n case sends the recursion looking for impossible splits.'],
    },
  ],
};
