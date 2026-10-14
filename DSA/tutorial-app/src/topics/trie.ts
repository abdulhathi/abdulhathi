import type { Topic } from './types';

export const topic: Topic = {
  id: 'trie',
  patterns: [
    { name: 'Build and walk', idea: 'Insert each word one character at a time; every prefix question becomes a walk down from the root, with counts or sums kept on the nodes.' },
    { name: 'Wildcard search', idea: 'When a character may match anything, branch into every child: a small depth-first search inside the trie.' },
    { name: 'Dictionary prefix queries', idea: 'Walk each query through a trie of known words, stopping at the first word end or collecting what lies below.' },
    { name: 'Reversed and combined keys', idea: 'Insert words backwards to answer suffix questions, or glue a suffix and a prefix into one key so one walk answers both.' },
    { name: 'Trie-guided search', idea: 'Use the trie to prune another search: a grid walk or a string DP stops the moment no word has the current prefix.' },
    { name: 'Bitwise trie', idea: 'Store numbers as bit strings from the highest bit; to maximise XOR, walk towards the opposite bit whenever that branch exists.' },
    { name: 'Implicit trie', idea: 'Numbers in dictionary order form a trie with ten children per node that you never build: walk it with arithmetic and subtree counts.' },
  ],
  signals: [
    { see: 'Many words, and queries about prefixes ("starts with", "autocomplete", "shortest root")', think: 'Trie', why: 'All words sharing a prefix share one path, so a prefix query costs the length of the prefix, not the number of words.' },
    { see: 'Search with a wildcard character, or "change exactly one letter"', think: 'Trie + DFS over children', why: 'A wildcard is just "try every child here"; the trie stops dead branches early.' },
    { see: 'Find many dictionary words inside a grid or a long string', think: 'Build one trie of all words, then search once', why: 'Searching word by word repeats the same prefixes; one trie walk follows all words at the same time.' },
    { see: 'Questions about suffixes, or a stream where you check the latest characters', think: 'Trie of reversed words', why: 'A suffix of a word is a prefix of the reversed word.' },
    { see: 'Maximise XOR of a pair, or XOR with a limit', think: 'Binary trie, highest bit first', why: 'A higher bit outweighs all lower bits together, so a greedy walk bit by bit is optimal.' },
    { see: 'Numbers in lexicographic (dictionary) order', think: 'Implicit ten-way trie, pre-order walk', why: 'Dictionary order of numbers is exactly a pre-order traversal of the tree of digit prefixes.' },
  ],
  problems: [
    // ---------- Build and walk ----------
    {
      id: 14, title: 'Longest Common Prefix', pattern: 'Build and walk', core: true,
      summary: 'Return the longest string that every word in a list starts with, or an empty string if there is none.',
      hints: [
        'Picture all the words inserted into a trie. What does the common prefix look like there?',
        'It is the path from the root that never branches.',
        'Stop when a node has more than one child or a word ends there.',
      ],
      insight: 'In a trie of all the words, the common prefix is the path from the root that never branches and never passes the end of a word.',
      approach: [
        'Insert every word into a trie.',
        'Start at the root. While the current node has exactly one child and no word ends at it, move to that child and add its character to the answer.',
        'Return the characters collected.',
      ],
      ds: ['Trie', 'String'], time: 'O(S), S = total characters', space: 'O(S)',
      traps: [
        'If any word is empty, the answer is the empty string: the root itself is a word end.',
        'A simpler way also works here: compare characters column by column across all words, stopping at the first mismatch. Learn the trie view because it scales to prefix queries.',
      ],
    },
    {
      id: 208, title: 'Implement Trie (Prefix Tree)', pattern: 'Build and walk', core: true,
      summary: 'Build a structure that stores words and answers two questions: was this exact word inserted, and does any inserted word start with this prefix?',
      hints: [
        'Each node holds a link per possible next character, plus a flag.',
        'Insert, search and prefix-search all start the same way: walk down from the root, one character at a time.',
        'The only difference between "search" and "starts with" is the end-of-word flag on the last node.',
      ],
      insight: 'A node is a map from character to child plus an "end of word" flag. Every operation is a walk of length L; search additionally checks the flag on the last node.',
      approach: [
        'Node: children (a Map from character to node, or an array of 26 slots) and a boolean end flag.',
        'Insert: walk from the root, creating any missing child, and set the end flag on the last node.',
        'Search: walk; if a child is missing return false; otherwise return the last node\'s end flag.',
        'Starts with: walk; return false if a child is missing, true if the walk completes.',
      ],
      ds: ['Trie node', 'Map or 26-slot array'], time: 'O(L) per operation', space: 'O(total characters inserted)',
      traps: ['Forgetting the end flag makes "app" look present after inserting only "apple".', 'An array of 26 slots is faster; a Map uses less memory when the alphabet is large or sparse.'],
    },
    {
      id: 677, title: 'Map Sum Pairs', pattern: 'Build and walk',
      summary: 'Store string keys with values (inserting an existing key replaces its value) and answer: what is the total value of all keys that start with a given prefix?',
      hints: [
        'Keep a running total on every trie node: the sum of values of all keys passing through it.',
        'When a key is inserted again, the totals must change by the difference, not by the full new value.',
      ],
      insight: 'Each node stores the sum of the values below it. On insert, add (new value − old value) along the key\'s path; a prefix sum query is then a single walk.',
      approach: [
        'Keep a Map from key to its current value, so you know the old value (0 if new).',
        'delta = new value − old value. Walk the key\'s path, creating nodes, and add delta to every node on the path.',
        'Sum query: walk the prefix; return the node\'s total, or 0 if the walk fails.',
      ],
      ds: ['Trie with a sum per node', 'Map of key to value'], time: 'O(L) per operation', space: 'O(total characters)',
      traps: ['Adding the full value again when a key is re-inserted counts it twice.'],
    },
    {
      id: 3043, title: 'Find the Length of the Longest Common Prefix', pattern: 'Build and walk',
      summary: 'Given two arrays of positive integers, find the longest digit prefix shared by any number from the first array and any number from the second.',
      hints: [
        'Treat each number as its string of digits.',
        'Insert every number from the first array into a trie of digits.',
        'Walk each number from the second array down the trie as far as it goes; the depth reached is a common prefix length.',
      ],
      insight: 'Put the first array in a digit trie; for each number in the second array, the depth its walk reaches is its longest common prefix with anything in the first array.',
      approach: [
        'Insert the digit string of every number in the first array into a trie (at most 9 digits each).',
        'For each number in the second array, walk its digits down the trie until a digit is missing.',
        'Track the deepest walk; return it.',
      ],
      ds: ['Trie over digits'], time: 'O((n + m) · d), d ≤ 9 digits', space: 'O(n · d)',
      traps: ['Comparing every pair is 2.5 · 10⁹ pairs: far too slow.', 'A Set of every prefix of every first-array number is an equally good alternative.'],
    },
    {
      id: 2416, title: 'Sum of Prefix Scores of Strings', pattern: 'Build and walk',
      summary: 'The score of a string is how many words in the list start with it. For each word, add up the scores of all its non-empty prefixes.',
      hints: [
        'The score of a prefix is the number of words whose trie path passes through that prefix\'s node.',
        'Count, on each node, how many words pass through it.',
        'The answer for a word is the sum of the counts along its own path.',
      ],
      insight: 'Store on every node how many words pass through it. A word\'s answer is just the sum of the counts on its path, so two passes over the trie solve everything.',
      approach: [
        'Insert every word, adding 1 to the counter of each node on its path.',
        'For each word, walk its path again and add up the counters.',
        'Return the sums in the original order.',
      ],
      ds: ['Trie with a counter per node'], time: 'O(S), S = total characters (up to 10⁶)', space: 'O(S)',
      traps: [
        'Up to a million nodes: an object per node with 26 slots is heavy in JavaScript. A flat typed array of size nodes × 26 for children and another for counts is much faster.',
        'A word counts as a prefix of itself, so the last node on the path is included.',
      ],
    },

    // ---------- Wildcard search ----------
    {
      id: 211, title: 'Design Add and Search Words Data Structure', pattern: 'Wildcard search', core: true,
      summary: 'Support adding words and searching for a pattern in which a dot matches any single letter.',
      hints: [
        'Without dots this is exactly a trie search.',
        'At a dot you do not know which child to take. Try all of them.',
        'Make search recursive: (node, position in the pattern).',
      ],
      insight: 'A dot means "any child": search becomes a DFS that branches only at dots, and the trie cuts off every branch whose prefix does not exist.',
      approach: [
        'Add: ordinary trie insert with an end flag.',
        'Search(node, i): if i equals the pattern length, return the node\'s end flag.',
        'If pattern[i] is a letter, recurse into that child only (false if missing).',
        'If it is a dot, recurse into every child and return true as soon as one succeeds.',
      ],
      ds: ['Trie', 'Recursion'], time: 'O(L) without dots; at most 26² · L with the two dots allowed', space: 'O(total characters)',
      traps: ['The pattern must end exactly at a word end: "ba." should not match "bad" plus more letters.'],
    },
    {
      id: 676, title: 'Implement Magic Dictionary', pattern: 'Wildcard search',
      summary: 'Given a list of distinct words, answer queries: can you change exactly one character of the query to get a word in the list?',
      hints: [
        'Walk the query down the trie, carrying one extra bit of state: have you used your one change yet?',
        'At each position you may follow the matching child (state unchanged) or, if no change is used yet, any other child (state becomes used).',
        'Accept only if you finish at a word end with the change used.',
      ],
      insight: 'A DFS over the trie with a "change used" flag: follow the same letter for free, or spend the single change on a different letter once. Exactly one change is required at the end.',
      approach: [
        'Build a trie of the dictionary.',
        'DFS(node, i, changed): at the end of the query, succeed if the node ends a word and changed is true.',
        'Follow the child for query[i] keeping changed as it is.',
        'If changed is false, also try every other child with changed = true.',
      ],
      ds: ['Trie', 'Recursion with a flag'], time: 'O(26 · L²) per query in the worst case', space: 'O(total characters)',
      traps: ['The query word itself, unchanged, does not count: zero changes is not "exactly one".', 'Another clean approach: map every word with one position replaced by "*" to a count, and check the query\'s patterns.'],
    },

    // ---------- Dictionary prefix queries ----------
    {
      id: 648, title: 'Replace Words', pattern: 'Dictionary prefix queries', core: true,
      summary: 'Given a list of roots and a sentence, replace each word that starts with some root by the shortest such root.',
      hints: ['Put the roots in a trie.', 'For each sentence word, walk the trie and stop at the first node marked as the end of a root.'],
      insight: 'Walking a word down a trie of roots meets the shortest matching root first, so you can stop at the first end flag.',
      approach: [
        'Insert every root into a trie.',
        'For each word in the sentence, walk its characters; if you reach a node marked as a root end, output the prefix walked so far.',
        'If a character has no child, output the word unchanged.',
        'Join the words with single spaces.',
      ],
      ds: ['Trie', 'Array of words'], time: 'O(D + S), D = total root characters, S = sentence length', space: 'O(D)',
      traps: ['Checking every root against every word (1000 roots × 1000 words × up to 100 characters) is wasteful; the trie walk stops at the first root end.', 'Several roots can match one word; the first end flag met on the walk is the shortest, which the problem asks for.'],
    },
    {
      id: 1268, title: 'Search Suggestions System', pattern: 'Dictionary prefix queries', core: true,
      summary: 'After each character of a search word is typed, suggest up to three product names with that prefix, choosing the alphabetically smallest ones.',
      hints: [
        'If you insert the products in sorted order, the first three words to pass through a node are the three smallest with that prefix.',
        'Store up to three words on each node as you insert.',
        'Walk the search word; once the walk fails, every later answer is empty.',
      ],
      insight: 'Insert products in sorted order and let each node keep the first three words that pass through it; then each typed prefix is answered by one step of a walk.',
      approach: [
        'Sort the products.',
        'Insert each one; at every node on its path, append the word to that node\'s list if the list has fewer than three entries.',
        'Walk the search word one character at a time, outputting the list of each node reached.',
        'After the first missing character, output empty lists for the remaining characters.',
      ],
      ds: ['Trie with a short list per node', 'Sorting'], time: 'O(S log n + total characters)', space: 'O(total characters)',
      traps: ['Sorting then binary searching for each prefix is an equally valid approach and uses less memory.'],
    },
    {
      id: 720, title: 'Longest Word in Dictionary', pattern: 'Dictionary prefix queries',
      summary: 'Find the longest word that can be built one letter at a time, where every intermediate prefix is also a word in the list. Break ties by alphabetical order.',
      hints: ['Insert all words into a trie.', 'A word is buildable when every node on its path is marked as a word end.', 'Search the trie, moving only into children that end a word.'],
      insight: 'Buildable words are exactly the nodes you can reach from the root by stepping only on word-end nodes, so a DFS restricted to those nodes finds them all.',
      approach: [
        'Build a trie of all words.',
        'DFS from the root, visiting children in alphabetical order and entering a child only if it ends a word.',
        'Keep the deepest word found, replacing it only when a strictly longer one appears (alphabetical order then gives the smallest tie).',
      ],
      ds: ['Trie', 'DFS'], time: 'O(S)', space: 'O(S)',
      traps: ['Replacing on equal length breaks the alphabetical tie rule.', 'Alternative: sort the words, keep a set of buildable words, and accept a word if the word minus its last letter is in the set.'],
    },
    {
      id: 1233, title: 'Remove Sub-Folders from the Filesystem', pattern: 'Dictionary prefix queries',
      summary: 'Given folder paths, remove every folder that lies inside another folder in the list.',
      hints: ['Split each path on "/" and treat each folder name as one "character" of a trie.', 'A folder is kept if no folder on its path above it is in the list.'],
      insight: 'In a trie keyed by folder names, keep only the first end-of-folder node on each path; anything deeper is a sub-folder.',
      approach: [
        'Insert each path into a trie whose edges are folder names, marking the last node.',
        'DFS from the root; when you reach a marked node, record its path and do not go deeper.',
        'Return the recorded paths.',
      ],
      ds: ['Trie keyed by strings (Map per node)'], time: 'O(total characters)', space: 'O(total characters)',
      traps: [
        'A plain string prefix test is wrong: "/a/b/ca" is not inside "/a/b/c". Compare whole folder names, or require the prefix to be followed by "/".',
        'Sorting the paths and comparing each with the last kept folder plus "/" also works.',
      ],
    },

    // ---------- Reversed and combined keys ----------
    {
      id: 820, title: 'Short Encoding of Words', pattern: 'Reversed and combined keys',
      summary: 'Encode a list of words into one reference string where each word is a substring ending at a "#". Return the shortest possible length of that string.',
      hints: ['A word that is a suffix of another word can reuse it: "me" fits inside "time#".', 'Suffixes become prefixes if you reverse the words.', 'Only the words that are not a suffix of any other word need their own "#".'],
      insight: 'Insert reversed words into a trie; words ending at a leaf are not suffixes of anything else, and each contributes its length plus one for the "#".',
      approach: [
        'Remove duplicate words.',
        'Insert each word reversed into a trie.',
        'For every leaf (a node with no children), add its depth + 1.',
        'Return the total.',
      ],
      ds: ['Trie of reversed words', 'Set'], time: 'O(S)', space: 'O(S)',
      traps: ['Duplicates must be counted once.', 'Equivalent idea without a trie: put all words in a set, delete every proper suffix of every word, then sum length + 1 over what is left.'],
    },
    {
      id: 1032, title: 'Stream of Characters', pattern: 'Reversed and combined keys',
      summary: 'Characters arrive one at a time. After each one, report whether some suffix of everything received so far is a word from a given list.',
      hints: [
        'Every match ends at the newest character.',
        'So read the stream backwards from the newest character, and match against reversed words.',
        'You only need to keep the last (longest word length) characters.',
      ],
      insight: 'A suffix of the stream that equals a word is a prefix of the reversed stream that equals a reversed word, so walk a trie of reversed words backwards from the newest character.',
      approach: [
        'Insert every word reversed into a trie; remember the longest word length.',
        'Keep the received characters in a buffer, keeping at most that many recent ones.',
        'On each query, append the character, then walk the trie from the newest character backwards.',
        'Return true as soon as you reach a word-end node; false if a child is missing or the buffer runs out.',
      ],
      ds: ['Trie of reversed words', 'Array buffer'], time: 'O(maxLen) per query, at most 200', space: 'O(total characters)',
      traps: ['Walking forward from every possible start position each time is far slower.', 'Aho–Corasick (String matching chapter) answers each query in amortised O(1); know that it exists.'],
    },
    {
      id: 745, title: 'Prefix and Suffix Search', pattern: 'Reversed and combined keys',
      summary: 'Store a list of words; each query gives a prefix and a suffix, and asks for the largest index of a word having both.',
      hints: [
        'A prefix trie answers half the question. How can one walk check the suffix too?',
        'For each word, insert keys of the form suffix + "#" + word for every suffix of the word.',
        'Then a query walks suffix + "#" + prefix, and each node remembers the largest index that passed through it.',
      ],
      insight: 'Glue the suffix in front of the word with a separator, for every suffix: one trie walk of "suffix#prefix" then answers both conditions at once.',
      approach: [
        'For each word at index i and each of its suffixes s (including the whole word), insert s + "#" + word, storing i on every node passed (later words overwrite).',
        'Query: walk suffix + "#" + prefix. If the walk fails, return −1; otherwise return the stored index.',
      ],
      ds: ['Trie with an index per node'], time: 'O(L²) per word to build (L ≤ 7), O(L) per query', space: 'O(n · L²)',
      traps: ['Intersecting a prefix-trie result list with a suffix-trie result list per query can be slow.', 'Because words are short, a Map from every "prefix#suffix" pair (at most 49 per word) to the largest index is also fine.'],
    },

    // ---------- Trie-guided search ----------
    {
      id: 212, title: 'Word Search II', pattern: 'Trie-guided search', core: true,
      summary: 'Given a grid of letters and a list of words, return every word that can be traced through horizontally or vertically adjacent cells without reusing a cell.',
      hints: [
        'Searching for each word separately repeats the same prefixes thousands of times.',
        'Put all words in one trie and walk the grid and the trie together.',
        'Stop a path as soon as the trie has no child for the next letter; remove words once found.',
      ],
      insight: 'One DFS from each cell, moving through the trie in step with the grid, searches for all words at once, and the trie prunes every path that is not a prefix of some word.',
      approach: [
        'Insert all words into a trie, storing the full word at its end node.',
        'From every cell, run a DFS carrying the current trie node: step to a neighbour only if the trie has a child for its letter.',
        'Mark the cell as used while it is on the path, and unmark it when you return.',
        'When you reach a node holding a word, record the word and clear it so it is reported once. Optionally delete trie nodes that have no children left.',
      ],
      ds: ['Trie', 'Grid', 'Backtracking'], time: 'O(m · n · 3^L) worst case, far less with pruning', space: 'O(total word characters)',
      traps: ['Running Word Search I once per word is too slow for 3 · 10⁴ words.', 'Report each word once even if it appears in several places.', 'Pruning finished branches from the trie makes a big difference on hard tests.'],
    },
    {
      id: 139, title: 'Word Break', pattern: 'Trie-guided search', core: true,
      summary: 'Decide whether a string can be split into a sequence of dictionary words (words may be reused).',
      hints: [
        'Let ok[i] mean "the first i characters can be split".',
        'From every position i where ok[i] is true, which positions can you reach with one dictionary word?',
        'Walk the trie along the string from i; every word end you pass marks a reachable position.',
      ],
      insight: 'A DP over positions where transitions are found by walking a trie from each reachable position: every word end met during the walk makes the position after it reachable.',
      approach: [
        'Insert the dictionary into a trie. ok[0] = true.',
        'For each i with ok[i] true, walk the trie along the string starting at i.',
        'At each step j where the node is a word end, set ok[j + 1] = true. Stop when a child is missing.',
        'Return ok[n].',
      ],
      ds: ['Trie', 'Boolean DP array'], time: 'O(n · maxWordLength)', space: 'O(n + dictionary characters)',
      traps: ['Plain recursion without remembering results is exponential.', 'A Set of words plus checking every substring also works for these limits; the trie avoids building substrings.'],
    },
    {
      id: 2707, title: 'Extra Characters in a String', pattern: 'Trie-guided search',
      summary: 'Split a string into dictionary words, allowing some characters to be left out. Return the fewest characters you must leave out.',
      hints: [
        'Let best[i] be the fewest extra characters in the suffix starting at i.',
        'Either character i is extra, or a dictionary word starts at i.',
        'Find every word starting at i by walking the trie from i.',
      ],
      insight: 'best[i] = min(1 + best[i + 1], best[j + 1] for every dictionary word s[i..j]); walking the trie from i lists those words without building substrings.',
      approach: [
        'Insert the dictionary into a trie. best[n] = 0.',
        'For i from n − 1 down to 0: start with best[i] = 1 + best[i + 1].',
        'Walk the trie along the string from i; at every word end at position j, set best[i] = min(best[i], best[j + 1]).',
        'Return best[0].',
      ],
      ds: ['Trie', 'DP array'], time: 'O(n²)', space: 'O(n + dictionary characters)',
      traps: ['Greedily taking the longest word at each position is wrong: a shorter word can leave a better split.'],
    },
    {
      id: 472, title: 'Concatenated Words', pattern: 'Trie-guided search',
      summary: 'From a list of distinct words, return every word that can be written as two or more shorter words from the same list.',
      hints: [
        'A word can only be made from shorter words. Process words from shortest to longest.',
        'For each word, run Word Break against the words already inserted.',
        'Insert the word afterwards, so later (longer) words can use it.',
      ],
      insight: 'Sorting by length means that, when you test a word, the trie holds exactly the shorter words; a Word Break check against it automatically uses at least two pieces.',
      approach: [
        'Sort the words by length.',
        'For each word: if the trie is not empty and a Word Break DP using the trie succeeds, add the word to the answer.',
        'Insert the word into the trie.',
      ],
      ds: ['Trie', 'DP per word', 'Sorting'], time: 'O(Σ L²) for word lengths L ≤ 30', space: 'O(total characters)',
      traps: ['A word must not use itself: checking before inserting it guarantees that.', 'Skip the check while the trie is empty.'],
    },

    // ---------- Bitwise trie ----------
    {
      id: 421, title: 'Maximum XOR of Two Numbers in an Array', pattern: 'Bitwise trie', core: true,
      summary: 'Find the largest XOR of any two numbers in an array.',
      hints: [
        'A 1 in a higher bit is worth more than all lower bits together.',
        'For a given number, the best partner disagrees with it on the highest bit possible, then the next, and so on.',
        'Store numbers as 31-bit paths in a binary trie and walk greedily towards the opposite bit.',
      ],
      insight: 'In a binary trie, choosing the opposite bit whenever it exists, from the highest bit down, builds the largest XOR for that number, because each higher bit dominates all lower ones.',
      approach: [
        'For each number: if the trie is not empty, walk it from bit 30 down to bit 0, taking the child with the opposite bit when it exists, and add that bit to the XOR when you do.',
        'Update the best XOR.',
        'Insert the number as a path of its 31 bits.',
        'Return the best value.',
      ],
      ds: ['Binary trie (two children per node)'], time: 'O(31 · n)', space: 'O(31 · n)',
      traps: [
        'Checking all pairs is 2 · 10¹⁰ operations for n = 2 · 10⁵.',
        'JavaScript bitwise operators work on 32-bit signed integers; values below 2³¹ are safe with right shifts and & 1.',
      ],
    },
    {
      id: 1707, title: 'Maximum XOR With an Element From Array', pattern: 'Bitwise trie',
      summary: 'For each query (x, m), find the maximum XOR of x with any array element not greater than m, or −1 if there is none.',
      hints: [
        'The limit m differs per query. Can you answer the queries in a helpful order?',
        'Sort the array, and sort the queries by m. Insert numbers only up to the current limit.',
        'Then each query is the ordinary greedy walk in the binary trie.',
      ],
      insight: 'Answer queries offline in increasing order of m: insert array values as they become allowed, so the trie always contains exactly the values ≤ m.',
      approach: [
        'Sort the array. Sort query indices by m.',
        'For each query in that order, insert every array value ≤ m that is not yet inserted.',
        'If the trie is empty, the answer is −1; otherwise walk greedily for the maximum XOR with x.',
        'Write each answer back at its original query index.',
      ],
      ds: ['Binary trie', 'Sorting', 'Offline queries'], time: 'O((n + q) · 30 + n log n + q log q)', space: 'O(30 · n)',
      traps: ['Remember the original order of the queries.', 'Values reach 10⁹ < 2³⁰, so 30 bits are enough.'],
    },

    // ---------- Implicit trie ----------
    {
      id: 386, title: 'Lexicographical Numbers', pattern: 'Implicit trie',
      summary: 'List the numbers from 1 to n in dictionary order, in O(n) time and O(1) extra space.',
      hints: [
        'Picture a tree where the children of a number are that number followed by each digit 0 to 9.',
        'Dictionary order is a pre-order walk of that tree.',
        'From the current number, go down (×10) if you can; otherwise move to the next sibling, going up while needed.',
      ],
      insight: 'Dictionary order is a pre-order traversal of the implicit tree of digit prefixes, and you can step to the next number with arithmetic alone.',
      approach: [
        'Start at 1 and repeat n times: output the current number.',
        'If current × 10 ≤ n, go down: current becomes current × 10.',
        'Otherwise, if current equals n, go up first (divide by 10, dropping the remainder). Then add 1.',
        'While the number ends in 0 (you just wrapped past a 9), go up by dividing by 10.',
      ],
      ds: ['Integer arithmetic'], time: 'O(n)', space: 'O(1) besides the output',
      traps: ['Sorting the numbers as strings is O(n log n) and uses extra memory, which the problem forbids.'],
    },
    {
      id: 440, title: 'K-th Smallest in Lexicographical Order', pattern: 'Implicit trie',
      summary: 'Return the k-th number in dictionary order among the integers from 1 to n, where n can be up to 10⁹.',
      hints: [
        'You cannot list 10⁹ numbers. Skip whole subtrees of the implicit prefix tree instead.',
        'How many numbers in [1, n] start with a prefix p? Count them level by level.',
        'If that count is at most k, skip the subtree and move to p + 1; otherwise step into it (p × 10).',
      ],
      insight: 'Count how many numbers ≤ n lie under a prefix; that lets you skip entire subtrees of the implicit trie, so you reach the k-th number in about (digits × 10) steps.',
      approach: [
        'Start at prefix 1 with k reduced by 1 (prefix 1 itself is the first number).',
        'Count the numbers under the prefix: first starts at the prefix and next at prefix + 1; while first ≤ n, add min(n + 1, next) − first, then multiply both by 10.',
        'If the count is ≤ k, subtract it from k and move to the next sibling (prefix + 1).',
        'Otherwise step into the subtree: prefix × 10, and subtract 1 from k. Stop when k reaches 0 and return the prefix.',
      ],
      ds: ['Integer arithmetic'], time: 'O(log² n)', space: 'O(1)',
      traps: ['The count must be capped by n at every level.', 'Intermediate values exceed 10⁹ but stay far below 2⁵³, so TypeScript numbers are exact.'],
    },
  ],
};
