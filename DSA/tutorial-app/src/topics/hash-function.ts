import type { Topic } from './types';

export const topic: Topic = {
  id: 'hash-function',
  patterns: [
    { name: 'Build your own hash table', idea: 'An array of buckets, a function from key to bucket, and a rule for collisions: chaining or open addressing.' },
    { name: 'Canonical keys', idea: 'Turn every member of an equivalence class into the same key (sorted letters, counts, normalised shape), then group with a Map.' },
    { name: 'Hashing structures', idea: 'Give a tree, a folder or a subtree a key built from its children\'s keys, so equal structures get equal keys in one bottom-up pass.' },
    { name: 'Hashing pieces of strings', idea: 'Precomputed prefix hashes give the hash of any substring or its reverse in O(1), so you can look pieces up instead of comparing them.' },
    { name: 'Generating keys', idea: 'When you choose the keys yourself, a counter gives short keys that can never collide; a hash of the data needs a plan for collisions.' },
  ],
  signals: [
    { see: '"Group", "find duplicates" or "count distinct" where equality is looser than identical (anagrams, same shape, same content)', think: 'A canonical key and a Map from key to group', why: 'Two items are equal exactly when their keys are equal, so one lookup replaces comparing every pair.' },
    { see: '"Design a HashMap / HashSet without built-in libraries"', think: 'Array of buckets + modulo + chaining', why: 'That is how hash tables work inside; a prime number of buckets spreads keys evenly.' },
    { see: 'Duplicate subtrees, identical folders, equal sub-structures', think: 'Bottom-up structural keys (serialisation or ids)', why: 'A structure\'s key is built from its children\'s keys, so each node is keyed once.' },
    { see: 'A key made of several numbers, like (row, col) or a list', think: 'Encode it as one string or one number', why: 'JavaScript Map and Set compare arrays by reference, so [1, 2] and [1, 2] are different keys.' },
    { see: '"Is this piece of a string (or its reverse) somewhere in my list?" for many pieces', think: 'Prefix hashes and a Map keyed by hash', why: 'Each piece\'s hash costs O(1) after O(n) preparation, instead of building the piece.' },
  ],
  problems: [
    // ---------- Build your own hash table ----------
    {
      id: 705, title: 'Design HashSet', pattern: 'Build your own hash table', core: true,
      summary: 'Build a set of integer keys (0 to 10⁶) with add, contains and remove, without using any built-in hash table.',
      hints: [
        'A boolean array of size 10⁶ + 1 works for this key range. Why is that not a general answer?',
        'Use a smaller array of buckets and send key k to bucket k mod (number of buckets).',
        'Keys that land in the same bucket share it: keep a short list per bucket.',
      ],
      insight: 'Separate chaining: an array of buckets indexed by key mod a prime, each holding the few keys that hash there, keeps every operation to a scan of one short list.',
      approach: [
        'Pick a bucket count, for example a prime near the expected number of keys (around 1,000 to 10,000 here).',
        'Each bucket is an array (or linked list) of keys.',
        'add: compute the bucket; append the key only if it is not already there.',
        'contains: scan that bucket for the key. remove: find it in the bucket and delete it (swap with the last element and pop).',
      ],
      ds: ['Array of buckets', 'Short arrays per bucket'], time: 'O(1) average per operation', space: 'O(buckets + keys)',
      traps: [
        'A direct boolean array uses memory for every possible key; it only works because the range is small.',
        'Do not add a key twice: check the bucket first.',
      ],
    },
    {
      id: 706, title: 'Design HashMap', pattern: 'Build your own hash table', core: true,
      summary: 'Build a map from integer keys to integer values with put, get and remove, without using any built-in hash table.',
      hints: ['Start from your hash set.', 'Store [key, value] pairs in each bucket instead of bare keys.', 'put must update the value when the key is already present.'],
      insight: 'The same chained buckets as a hash set, but each entry is a key–value pair, and put replaces an existing pair instead of adding a second one.',
      approach: [
        'Create an array of buckets, each a list of [key, value] pairs.',
        'put: find the bucket; if a pair with this key exists, replace its value, otherwise append a new pair.',
        'get: scan the bucket and return the value, or −1 if the key is absent.',
        'remove: delete the pair from its bucket if it is there.',
      ],
      ds: ['Array of buckets', 'Key–value pairs'], time: 'O(1) average per operation', space: 'O(buckets + entries)',
      traps: ['Forgetting the update case in put leaves stale values that get can return.', 'Open addressing (probing the next slot) also works, but removal then needs a "deleted" marker so searches do not stop early.'],
    },

    // ---------- Canonical keys ----------
    {
      id: 49, title: 'Group Anagrams', pattern: 'Canonical keys', core: true,
      summary: 'Group a list of words so that words made of exactly the same letters end up in the same group.',
      hints: [
        'What do all anagrams of a word have in common?',
        'Find a key that is identical for every anagram and different otherwise.',
        'Sorted letters work as a key; so do the 26 letter counts written as one string.',
      ],
      insight: 'Map every word to a canonical key, its letters sorted or its letter counts, and collect words with equal keys in a Map.',
      approach: [
        'Create a Map from key to list of words.',
        'For each word, build its key: sort its characters, or count the 26 letters and join the counts with a separator.',
        'Append the word to the list for that key.',
        'Return the Map\'s lists.',
      ],
      ds: ['Map<string, string[]>'], time: 'O(n · k log k) with sorting, O(n · k) with counts', space: 'O(n · k)',
      traps: [
        'Join counts with a separator: without one, the counts 1, 11 and 11, 1 both read "111".',
        'The empty string is a word too; it gets the empty key.',
      ],
    },
    {
      id: 609, title: 'Find Duplicate File in System', pattern: 'Canonical keys',
      summary: 'Directory listings give file names with their contents. Return groups of full file paths whose contents are identical (groups of at least two).',
      hints: ['Two files are duplicates exactly when their contents are equal.', 'Use the content itself as the key, and the list of full paths as the value.'],
      insight: 'The content string is the canonical key: parse each listing, map content to the paths that have it, and keep the groups with two or more paths.',
      approach: [
        'For each listing, split on spaces: the first part is the directory, the rest are "name(content)" items.',
        'For each item, split off the content between the parentheses and build directory + "/" + name.',
        'Append the path to a Map keyed by content.',
        'Return every list with at least two paths.',
      ],
      ds: ['Map<string, string[]>'], time: 'O(total input length)', space: 'O(total input length)',
      traps: [
        'For huge real files, compare sizes first, then a hash of the contents, then the bytes themselves to rule out false positives from collisions.',
      ],
    },
    {
      id: 2261, title: 'K Divisible Elements Subarrays', pattern: 'Canonical keys',
      summary: 'Count the distinct subarrays that contain at most k elements divisible by p. Subarrays with the same values in the same order count once.',
      hints: [
        'Fix the start, extend the end, and stop once more than k elements are divisible by p.',
        'To count distinct subarrays you need a key for each one.',
        'Extend the key as you extend the subarray: a trie walk or a rolling hash adds one element in O(1).',
      ],
      insight: 'Every valid subarray is reached by extending from its start, so grow a key alongside it: walking down a trie one element at a time, a newly created node is exactly a new distinct subarray.',
      approach: [
        'For each start index, set count = 0 and stand at the root of a trie.',
        'Extend the end one element at a time; if the element is divisible by p, add 1 to count, and stop when count exceeds k.',
        'Move to the trie child for this element, creating it if missing; each creation adds 1 to the answer.',
        'Return the number of created nodes.',
      ],
      ds: ['Trie of numbers (Map per node)', 'Counter'], time: 'O(n²)', space: 'O(n²)',
      traps: ['Joining values into a string key also works for n ≤ 200, but join with a separator so 1, 23 and 12, 3 differ.'],
    },
    {
      id: 694, title: 'Number of Distinct Islands', pattern: 'Canonical keys',
      summary: 'In a grid of land and water, count islands with distinct shapes, where two islands are the same if one can be shifted onto the other (no rotation or reflection).',
      hints: [
        'Shifting means the absolute positions do not matter, only positions relative to the island.',
        'Describe each island by the offsets of its cells from its first cell.',
        'Put each island\'s description, as a string, into a Set.',
      ],
      insight: 'Normalise each island by subtracting the coordinates of its first-visited cell; the list of offsets in visiting order is a canonical key for its shape.',
      approach: [
        'Scan the grid; at each unvisited land cell, start a DFS or BFS and remember the start cell (r0, c0).',
        'For every cell of the island, record (r − r0, c − c0) in visiting order, and mark it visited.',
        'Join the offsets into one string and add it to a Set.',
        'Return the size of the Set.',
      ],
      ds: ['Grid', 'Set<string>', 'DFS stack'], time: 'O(rows · cols)', space: 'O(rows · cols)',
      traps: [
        'A path signature (the sequence of moves, including "back" moves) also works, but without the back markers two different shapes can produce the same string.',
        'Visit in a fixed order (same scan and same neighbour order) so equal shapes produce equal lists.',
      ],
    },

    // ---------- Hashing structures ----------
    {
      id: 572, title: 'Subtree of Another Tree', pattern: 'Hashing structures',
      summary: 'Decide whether a binary tree contains a subtree identical in structure and values to a second tree.',
      hints: [
        'Comparing the small tree at every node works, at O(m · n).',
        'Serialise both trees in preorder, writing a marker for every missing child.',
        'Then the question becomes "is one string inside the other?", if every value is wrapped in separators.',
      ],
      insight: 'A preorder serialisation with null markers and separators identifies a tree uniquely, so "is a subtree" becomes "is a substring", which string matching answers in linear time.',
      approach: [
        'Serialise each tree in preorder: for a node write a separator, its value, then its left and right serialisations; for a missing child write a separator and a null marker.',
        'Check whether the small tree\'s string occurs inside the big tree\'s string (KMP or the built-in search).',
        'Return the result.',
      ],
      ds: ['String serialisation', 'String search'], time: 'O(m + n) with KMP', space: 'O(m + n)',
      traps: [
        'Without a separator before each value, 2 would match inside 12.',
        'Without null markers, different shapes can serialise the same way.',
        'A Merkle-style hash (combine the hashes of value, left and right) avoids long strings but needs care with collisions.',
      ],
    },
    {
      id: 652, title: 'Find Duplicate Subtrees', pattern: 'Hashing structures', core: true,
      summary: 'Return one root of every kind of subtree that appears at least twice in a binary tree (same shape and values).',
      hints: [
        'Two subtrees are equal when their roots are equal and their left and right subtrees are equal.',
        'Build each subtree\'s key from its value and its children\'s keys, bottom-up.',
        'Long string keys can be slow; give each distinct (left id, value, right id) triple a small integer id instead.',
      ],
      insight: 'Intern subtrees: a post-order DFS maps the triple (left id, value, right id) to an integer id, so equal subtrees get equal ids in O(1) each, and an id seen for the second time marks a duplicate.',
      approach: [
        'Keep a Map from triple key to id and a Map from id to how many times it was seen.',
        'Post-order: an empty child has id 0. For a node, build the key from its left id, its value and its right id.',
        'Look the key up (assigning the next id if new), then increase that id\'s count.',
        'When a count becomes exactly 2, add the node to the answer.',
      ],
      ds: ['Map<string, number> for ids', 'Map<number, number> for counts'], time: 'O(n)', space: 'O(n)',
      traps: [
        'Full serialisation strings as keys can total O(n²) characters on a deep tree; ids keep each key short.',
        'Report each kind once: add it when the count reaches 2, not every time after.',
      ],
    },
    {
      id: 1948, title: 'Delete Duplicate Folders in System', pattern: 'Hashing structures',
      summary: 'Folders are identical if they contain the same non-empty set of identical subfolders. Delete every folder that has an identical twin (with everything inside), once, and return the remaining folder paths.',
      hints: [
        'Put all paths into a trie of folder names.',
        'A folder\'s structure is described by its children\'s names and structures, in sorted name order.',
        'Count each non-empty structure key; delete folders whose key appears twice or more, then list what is left.',
      ],
      insight: 'Give each trie node a structural key built bottom-up from its sorted children (name plus child key); folders with the same non-empty key are identical, so count keys and skip those subtrees when listing paths.',
      approach: [
        'Insert every path into a trie keyed by folder name.',
        'Post-order: a leaf\'s key is empty. Otherwise sort the children by name and join each name with its child\'s key in brackets; count non-empty keys in a Map.',
        'DFS again from the root, building paths; skip any child whose key is non-empty and counted at least twice (and everything under it).',
        'Record the path of every folder you do visit.',
      ],
      ds: ['Trie with Map children', 'Map<string, number> of key counts'], time: 'O(total names × depth) for the keys, less with interning', space: 'O(total input)',
      traps: [
        'Empty folders are never "identical" to each other by the rules: only non-empty keys count.',
        'Deletion happens once; folders that become identical after deleting are kept.',
        'Sort children by name before building the key, or the same structure gives different keys.',
      ],
    },

    // ---------- Hashing pieces of strings ----------
    {
      id: 336, title: 'Palindrome Pairs', pattern: 'Hashing pieces of strings',
      summary: 'Given unique words, return every ordered pair (i, j) with i ≠ j such that word i followed by word j is a palindrome, in time linear in the total length of the words.',
      hints: [
        'Split a word into a left part and a right part. If the left part is a palindrome, which word placed in front of it completes a palindrome?',
        'The reverse of the right part, if it is one of the words. Symmetrically for the right part being a palindrome.',
        'To stay linear, check palindromes and look up reversed pieces by hash in O(1) each, using prefix hashes of the word and of its reverse.',
      ],
      insight: 'For every split of a word, a palindromic left part pairs with the word equal to the reversed right part placed in front, and a palindromic right part pairs with the reversed left part placed behind; prefix hashes make each palindrome check and each lookup O(1).',
      approach: [
        'Map the hash of every word (with its length) to its index.',
        'For a word w of length n, compute prefix hashes of w and of its reverse.',
        'For each cut c from 0 to n: if w[0..c) is a palindrome (its hash equals the matching reversed hash) and some other word equals the reverse of w[c..n), record (that word, w).',
        'If c < n and w[c..n) is a palindrome and some other word equals the reverse of w[0..c), record (w, that word).',
      ],
      ds: ['Map from hash to index', 'Prefix hash arrays', 'Powers of the base'], time: 'O(total length)', space: 'O(total length)',
      traps: [
        'The simpler version builds reversed pieces as strings: O(n · k²), fine for many judges but not what the statement asks.',
        'The empty word pairs with every palindrome on both sides; the c < n guard stops the full-word case being counted twice.',
        'Use two moduli (or check the match directly) to rule out collisions.',
      ],
    },
    {
      id: 535, title: 'Encode and Decode TinyURL', pattern: 'Generating keys',
      summary: 'Design a URL shortener: encode a long URL into a short one and decode the short one back.',
      hints: ['You need a short key that maps back to the long URL.', 'A counter written in base 62 gives unique, short keys; random codes also work if you check for collisions.'],
      insight: 'The short code is just a key in a Map: generate a unique short key (a counter in base 62, or a random code re-drawn on collision) and store code → long URL.',
      approach: [
        'Keep a Map from code to long URL (and optionally long URL to code, so the same URL gets the same code).',
        'encode: create the next code, store the pair, and return the prefix plus the code.',
        'decode: strip the prefix and look the code up.',
      ],
      ds: ['Map<string, string>', 'Counter or random generator'], time: 'O(length) per call', space: 'O(number of URLs)',
      traps: ['Using a hash of the URL as the code risks two URLs getting the same code; a counter cannot collide.'],
    },
  ],
};
