import type { Topic } from './types';

export const topic: Topic = {
  id: 'math',
  patterns: [
    { name: 'Digits', idea: 'Peel digits off with the remainder by 10 and divide by 10 (rounding down); rebuild a number with × 10 + digit. Watch the range as you rebuild.' },
    { name: 'Big numbers by hand', idea: 'When a number is too big for any type, keep its digits in an array or string and do school arithmetic with carries.' },
    { name: 'Modular arithmetic', idea: 'Keep only remainders: they stay small, and sums, products and powers can be reduced after every step. Fast power computes huge powers this way.' },
    { name: 'Square roots', idea: 'Binary search on the answer, or Newton\'s method, finds an integer square root without any library function.' },
    { name: 'Counting with formulas', idea: 'Replace a loop with arithmetic: Gauss sums, counting multiples, counting up to the high end minus up to the low end.' },
    { name: 'Number bases', idea: 'Converting to a base is repeated remainder and division; parsing is result × base + digit. Watch for systems with no zero digit.' },
    { name: 'Linear algebra', idea: 'Vectors and matrices: dot products, sparse storage, matrix products, and matrix powers for a linear step repeated many times.' },
  ],
  signals: [
    { see: 'Reverse, compare or extract the digits of an integer', think: 'Remainder by 10 and division by 10 in a loop', why: 'The last digit is n mod 10, and dividing by 10 removes it, with no string conversion.' },
    { see: '"Return the answer modulo 10⁹ + 7"', think: 'Reduce after every addition and multiplication; BigInt for products', why: 'The true answer is astronomically large; only its remainder is wanted, and remainders can be taken at every step.' },
    { see: 'An exponent or a repeat count up to 10⁹ or more', think: 'Fast power by squaring, or a matrix power', why: 'log₂(10⁹) is about 30 multiplications instead of a billion.' },
    { see: 'Numbers given as strings or digit arrays, with "do not convert to an integer"', think: 'School arithmetic on digit arrays with carries', why: 'The values have hundreds or thousands of digits.' },
    { see: '"Count how many in the range [low, high]"', think: 'count(high) − count(low − 1) with a formula', why: 'Counting up to a point is usually a one-line formula; a range is the difference of two.' },
    { see: 'Square root, perfect square, "largest k with f(k) ≤ n"', think: 'Binary search on the answer, or Newton\'s method', why: 'The condition is true up to a point and false after it.' },
    { see: 'A fixed linear rule applied t times to a small state, with huge t', think: 'Write the rule as a matrix and raise it to the power t', why: 'Matrix multiplication is associative, so fast power works on matrices too.' },
    { see: 'Overflow warnings: "assume 32-bit integers", answers near 2⁵³', think: 'Check bounds before multiplying; use BigInt above 2⁵³', why: 'TypeScript numbers are 64-bit floats: exact integers only up to 2⁵³ − 1, and they never overflow loudly.' },
  ],
  problems: [
    // ---------- Digits ----------
    {
      id: 9, title: 'Palindrome Number', pattern: 'Digits', core: true,
      summary: 'Decide whether an integer reads the same forwards and backwards, ideally without turning it into a string.',
      hints: [
        'A negative number is never a palindrome: the minus sign is only at the front.',
        'Reversing the whole number risks overflow in some languages. Do you need all of it reversed?',
        'Reverse only the lower half: stop once the reversed part is at least as large as what remains.',
      ],
      insight: 'Build the reversed lower half digit by digit until it catches up with the remaining upper half. The number is a palindrome when the halves are equal, or equal after dropping the middle digit.',
      approach: [
        'If x is negative, or ends in 0 without being 0, return false.',
        'reversed = 0. While x is greater than reversed: move x\'s last digit onto reversed (reversed × 10 + digit) and remove it from x.',
        'Return true if x equals reversed, or if x equals reversed with its last digit removed (odd number of digits).',
      ],
      ds: ['Integers'], time: 'O(log n), the number of digits', space: 'O(1)',
      traps: ['A number ending in 0 (other than 0) breaks the half-reversal stopping rule, so rule it out first.', 'Converting to a string works, but the follow-up asks you not to.'],
    },
    {
      id: 7, title: 'Reverse Integer', pattern: 'Digits', core: true,
      summary: 'Reverse the digits of a 32-bit signed integer. If the result is outside the 32-bit range, return 0. Pretend 64-bit numbers are not available.',
      hints: [
        'Pop the last digit with the remainder by 10, and push it onto the result with result × 10 + digit.',
        'The danger is the push: result × 10 can leave the 32-bit range.',
        'Check before pushing, by comparing result with the limit divided by 10.',
      ],
      insight: 'Reverse by popping and pushing digits, and test for overflow before each push by comparing with (limit − digit) / 10, so you never compute an out-of-range value.',
      approach: [
        'Remember the sign and work with the absolute value. result = 0.',
        'While x is not 0: digit = x mod 10, then remove it by dividing x by 10 and rounding down.',
        'If result is greater than (2³¹ − 1 − digit) / 10, the push would overflow: return 0. Otherwise result = result × 10 + digit.',
        'Apply the sign and return result.',
      ],
      ds: ['Integers'], time: 'O(log n)', space: 'O(1)',
      traps: [
        'TypeScript numbers are 64-bit floats, so nothing overflows by itself: you must check the 32-bit range yourself.',
        'In JavaScript the remainder keeps the sign of the left side (−123 mod 10 gives −3); working with the absolute value avoids surprises.',
      ],
    },
    {
      id: 66, title: 'Plus One', pattern: 'Digits',
      summary: 'A large integer is given as an array of its digits, most significant first. Add one and return the new array of digits.',
      hints: ['Start from the last digit, as you would by hand.', 'A 9 becomes 0 and passes a carry left; any other digit simply increases, and you are done.', 'If every digit was 9, the result is one digit longer.'],
      insight: 'Only the trailing 9s change, into 0s. The first digit from the right that is not 9 absorbs the carry, and an all-9s number becomes 1 followed by zeros.',
      approach: [
        'Walk from the last digit to the first.',
        'If the digit is less than 9, add one to it and return the array.',
        'Otherwise set it to 0 and continue left.',
        'If the loop finishes, put a 1 at the front (every digit was 9).',
      ],
      ds: ['Array of digits'], time: 'O(n)', space: 'O(1), or O(n) when the array grows',
      traps: ['Turning the digits into a number fails: 100 digits do not fit in a number (BigInt would, but misses the point).'],
    },
    {
      id: 258, title: 'Add Digits', pattern: 'Digits',
      summary: 'Repeatedly replace a number by the sum of its digits until one digit remains, and return that digit.',
      hints: [
        'The loop is easy. The follow-up asks for O(1) with no loop at all.',
        'What happens to a number\'s remainder modulo 9 when you replace it by the sum of its digits?',
        'It does not change, because 10 leaves remainder 1 when divided by 9.',
      ],
      insight: 'Summing the digits keeps the remainder modulo 9, so the final digit (the digital root) is 1 + (n − 1) mod 9 for n > 0, and 0 for n = 0.',
      approach: ['If n is 0, return 0.', 'Otherwise return 1 + (n − 1) mod 9.', 'This gives 9, not 0, for multiples of 9, as it should.'],
      ds: ['Integer'], time: 'O(1)', space: 'O(1)',
      traps: ['n mod 9 alone returns 0 for multiples of 9, whose digital root is 9.'],
    },

    // ---------- Big numbers by hand ----------
    {
      id: 415, title: 'Add Strings', pattern: 'Big numbers by hand',
      summary: 'Add two non-negative integers given as digit strings, without converting them to numbers, and return the sum as a string.',
      hints: ['Add as you learned at school: from the rightmost digits, with a carry.', 'Use one index at the end of each string; a string that has run out contributes 0.', 'Collect result digits in an array, then reverse and join once.'],
      insight: 'Column addition with a carry works for numbers of any length; walking both strings from the right and treating missing digits as 0 handles different lengths.',
      approach: [
        'Start i and j at the last digits, with carry = 0.',
        'While either index is in range or carry is not 0: sum = digit at i (or 0) + digit at j (or 0) + carry.',
        'Record sum mod 10, set carry to sum divided by 10 rounded down, and move both indices left.',
        'Reverse the recorded digits and join them.',
      ],
      ds: ['Strings', 'Array of digits'], time: 'O(m + n)', space: 'O(m + n)',
      traps: ['Keep going while a carry is left: 999 + 1 needs an extra digit.', 'Get each digit from its character (character code minus the code of "0"); never parse the whole string.'],
    },
    {
      id: 43, title: 'Multiply Strings', pattern: 'Big numbers by hand', core: true,
      summary: 'Multiply two non-negative integers given as digit strings, without converting them to numbers, and return the product as a string.',
      hints: [
        'The product of an m-digit and an n-digit number has at most m + n digits.',
        'Digit i of the first number times digit j of the second lands in positions i + j and i + j + 1 of the result.',
        'Accumulate into an array of m + n slots, push carries left, and drop leading zeros.',
      ],
      insight: 'Every pair of digits contributes to a fixed pair of result positions, so one array of m + n slots, filled from the right with carries, replaces the whole long-multiplication layout.',
      approach: [
        'Make a result array of m + n zeros.',
        'For i from the last digit of num1 down, and j from the last digit of num2 down: add digit × digit to slot i + j + 1.',
        'Keep slot i + j + 1 at its value mod 10 and add the carry to slot i + j.',
        'Skip leading zeros and join the rest; if nothing is left, the answer is "0".',
      ],
      ds: ['Array of digits'], time: 'O(m · n)', space: 'O(m + n)',
      traps: ['If either input is "0", return "0", not a string of zeros.', 'BigInt would do it in one step, which is exactly what the problem forbids.'],
    },

    // ---------- Modular arithmetic ----------
    {
      id: 372, title: 'Super Pow', pattern: 'Modular arithmetic',
      summary: 'Compute a to the power b, modulo 1337, where b is a huge number given as an array of its decimal digits.',
      hints: [
        'Reduce a modulo 1337 first: only remainders matter.',
        'Read b\'s digits from the left: a^(10x + d) = (a^x)¹⁰ × a^d.',
        'Keep a running result: for each digit d, result becomes result¹⁰ × a^d, all modulo 1337.',
      ],
      insight: 'Process the exponent\'s digits like reading a number left to right: raising the running result to the 10th power shifts the exponent one decimal place, then multiply in a to the new digit.',
      approach: [
        'result = 1.',
        'For each digit d of b from the left: result = (result to the 10th power) × (a to the power d), modulo 1337.',
        'Compute the small powers with fast power or a short loop, reducing modulo 1337 after every multiplication.',
        'Return result.',
      ],
      ds: ['Array of digits', 'Integers'], time: 'O(length of b)', space: 'O(1)',
      traps: ['b cannot be converted to a number: it has up to 2,000 digits.', 'Reduce a modulo 1337 before multiplying; a itself can be up to 2³¹ − 1.'],
    },
    {
      id: 2550, title: 'Count Collisions of Monkeys on a Polygon', pattern: 'Modular arithmetic',
      summary: 'A monkey sits on each corner of a polygon with n corners, and each moves to one of its two neighbouring corners at the same moment. Count the ways at least one collision happens, modulo 10⁹ + 7. n can be 10⁹.',
      hints: [
        'Count the opposite: in how many ways does nobody collide?',
        'Only two movements avoid every collision: everyone clockwise, or everyone anticlockwise.',
        'So the answer is 2ⁿ − 2, with 2ⁿ computed by fast power modulo 10⁹ + 7.',
      ],
      insight: 'Count the complement: all 2ⁿ ways minus the 2 collision-free ones. Fast power gives 2ⁿ modulo 10⁹ + 7, and the subtraction must be kept from going negative.',
      approach: [
        'Compute p = 2ⁿ modulo 10⁹ + 7 by repeated squaring.',
        'Return (p − 2 + 10⁹ + 7) modulo 10⁹ + 7.',
      ],
      ds: ['Integers (BigInt for the products)'], time: 'O(log n)', space: 'O(1)',
      traps: ['After reducing, p can be smaller than 2: add the modulus before the final remainder so the answer is never negative.', 'Products of two values near 10⁹ exceed 2⁵³; use BigInt for them.'],
    },
    {
      id: 1015, title: 'Smallest Integer Divisible by K', pattern: 'Modular arithmetic',
      summary: 'Find the length of the smallest positive number written only with the digit 1 that is divisible by k, or −1 if there is none.',
      hints: [
        'The number itself can be enormous; only its remainder modulo k matters.',
        'From one string of ones to the next, the remainder becomes (remainder × 10 + 1) mod k.',
        'There are only k possible remainders, so if 0 has not appeared within k steps, it never will.',
      ],
      insight: 'Track only the remainders of 1, 11, 111, ... modulo k. They live in a set of k values, so they must repeat within k steps (the pigeonhole principle): either 0 appears by length k or it never does.',
      approach: [
        'If k is divisible by 2 or 5, return −1: a number ending in 1 is never a multiple of 2 or 5.',
        'remainder = 0.',
        'For length from 1 to k: remainder = (remainder × 10 + 1) mod k. If it is 0, return length.',
        'Return −1.',
      ],
      ds: ['Integer'], time: 'O(k)', space: 'O(1)',
      traps: ['Never build the number: it can be about 10⁵ digits long.', 'The early exit for 2 and 5 is not required for correctness, but it explains why the answer can be −1.'],
    },

    // ---------- Square roots ----------
    {
      id: 69, title: 'Sqrt(x)', pattern: 'Square roots', core: true,
      summary: 'Return the square root of a non-negative integer, rounded down, without any built-in power or square root operation.',
      hints: [
        'The answer is the largest r with r × r ≤ x.',
        '"r × r ≤ x" is true for small r and false for large r, so binary search can find the switch.',
        'Or use Newton\'s method: replace a guess r by the average of r and x / r.',
      ],
      insight: 'Binary search for the largest r with r × r ≤ x takes about 31 steps. Newton\'s update, r becomes floor((r + floor(x / r)) / 2) starting from r = x, gets there in even fewer once it is close.',
      approach: [
        'If x is less than 2, return x.',
        'Newton: start with r = x. While r × r > x, set r to floor((r + floor(x / r)) / 2).',
        'Return r.',
        'Binary search alternative: search r between 1 and x / 2 for the last value whose square is at most x.',
      ],
      ds: ['Integers'], time: 'O(log x)', space: 'O(1)',
      traps: [
        'In 32-bit languages mid × mid overflows; compare mid with x / mid instead. In TypeScript the product is exact near the answer, and far too big to matter elsewhere.',
        'Do not use Math.sqrt or ** 0.5: the problem forbids them.',
      ],
    },
    {
      id: 367, title: 'Valid Perfect Square', pattern: 'Square roots',
      summary: 'Decide whether a positive integer is a perfect square, without any built-in square root.',
      hints: ['Find the integer square root, then check whether it squares back to the number.', 'Binary search r between 1 and the number.'],
      insight: 'num is a perfect square exactly when its integer square root r satisfies r × r = num, and r comes from binary search or Newton\'s method.',
      approach: ['Compute r, the integer square root of num, by binary search or Newton\'s method.', 'Return whether r × r equals num.'],
      ds: ['Integers'], time: 'O(log n)', space: 'O(1)',
      traps: ['Perfect squares are also sums of consecutive odd numbers (1 + 3 + 5 + ...), but subtracting them one at a time is O(√n), much slower.'],
    },

    // ---------- Counting with formulas ----------
    {
      id: 268, title: 'Missing Number', pattern: 'Counting with formulas', core: true,
      summary: 'An array holds n distinct numbers taken from 0 to n, so exactly one is missing. Find it in O(n) time with O(1) extra space.',
      hints: ['What do all the numbers from 0 to n add up to?', 'The missing number is that total minus the sum of the array.', 'XOR works too: combine every index and every value, and the pairs cancel.'],
      insight: 'The numbers 0 to n sum to n(n + 1) / 2, so subtracting the array\'s sum leaves exactly the missing number.',
      approach: ['expected = n × (n + 1) / 2.', 'Subtract every value of the array from expected.', 'What remains is the missing number.'],
      ds: ['Array'], time: 'O(n)', space: 'O(1)',
      traps: ['With 32-bit integers the sum can overflow for large n; the XOR version cannot. With n ≤ 10⁴, TypeScript is safe either way.'],
    },
    {
      id: 172, title: 'Factorial Trailing Zeroes', pattern: 'Counting with formulas', core: true,
      summary: 'Count the zeros at the end of n factorial.',
      hints: [
        'n! is far too large to compute for n = 10⁴.',
        'A trailing zero comes from a factor 10 = 2 × 5. Which of the two factors is rarer?',
        'Count factors of 5: every multiple of 5 gives one, every multiple of 25 one more, every multiple of 125 another...',
      ],
      insight: 'Each trailing zero needs a 2 and a 5, and 2s are always plentiful, so count the 5s: floor(n/5) + floor(n/25) + floor(n/125) + ...',
      approach: ['count = 0.', 'While n is at least 5: divide n by 5 (rounding down) and add the result to count.', 'Return count.'],
      ds: ['Integer'], time: 'O(log n)', space: 'O(1)',
      traps: ['Counting only multiples of 5 misses the extra factor in 25, 50, 75, 125 and so on.', 'Never compute the factorial itself.'],
    },
    {
      id: 1523, title: 'Count Odd Numbers in an Interval Range', pattern: 'Counting with formulas',
      summary: 'Count the odd numbers between low and high, inclusive.',
      hints: ['Looping up to 10⁹ is far too slow.', 'How many odd numbers are there from 1 to x?', 'That count is floor((x + 1) / 2). Subtract the count up to low − 1 from the count up to high.'],
      insight: 'A count over a range is the count up to the high end minus the count up to just below the low end, and odds up to x is floor((x + 1) / 2).',
      approach: ['Let odds(x) = floor((x + 1) / 2), the number of odd values from 1 to x.', 'Return odds(high) − odds(low − 1).'],
      ds: ['Integers'], time: 'O(1)', space: 'O(1)',
      traps: ['The range includes low, so subtract the count up to low − 1, not up to low.'],
    },
    {
      id: 441, title: 'Arranging Coins', pattern: 'Counting with formulas',
      summary: 'Build a staircase where row i needs i coins. Given n coins, return the number of complete rows.',
      hints: ['k complete rows need 1 + 2 + ... + k = k(k + 1) / 2 coins.', 'You want the largest k with k(k + 1) / 2 ≤ n.', 'Binary search on k, or solve the quadratic directly.'],
      insight: 'k rows cost the triangular number k(k + 1) / 2, so the answer is the largest k that fits under n: by binary search, or by the formula floor((√(8n + 1) − 1) / 2).',
      approach: ['Binary search k between 0 and n.', 'For each mid, compare mid × (mid + 1) / 2 with n.', 'Keep the largest mid that fits. (Or use the formula, then check it by multiplying back.)'],
      ds: ['Integers'], time: 'O(log n), or O(1) with the formula', space: 'O(1)',
      traps: ['A floating-point square root can be off by one for large n; check the formula\'s answer against the triangular number.'],
    },

    // ---------- Number bases ----------
    {
      id: 168, title: 'Excel Sheet Column Title', pattern: 'Number bases', core: true,
      summary: 'Convert a column number to its spreadsheet title: 1 is A, 26 is Z, 27 is AA, 28 is AB, and so on.',
      hints: [
        'It looks like base 26, but there is no digit for zero: Z stands for 26.',
        'Subtract 1 before taking the remainder, so A to Z correspond to 0 to 25.',
        'Then divide the reduced number by 26 and repeat, building the title from the right.',
      ],
      insight: 'Column titles are a base-26 system whose digits run from 1 to 26 instead of 0 to 25, so shift by one before each step: letter = (n − 1) mod 26, then n = floor((n − 1) / 26).',
      approach: ['While n > 0: subtract 1 from n.', 'Put the letter at position n mod 26 of the alphabet in front of the title.', 'Set n to n divided by 26, rounded down.', 'Return the title.'],
      ds: ['Integer', 'Array of characters'], time: 'O(log n)', space: 'O(log n)',
      traps: ['Plain base-26 conversion goes wrong at every multiple of 26: 26 must be Z, not A followed by a zero digit.'],
    },
    {
      id: 171, title: 'Excel Sheet Column Number', pattern: 'Number bases',
      summary: 'Convert a spreadsheet column title such as AB to its column number.',
      hints: ['Read the title left to right, like the digits of a number.', 'Each new letter multiplies the value so far by 26 and adds the letter\'s value, with A = 1 up to Z = 26.'],
      insight: 'Parsing any base is result = result × base + digit, reading from the left. Here the base is 26 and the digits are 1 to 26.',
      approach: ['result = 0.', 'For each letter from the left: result = result × 26 + its position in the alphabet (A is 1).', 'Return result.'],
      ds: ['String'], time: 'O(n)', space: 'O(1)',
      traps: ['Letters are worth 1 to 26, not 0 to 25.'],
    },

    // ---------- Linear algebra ----------
    {
      id: 640, title: 'Solve the Equation', pattern: 'Linear algebra',
      summary: 'Solve a linear equation in x written with integers, x terms, plus and minus signs and one equals sign. Report the solution, no solution, or infinitely many solutions.',
      hints: [
        'Move everything to one side and you get a·x + b = 0.',
        'Parse each side into a total x coefficient and a total constant.',
        'a = 0 and b = 0: infinitely many solutions. a = 0 and b ≠ 0: none. Otherwise x = −b / a.',
      ],
      insight: 'Any linear equation in one unknown reduces to a·x = c by collecting the coefficients of both sides (the right side with its signs flipped). The three outcomes depend only on whether a and c are zero.',
      approach: [
        'Split the equation at the equals sign.',
        'Scan each side term by term, tracking the sign. A term ending in x adds its coefficient (1 when no number is written) to that side\'s x total; any other term adds to its constant total.',
        'a = left x total − right x total, and c = right constant total − left constant total.',
        'If a is 0, report infinitely many solutions when c is 0 and no solution otherwise; else x = c / a.',
      ],
      ds: ['String', 'Integers'], time: 'O(n)', space: 'O(1)',
      traps: ['"x" alone has coefficient 1, while "0x" has coefficient 0.', 'A unique solution is guaranteed to be an integer, so the division is exact.'],
    },
    {
      id: 1570, title: 'Dot Product of Two Sparse Vectors', pattern: 'Linear algebra',
      summary: 'Design a sparse vector type that stores mostly-zero vectors efficiently and computes the dot product with another sparse vector.',
      hints: [
        'Storing every zero wastes memory and time.',
        'Keep only (index, value) pairs for the non-zero entries.',
        'Only indices that are non-zero in both vectors contribute: walk both sorted pair lists with two pointers.',
      ],
      insight: 'A dot product gets contributions only where both vectors are non-zero, so store just the non-zero (index, value) pairs and merge the two lists by index.',
      approach: [
        'On construction, record (index, value) for each non-zero entry, in index order.',
        'For the dot product, start a pointer at the beginning of each list.',
        'If the indices match, add the product of the values and advance both; otherwise advance the pointer with the smaller index.',
        'Follow-up, when only one vector is sparse: loop over the sparse one and look indices up in the other (binary search on its index list).',
      ],
      ds: ['Array of (index, value) pairs', 'Two pointers', 'or a hash map'], time: 'O(k₁ + k₂) for k non-zero entries', space: 'O(k)',
      traps: ['A Map from index to value also works, but interviewers often ask why merging sorted lists can beat hashing for large vectors.'],
    },
    {
      id: 311, title: 'Sparse Matrix Multiplication', pattern: 'Linear algebra',
      summary: 'Multiply two sparse matrices, where most entries are zero, and return the product.',
      hints: [
        'Entry (i, j) of the product is the dot product of row i of the first matrix and column j of the second.',
        'A zero in the first matrix contributes nothing to any entry of the product.',
        'Loop over the non-zero entries of the first matrix and add their contributions along a row of the second.',
      ],
      insight: 'Reorder the triple loop so the zero test comes early: for each non-zero A[i][p], add A[i][p] × B[p][j] into C[i][j] across row p of B. Every zero in A is skipped completely.',
      approach: [
        'Create an m × n result full of zeros.',
        'For each row i of A and each column p where A[i][p] is not zero:',
        'for each j where B[p][j] is not zero, add A[i][p] × B[p][j] to C[i][j].',
        'Return C.',
      ],
      ds: ['2D arrays', 'Lists of non-zero entries'], time: 'O(m · k · n) worst case, far less when sparse', space: 'O(m · n) for the result',
      traps: ['The textbook loop order (i, j, then p) checks every combination; putting p in the middle is what makes skipping zeros effective.'],
    },
    {
      id: 3337, title: 'Total Characters in String After Transformations II', pattern: 'Linear algebra',
      summary: 'In each round, every letter is replaced by the next few letters of the alphabet (how many depends on the letter, wrapping after z). Return the length of the string after t rounds, modulo 10⁹ + 7. t can be 10⁹.',
      hints: [
        'Only how many of each letter you have matters, not their order: 26 numbers.',
        'One round turns those 26 counts into 26 new counts by a fixed linear rule, which is a 26 × 26 matrix.',
        't rounds is that matrix to the power t: use fast power on matrices.',
      ],
      insight: 'A round maps a vector of 26 letter counts to a new vector by a fixed linear rule, so t rounds is the transition matrix raised to the power t, computed with O(log t) matrix multiplications.',
      approach: [
        'Build a 26 × 26 matrix M where M[to][from] says how many copies of letter "to" one letter "from" produces in a round.',
        'Raise M to the power t by repeated squaring, reducing every entry modulo 10⁹ + 7.',
        'Count the letters of s into a vector, multiply it by the matrix power, and sum the resulting counts modulo 10⁹ + 7.',
      ],
      ds: ['26 × 26 matrix', 'Count vector'], time: 'O(26³ · log t + n)', space: 'O(26²)',
      traps: ['Products of two values below 10⁹ + 7 exceed 2⁵³: use BigInt inside the matrix product, or the counts go wrong.', 'Simulating round by round costs O(26² · t), hopeless for t = 10⁹.'],
    },
  ],
};
