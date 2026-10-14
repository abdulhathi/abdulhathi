import type { Topic } from './types';

export const topic: Topic = {
  id: 'sorting',
  patterns: [
    { name: 'Sort first, then scan', idea: 'Sorting puts equal values side by side and close values next to each other, so one pass finds duplicates, gaps and the best pairings.' },
    { name: 'Sorted form as a key', idea: 'Things that are equal up to order (anagrams, letter profiles) have the same sorted form, so sort them and compare or group.' },
    { name: 'Custom comparators', idea: 'When the order you need is not plain number order, write a comparator that says which of two items goes first.' },
    { name: 'Sort it yourself', idea: 'Implement the algorithm when the problem forbids the built-in sort, or the data is a linked list.' },
  ],
  signals: [
    { see: 'Find duplicates, the closest pair, or the smallest gap between values', think: 'Sort, then compare neighbours', why: 'After sorting, equal and close values sit next to each other, so n − 1 neighbour checks replace n² pair checks.' },
    { see: 'Two lists must be matched or paired (cookies and children, people and boats)', think: 'Sort both, then greedy with two pointers', why: 'In sorted order, the best partner for the smallest item is easy to find and never hurts the others.' },
    { see: 'Items that are the same in any order count as equal (anagrams, same letters)', think: 'Use the sorted form as a key', why: 'Sorting removes the order and leaves one canonical form per group.' },
    { see: 'The output must follow a custom order or several tie-breaks', think: 'Sort with a comparator', why: 'A comparator expresses any consistent order in one place, and a stable sort keeps ties in input order.' },
    { see: 'The answer does not change if you reorder the input', think: 'You are free to sort first', why: 'If order does not matter, choose the order that makes a greedy or two-pointer idea work.' },
    { see: 'n up to 10⁵ and an O(n log n) solution would fit', think: 'Sorting is affordable', why: 'Sorting 10⁵ values takes about 1.7 million comparisons, far below the usual limit of around 10⁸ simple steps.' },
    { see: 'The problem forbids built-in sort functions', think: 'Heapsort, merge sort, or counting sort if values are small', why: 'You need an algorithm whose worst case is still O(n log n), or a linear one when values are bounded.' },
  ],
  problems: [
    // ---------- Sort first, then scan ----------
    {
      id: 217, title: 'Contains Duplicate', pattern: 'Sort first, then scan', core: true,
      summary: 'Decide whether any value appears at least twice in an array.',
      hints: [
        'If the array were sorted, where would two equal values be?',
        'After sorting you only need to compare each value with its neighbour.',
        'A Set answers it in O(n) time instead, at the cost of O(n) memory. Know both.',
      ],
      insight: 'Sorting puts equal values next to each other, so one pass comparing neighbours finds any duplicate. A Set does the same job in linear time by remembering what it has seen.',
      approach: [
        'Sort a copy of the array with a numeric comparator.',
        'Walk from index 1 to the end. If a value equals the one before it, the answer is true.',
        'If the walk finishes without a match, the answer is false.',
      ],
      ds: ['Array', 'Sorting'], time: 'O(n log n), or O(n) with a Set', space: 'O(n): the built-in sort uses a work buffer, and a Set stores the values',
      traps: [
        'Always pass a numeric comparator. The default sort compares values as strings, which happens to keep equal numbers together here but breaks most other problems.',
        'Comparing every pair is O(n²): 5 × 10⁹ checks for 10⁵ values.',
      ],
    },
    {
      id: 1200, title: 'Minimum Absolute Difference', pattern: 'Sort first, then scan',
      summary: 'Given distinct integers, list every pair whose difference equals the smallest difference between any two values, in ascending order.',
      hints: [
        'Which pairs can possibly have the smallest difference?',
        'After sorting, the closest values are always neighbours.',
        'One pass finds the smallest gap; a second pass collects the pairs with that gap.',
      ],
      insight: 'After sorting, the smallest difference always occurs between neighbours, so you compare n − 1 adjacent pairs instead of all n² pairs, and the pairs come out already in order.',
      approach: [
        'Sort ascending.',
        'First pass: the smallest value of a[i] − a[i − 1] over all i.',
        'Second pass: collect every pair [a[i − 1], a[i]] whose gap equals that smallest value.',
      ],
      ds: ['Array', 'Sorting'], time: 'O(n log n)', space: 'O(n) for the output',
      traps: ['A value between two others is always closer to one of them, which is why non-neighbours never need checking.'],
    },
    {
      id: 455, title: 'Assign Cookies', pattern: 'Sort first, then scan', core: true,
      summary: 'Each child is content with a cookie at least as big as their greed value, and each child gets at most one cookie. Maximise the number of content children.',
      hints: [
        'Sort both lists.',
        'Which child should the smallest cookie go to, if any?',
        'Walk both sorted lists with two pointers.',
      ],
      insight: 'Give each cookie, smallest first, to the least greedy child still waiting if it is big enough. A cookie too small for that child is too small for every child after, so it is useless and you skip it.',
      approach: [
        'Sort greed values and cookie sizes ascending.',
        'child = 0. For each cookie in order: if it is at least the greed of the current child, that child is content, so move to the next child.',
        'Stop when you run out of children or cookies. The child index is the answer.',
      ],
      ds: ['Array', 'Sorting', 'Two indices'], time: 'O(n log n + m log m)', space: 'O(1) besides the sorts',
      traps: ['Giving a big cookie to a child with small greed wastes it; always satisfy the smallest greed with the smallest cookie that works.'],
    },
    {
      id: 976, title: 'Largest Perimeter Triangle', pattern: 'Sort first, then scan',
      summary: 'From a list of side lengths, return the largest perimeter of a triangle with positive area, or 0 if no three lengths can form one.',
      hints: [
        'With sides a ≤ b ≤ c, a triangle exists exactly when a + b > c.',
        'Sort descending and try the largest side first.',
        'For a fixed largest side, the best partners are the next two largest values.',
      ],
      insight: 'Sort descending and slide a window of three. The first triple where the two smaller sides add up to more than the largest is the answer, because every later triple has a smaller perimeter.',
      approach: [
        'Sort descending.',
        'For each i: if a[i + 1] + a[i + 2] > a[i], return a[i] + a[i + 1] + a[i + 2].',
        'If no window works, return 0.',
      ],
      ds: ['Array', 'Sorting'], time: 'O(n log n)', space: 'O(1) besides the sort',
      traps: ['If the next two largest sides cannot beat a[i], no smaller pair can, so a[i] can never be the longest side of a triangle: move on.'],
    },
    {
      id: 881, title: 'Boats to Save People', pattern: 'Sort first, then scan',
      summary: 'Each boat carries at most two people whose total weight is within a limit. Find the fewest boats that carry everyone.',
      hints: [
        'Sorting tells you who the lightest and heaviest people are.',
        'The heaviest person needs a boat anyway. Who is the best partner for them?',
        'Pair the heaviest with the lightest if they fit; otherwise the heaviest goes alone.',
      ],
      insight: 'After sorting, if the lightest person cannot share with the heaviest, nobody can, so the heaviest rides alone; if the lightest can, pairing them never hurts anyone else. Sorting is what makes this greedy argument possible.',
      approach: [
        'Sort weights ascending; L = first, R = last, boats = 0.',
        'While L ≤ R: if weight[L] + weight[R] fits the limit, move L right.',
        'Always move R left and count one boat.',
      ],
      ds: ['Array', 'Sorting', 'Two indices'], time: 'O(n log n)', space: 'O(1) besides the sort',
      traps: [
        'Array.prototype.sort in V8 (Chrome and Node.js) is Timsort: stable, O(n log n), and very fast on partly sorted input.',
        'Use L ≤ R so a single last person still gets a boat.',
      ],
    },
    {
      id: 2561, title: 'Rearranging Fruits', pattern: 'Sort first, then scan',
      summary: 'Two baskets hold n fruit costs each. Swapping a fruit from one basket with a fruit from the other costs the smaller of the two costs. Make the baskets hold the same multiset of costs at minimum total cost, or report −1.',
      hints: [
        'Count every cost over both baskets. If any cost appears an odd number of times, it is impossible.',
        'Each basket must end up with half of every cost. List the surplus copies that must leave each basket, and sort that list.',
        'A swap can also go through the cheapest fruit of all: two swaps that each cost that minimum.',
      ],
      insight: 'Only surplus fruits move, and the cheapest half of the sorted surplus list pays for the swaps. A direct swap is never worth more than two swaps through the globally cheapest fruit, so each payment is min(x, 2 × global minimum).',
      approach: [
        'Count each cost as (copies in basket 1) − (copies in basket 2), and count totals. Any odd total means the answer is −1.',
        'For each cost, add |difference| / 2 copies to a surplus list.',
        'Sort the surplus list and find the smallest cost m over all fruits.',
        'Add min(x, 2m) over the first half of the sorted surplus list.',
      ],
      ds: ['Hash map', 'Sorting'], time: 'O(n log n)', space: 'O(n)',
      traps: [
        'Forgetting the indirect swap through the cheapest fruit overpays when the surplus fruits are expensive.',
        'The total can exceed 32-bit range in other languages; TypeScript numbers are exact here.',
      ],
    },

    // ---------- Sorted form as a key ----------
    {
      id: 242, title: 'Valid Anagram', pattern: 'Sorted form as a key', core: true,
      summary: 'Decide whether two strings use exactly the same letters the same number of times.',
      hints: [
        'Two anagrams have the same letters in a different order.',
        'What do two anagrams look like after sorting their characters?',
        'Counting letters in an array of 26 is faster than sorting.',
      ],
      insight: 'Anagrams share the same sorted form, so sorting both strings and comparing works. A 26-slot count array does the same check in linear time.',
      approach: [
        'If the lengths differ, the answer is false.',
        'Option A: sort the characters of both strings and compare the results.',
        'Option B (faster): count each letter of s up and each letter of t down in an array of 26; the answer is whether every count ends at zero.',
      ],
      ds: ['String', 'Sorting or a count array'], time: 'O(n) with counts, O(n log n) by sorting', space: 'O(1) for 26 counts',
      traps: ['For the Unicode follow-up, use a Map from character to count instead of 26 slots.'],
    },
    {
      id: 49, title: 'Group Anagrams', pattern: 'Sorted form as a key', core: true,
      summary: 'Group a list of words so that words which are anagrams of each other end up together.',
      hints: [
        'You need a key that is the same for every anagram of a word.',
        'Sorting the letters of a word gives such a key.',
        'Use a Map from key to the list of words with that key.',
      ],
      insight: 'The sorted letters of a word are a canonical key shared by all its anagrams, so a hash map from that key to a list groups the words in one pass.',
      approach: [
        'Create a Map from key to an array of words.',
        'For each word, sort its letters to form the key (or build a 26-count signature).',
        'Append the word to that key\'s list.',
        'Return the lists stored in the map.',
      ],
      ds: ['Hash map', 'Sorting', 'Array'], time: 'O(n · k log k) for n words of length k', space: 'O(n · k)',
      traps: [
        'A count signature must separate the numbers (for example with a "#"), so counts like 1 then 11 cannot blur into 11 then 1.',
        'The empty string is a valid word and forms its own group.',
      ],
    },
    {
      id: 1657, title: 'Determine if Two Strings Are Close', pattern: 'Sorted form as a key',
      summary: 'Two operations are allowed: swap any two characters, or swap the roles of two letters that both appear (every a becomes b and every b becomes a). Decide whether one word can become the other.',
      hints: [
        'Swapping positions means the order of characters never matters, only their counts.',
        'Swapping two letters exchanges their counts, but it can never create a letter that is not already there.',
        'Compare the sets of letters, and compare the sorted lists of counts.',
      ],
      insight: 'Two words are close exactly when they use the same set of letters and their letter counts, sorted, form the same list.',
      approach: [
        'Count the 26 letters of each word.',
        'If a letter appears in one word but not in the other, the answer is false.',
        'Sort both lists of counts and compare them.',
      ],
      ds: ['Count array', 'Sorting'], time: 'O(n)', space: 'O(1)',
      traps: ['Sorting 26 counts is constant work, so the whole check is linear in the length of the words.'],
    },

    // ---------- Custom comparators ----------
    {
      id: 1636, title: 'Sort Array by Increasing Frequency', pattern: 'Custom comparators',
      summary: 'Sort an array by how often each value appears, rarest first. Values with the same frequency go in decreasing order.',
      hints: [
        'Count the frequencies first.',
        'Sort with a comparator that compares frequency first and the value second.',
        'The tie-break runs the opposite way: larger value first.',
      ],
      insight: 'A comparator can encode a two-level order: compare the frequencies, and only when they are equal compare the values in reverse.',
      approach: [
        'Count each value with a Map.',
        'Sort the array with a comparator: smaller frequency first; for equal frequency, larger value first.',
        'Return the sorted array.',
      ],
      ds: ['Hash map', 'Sorting'], time: 'O(n log n)', space: 'O(n)',
      traps: ['A comparator must return a negative number, zero or a positive number. Returning true or false does not sort correctly.'],
    },
    {
      id: 1859, title: 'Sorting the Sentence', pattern: 'Custom comparators',
      summary: 'Each word of a shuffled sentence ends with its position (1 to 9). Rebuild the original sentence.',
      hints: [
        'The last character of each word says where the word goes.',
        'With at most 9 words, you can drop each word straight into its slot instead of comparing.',
      ],
      insight: 'The position digit is a key: put each word into slot (digit − 1) of an array. That is a counting sort with no comparisons at all.',
      approach: [
        'Split the sentence on spaces.',
        'For each word, read its last character as the position and store the word without that digit at index position − 1.',
        'Join the slots with spaces.',
      ],
      ds: ['Array', 'String'], time: 'O(n)', space: 'O(n)',
      traps: ['Positions start at 1, array indices at 0.', 'With nine words even bubble sort would be fast, but direct placement is simpler and linear.'],
    },
    {
      id: 179, title: 'Largest Number', pattern: 'Custom comparators', core: true,
      summary: 'Arrange non-negative integers so that writing them one after another forms the largest possible number. Return it as a string.',
      hints: [
        'Plain numeric order and plain string order both fail: think about 3 and 30.',
        'To decide whether a goes before b, compare the two joined strings a + b and b + a.',
        'Watch out when every number is 0.',
      ],
      insight: 'Put a before b exactly when the string a + b is larger than b + a. This pairwise rule is consistent (if a beats b and b beats c, then a beats c), so sorting with it gives the best arrangement.',
      approach: [
        'Convert every number to a string.',
        'Sort with a comparator that puts a first when a + b is larger than b + a as strings.',
        'Join the strings.',
        'If the result starts with 0, every number was 0: return "0".',
      ],
      ds: ['Array of strings', 'Sorting'], time: 'O(n log n · d), d = digits per number', space: 'O(n · d)',
      traps: ['A normal string sort places "30" before "3" in descending order and builds 303 instead of 330.', 'All zeros must give "0", not "000".'],
    },
    {
      id: 937, title: 'Reorder Data in Log Files', pattern: 'Custom comparators',
      summary: 'Each log is an identifier followed by words that are all letters or all digits. Put letter logs first, sorted by their content and then by identifier, and keep the digit logs after them in their original order.',
      hints: [
        'Split each log once into identifier and content.',
        'One comparator decides: letter log versus digit log, then content, then identifier.',
        'A stable sort keeps the digit logs in their original order for free.',
      ],
      insight: 'A single comparator with three levels does it, and because TypeScript\'s sort is stable, digit logs that compare as equal stay in input order.',
      approach: [
        'Split each log at the first space into identifier and content. It is a digit log if the content starts with a digit.',
        'Comparator: a letter log comes before a digit log; two digit logs compare as equal; two letter logs compare by content, then by identifier.',
        'Sort with that comparator.',
      ],
      ds: ['Array of strings', 'Stable sort'], time: 'O(n log n · L), L = log length', space: 'O(n · L)',
      traps: ['Split only at the first space: the content itself contains spaces.', 'An unstable sort (common in other languages) would scramble the digit logs.'],
    },
    {
      id: 791, title: 'Custom Sort String', pattern: 'Custom comparators',
      summary: 'Reorder the characters of s so they follow the order of the letters in another string, order. Letters of s that are not in order may go anywhere.',
      hints: [
        'A comparator using each letter\'s position in order works.',
        'Even simpler: count the letters of s, then write them out in the order given.',
      ],
      insight: 'Counting the letters of s and writing them out in the custom order is a counting sort keyed by custom rank, which runs in linear time.',
      approach: [
        'Count each letter of s in an array of 26.',
        'For each letter of order, append it as many times as counted, then set its count to zero.',
        'Append the letters that still have counts, in any order.',
      ],
      ds: ['Count array', 'String'], time: 'O(|s| + |order|)', space: 'O(1) for 26 counts',
      traps: ['Letters of s that are missing from order must still appear in the output.'],
    },
    {
      id: 406, title: 'Queue Reconstruction by Height', pattern: 'Custom comparators', core: true,
      summary: 'Each person is described by a height and by how many people in front of them are at least as tall. Rebuild the queue.',
      hints: [
        'Shorter people are invisible to a taller person\'s count.',
        'Place the tallest people first.',
        'Sort by height descending and count ascending, then insert each person at the index equal to their count.',
      ],
      insight: 'Processing tallest first, everyone already placed is at least as tall, so a person whose count is k simply goes to index k. People inserted later are shorter, so they never change the counts of anyone already placed.',
      approach: [
        'Sort by height descending; for equal heights, by count ascending.',
        'Start with an empty list.',
        'Insert each person at position k (their count).',
        'Return the list.',
      ],
      ds: ['Array', 'Sorting', 'List insertion'], time: 'O(n²)', space: 'O(n)',
      traps: [
        'Equal heights must be ordered by count ascending; otherwise an insertion shifts a person whose count already included that position.',
        'A Binary Indexed Tree brings it to O(n log n), but with n ≤ 2000 the simple version is fine.',
      ],
    },
    {
      id: 1029, title: 'Two City Scheduling', pattern: 'Custom comparators',
      summary: 'Fly 2n people to two cities, exactly n to each. Each person has a price for each city. Minimise the total price.',
      hints: [
        'Imagine sending everyone to city B. What does moving one person to city A change?',
        'Moving person i to A changes the total by (price A − price B).',
        'Sort by that difference and move the n people with the smallest values.',
      ],
      insight: 'Sort people by price A − price B. The first n save the most (or lose the least) by going to A, so they go to A and the rest go to B.',
      approach: [
        'Sort the people by price A − price B, ascending.',
        'Send the first n to city A and the last n to city B.',
        'Add up the chosen prices.',
      ],
      ds: ['Array', 'Sorting'], time: 'O(n log n)', space: 'O(1) besides the sort',
      traps: ['Sorting by the price for A alone fails: what matters is how much a person saves by choosing A over B.'],
    },

    // ---------- Sort it yourself ----------
    {
      id: 912, title: 'Sort an Array', pattern: 'Sort it yourself', core: true,
      summary: 'Sort an array of integers in ascending order without built-in sort functions, in O(n log n) time and with as little extra space as possible.',
      hints: [
        'Merge sort is always O(n log n), but needs O(n) extra space.',
        'Heapsort is always O(n log n) and sorts in place.',
        'Quicksort with a fixed pivot hits O(n²) on sorted input or many equal values. If you use it, pick random pivots and split into three parts.',
      ],
      insight: 'Pick an algorithm whose worst case is O(n log n): heapsort (in place) or merge sort (O(n) buffer). Plain quicksort risks O(n²) on the hidden tests.',
      approach: [
        'Heapsort: turn the array into a max-heap by sifting down every parent, from the last parent back to the root.',
        'Swap the root (the maximum) with the last element of the heap, and shrink the heap by one.',
        'Sift the new root down to restore the heap. Repeat until one element is left.',
        'Or merge sort: split in half, sort each half, and merge them through a temporary buffer.',
      ],
      ds: ['Array', 'Heap (in place) or a temporary buffer'], time: 'O(n log n)', space: 'O(1) for heapsort, O(n) for merge sort',
      traps: [
        'The tests include large sorted and all-equal arrays that push naive quicksort to O(n²).',
        'Values lie in a small range, so counting sort also works: O(n + range) time and memory (see Counting, bucket and radix sort).',
      ],
    },
    {
      id: 147, title: 'Insertion Sort List', pattern: 'Sort it yourself',
      summary: 'Sort a singly linked list using insertion sort.',
      hints: [
        'Build a separate sorted list that starts empty, behind a dummy head.',
        'Take nodes off the input one by one and splice each into its place in the sorted list.',
        'Finding the place means walking from the dummy until the next node is bigger.',
      ],
      insight: 'Insertion sort only ever splices one node into a sorted list, which a linked list does in O(1) once the position is known; finding the position is the costly part.',
      approach: [
        'Create a dummy head for the sorted list.',
        'For each input node (save its next pointer first): walk a pointer from the dummy while the following sorted node is smaller.',
        'Splice the node in right after that pointer.',
        'Return the node after the dummy.',
      ],
      ds: ['Linked list', 'Dummy node'], time: 'O(n²)', space: 'O(1)',
      traps: [
        'Save the input\'s next node before splicing, or you lose the rest of the input.',
        'Reverse-sorted input makes every walk long: O(n²), which is fine for 5000 nodes. For O(n log n) use merge sort (Sort List, in the Merge sort chapter).',
      ],
    },
    {
      id: 23, title: 'Merge k Sorted Lists', pattern: 'Sort it yourself',
      summary: 'Merge k sorted linked lists into one sorted list.',
      hints: [
        'The next node of the output is the smallest among the k current heads.',
        'Keep the k heads in a min-heap. This is a tournament: the winner leaves, and its successor enters.',
        'Merging lists in pairs, halving their number each round, works too.',
      ],
      insight: 'A min-heap of the k current heads is a tournament tree: each step takes the winner (the smallest head) and lets its successor compete, costing O(log k) per node.',
      approach: [
        'Push the head of every non-empty list into a min-heap ordered by value.',
        'Pop the smallest node, append it to the output, and push its next node if there is one.',
        'Repeat until the heap is empty.',
      ],
      ds: ['Linked list', 'Min-heap (priority queue)'], time: 'O(N log k) for N nodes in total', space: 'O(k)',
      traps: [
        'TypeScript has no built-in heap: write a small binary heap, or merge the lists pairwise (also O(N log k)).',
        'Merging the lists one after another into a growing result costs O(N · k).',
      ],
    },
  ],
};
