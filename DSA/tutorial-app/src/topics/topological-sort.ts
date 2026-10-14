import type { Topic } from './types';

export const topic: Topic = {
  id: 'topological-sort',
  patterns: [
    { name: "Kahn's algorithm", idea: 'Count how many prerequisites each node still waits for, and repeatedly take a node whose count is zero. Nodes that never reach zero sit on a cycle.' },
    { name: 'DFS colouring', idea: 'White, grey, black: an edge into a grey node closes a cycle, and the reverse of the finish order is a topological order.' },
    { name: 'Peeling layers', idea: 'Remove every current source (or leaf) at once, round by round. The number of rounds is the length of the longest chain.' },
    { name: 'DP in topological order', idea: 'Process nodes so that every predecessor is finished first, then combine their answers: longest paths, earliest finish times, counts and sets.' },
    { name: 'Build the graph first', idea: 'The ordering rules hide in words, recipes, groups or matrix conditions. Turn them into edges, then sort.' },
  ],
  signals: [
    { see: 'Tasks, courses or steps with prerequisites ("a must come before b")', think: 'Topological sort', why: 'Dependencies form a directed graph, and a valid schedule is exactly a topological order of it.' },
    { see: '"Can all of them be finished?" or "return any valid order"', think: "Kahn's algorithm with a count of placed nodes", why: 'An order exists exactly when the dependency graph has no cycle, and Kahn places all n nodes only then.' },
    { see: 'The fewest rounds, semesters or days when independent tasks may run together', think: "Kahn's algorithm level by level", why: 'Each level holds everything that is ready at the same time; the number of levels is the longest chain of dependencies.' },
    { see: 'Longest path, earliest finish time, or a count over a directed graph without cycles', think: 'DP in topological order', why: 'When every predecessor is processed first, a node\'s answer is final the moment you reach it.' },
    { see: 'Words sorted in an unknown alphabet, or a list of pairwise "comes before" rules', think: 'Build a graph of rules, then sort it', why: 'Each comparison gives one edge; the alphabet or arrangement is a topological order of those edges.' },
    { see: 'A tree, and the best centre or root', think: 'Peel leaves layer by layer', why: 'Trimming leaves from the outside inward ends at the middle of the longest path.' },
    { see: 'Nodes from which every path ends safely, never entering a loop', think: 'Three-colour DFS, or Kahn on the reversed graph', why: 'A node is safe exactly when nothing it can reach lies on a cycle.' },
  ],
  problems: [
    // ---------- Kahn's algorithm ----------
    {
      id: 207, title: 'Course Schedule', pattern: "Kahn's algorithm", core: true,
      summary: 'There are n courses and a list of pairs saying one course must be taken before another. Decide whether it is possible to finish every course.',
      hints: [
        'Model each course as a node and each prerequisite pair as a directed edge.',
        'When is it impossible? Think about two courses that each require the other, or a longer loop.',
        'Count every course\'s unmet prerequisites and keep taking courses whose count is zero.',
      ],
      insight: 'Every course can be finished exactly when the prerequisite graph has no cycle. Kahn\'s algorithm checks that by counting how many courses it manages to place: all n means no cycle.',
      approach: [
        'Build an adjacency list with an edge from each prerequisite to the course that needs it, and count each course\'s in-degree.',
        'Put every course with in-degree 0 in a queue.',
        'Pop a course and count it as taken. For each course that depends on it, decrease its in-degree, and push it when the count reaches 0.',
        'At the end, the answer is whether the number of taken courses equals n.',
      ],
      ds: ['Adjacency list', 'In-degree array', 'Queue'], time: 'O(V + E)', space: 'O(V + E)',
      traps: [
        'The pair [a, b] means b must come first, so the edge goes from b to a. Getting the direction backwards still detects cycles here, but breaks Course Schedule II.',
        'A course that appears in no pair has in-degree 0 and is taken immediately.',
      ],
    },
    {
      id: 210, title: 'Course Schedule II', pattern: "Kahn's algorithm", core: true,
      summary: 'Same setting as Course Schedule, but return one order in which all courses can be taken, or an empty list if there is none.',
      hints: ['Kahn\'s algorithm already produces an order: the order in which courses leave the queue.', 'If fewer than n courses ever leave the queue, a cycle blocked the rest.'],
      insight: 'The sequence in which nodes leave Kahn\'s queue is a topological order. If it is shorter than n, some courses wait on each other forever.',
      approach: [
        'Build edges from prerequisite to course and count in-degrees.',
        'Queue every course with in-degree 0.',
        'Pop a course, append it to the order, and decrease the in-degree of each course that depends on it, pushing those that reach 0.',
        'Return the order if it has n courses, otherwise an empty list.',
      ],
      ds: ['Adjacency list', 'In-degree array', 'Queue'], time: 'O(V + E)', space: 'O(V + E)',
      traps: ['Return an empty array when there is a cycle, never a partial order.', 'Many orders are valid; any one is accepted.'],
    },

    // ---------- DFS colouring ----------
    {
      id: 802, title: 'Find Eventual Safe States', pattern: 'DFS colouring', core: true,
      summary: 'In a directed graph, a node is safe if every path that starts there ends at a node with no outgoing edges. Return all safe nodes in ascending order.',
      hints: [
        'A node is unsafe exactly when some path from it can reach a cycle.',
        'Run a DFS with three colours. Meeting a grey node again means you walked into a cycle.',
        'Alternatively, reverse every edge and run Kahn\'s algorithm from the terminal nodes, using each node\'s original out-degree as its counter.',
      ],
      insight: 'Safe nodes are the ones that cannot reach a cycle. A three-colour DFS marks a node black (safe) only after all its neighbours turned out safe; any path that runs into a grey node stays grey, which means unsafe.',
      approach: [
        'Colour every node white.',
        'DFS from a node: colour it grey. For each neighbour, if it is grey, or it is white and its DFS reports unsafe, return "unsafe" and leave this node grey.',
        'If every neighbour is safe, colour the node black and return "safe".',
        'Run this from every white node, then list the black nodes in increasing order.',
      ],
      ds: ['Adjacency list', 'Colour array'], time: 'O(V + E)', space: 'O(V)',
      traps: ['Self-loops are allowed, and a node with a self-loop is unsafe.', 'Do not reset grey nodes to white after an unsafe result; grey is the "unsafe" mark.'],
    },

    // ---------- Peeling layers ----------
    {
      id: 310, title: 'Minimum Height Trees', pattern: 'Peeling layers', core: true,
      summary: 'Given an undirected tree, return every node that gives the smallest height when the tree is rooted there.',
      hints: [
        'Trying every root with a BFS costs O(n²), too slow for 2·10⁴ nodes.',
        'The best roots sit in the middle of the longest path in the tree.',
        'Remove all leaves at once, then the new leaves, and so on, like peeling an onion. What is left at the end?',
      ],
      insight: 'The best roots are the centre of the tree\'s longest path. Peeling off every leaf layer by layer reaches that centre, which is always one node or two neighbouring nodes.',
      approach: [
        'If n is 1 or 2, every node is an answer.',
        'Compute each node\'s degree and collect all leaves (degree 1).',
        'While more than 2 nodes remain: remove the current leaves, decrease each neighbour\'s degree, and collect neighbours whose degree drops to 1 as the next layer.',
        'Return the nodes that remain.',
      ],
      ds: ['Adjacency list', 'Degree array', 'Queue'], time: 'O(n)', space: 'O(n)',
      traps: ['Stop when at most 2 nodes remain, not when the queue empties.', 'With n = 1 there are no edges; the answer is [0].'],
    },
    {
      id: 1136, title: 'Parallel Courses', pattern: 'Peeling layers',
      summary: 'Courses have prerequisite pairs. Each semester you may take any number of courses whose prerequisites are all done. Return the fewest semesters needed, or −1 if it is impossible.',
      hints: ['Each semester, take every course that is available.', 'Run Kahn\'s algorithm one whole queue level at a time and count the levels.'],
      insight: 'Processing Kahn\'s queue level by level takes every available course in the same semester. The number of levels equals the longest chain of prerequisites, which no schedule can beat.',
      approach: [
        'Build edges and in-degrees (courses are numbered from 1).',
        'Queue all courses with in-degree 0 and set semesters = 0.',
        'While the queue is not empty: add one semester and process exactly the courses that were in the queue at the start of this round, queuing the ones they free for the next round.',
        'If some course was never taken, return −1; otherwise return the number of semesters.',
      ],
      ds: ['Adjacency list', 'In-degree array', 'Queue'], time: 'O(V + E)', space: 'O(V + E)',
      traps: ['Count levels, not courses.', 'A cycle leaves courses that are never freed: the answer is −1.'],
    },
    {
      id: 2603, title: 'Collect Coins in a Tree', pattern: 'Peeling layers',
      summary: 'Some vertices of a tree hold a coin. Standing on a vertex collects every coin within distance 2. Start anywhere, collect all coins and return to the start, walking as few edges as possible.',
      hints: [
        'A leaf without a coin is never worth visiting. Remove such leaves repeatedly.',
        'Now every leaf holds a coin, but you never need to stand on it: two steps away is close enough. Remove two more layers of leaves.',
        'Every edge that is left must be walked once out and once back.',
      ],
      insight: 'Peel coinless leaves until none are left, then peel exactly two more layers of leaves (the collection radius). Every edge that survives is walked twice, so the answer is 2 × (remaining nodes − 1).',
      approach: [
        'Build adjacency sets and degrees.',
        'Use a queue to delete leaves without coins, adding a neighbour to the queue when it becomes a coinless leaf.',
        'Then remove all current leaves, and do that a second time, one layer per round.',
        'If at most one node remains, answer 0; otherwise answer 2 × (remaining nodes − 1).',
      ],
      ds: ['Adjacency sets', 'Degree array', 'Queue'], time: 'O(n)', space: 'O(n)',
      traps: ['The second phase removes exactly two layers, one for each step of the collection radius.', 'When everything collapses to one node or nothing, the walk is empty.'],
    },

    // ---------- DP in topological order ----------
    {
      id: 1462, title: 'Course Schedule IV', pattern: 'DP in topological order',
      summary: 'Prerequisites may be indirect. Answer many queries: is course u a prerequisite of course v, directly or through a chain?',
      hints: [
        'There are at most 100 courses, so you can afford to precompute an answer for every pair.',
        'Visit courses in topological order and pass each course\'s full set of prerequisites on to the courses that depend on it.',
        'A 100 × 100 table of booleans then answers every query instantly.',
      ],
      insight: 'Precompute reachability once. In topological order, the prerequisites of a course are its direct prerequisites plus all of theirs, so copying sets forward along edges fills the whole table.',
      approach: [
        'Build edges a → b (here a comes first) and in-degrees, then run Kahn\'s algorithm.',
        'Keep a boolean table where reach[x][y] means x is a prerequisite of y.',
        'When course x leaves the queue, for each course y after it: mark reach[x][y], and mark reach[z][y] for every z with reach[z][x].',
        'Answer each query by looking up reach[u][v].',
      ],
      ds: ['Adjacency list', 'Queue', 'Boolean matrix'], time: 'O(n · E + q)', space: 'O(n²)',
      traps: [
        'Here [a, b] means a comes before b, the opposite of Course Schedule I and II.',
        'Three nested loops in Floyd–Warshall style (transitive closure) also work for n ≤ 100 and are simpler to get right.',
      ],
    },
    {
      id: 2192, title: 'All Ancestors of a Node in a Directed Acyclic Graph', pattern: 'DP in topological order',
      summary: 'In a directed graph without cycles, list for every node all the nodes that can reach it, each list in ascending order.',
      hints: [
        'The ancestors of a node are its parents plus all of their ancestors.',
        'You can merge parent sets in topological order, but then you must sort and deduplicate.',
        'With at most 1000 nodes and 2000 edges, a search from every node is affordable. Start from node 0 and go up.',
      ],
      insight: 'Run a DFS from each start node s in increasing order and add s to the list of every node it reaches. Because s increases, every list comes out sorted and without duplicates.',
      approach: [
        'Build adjacency lists.',
        'For each start node s from 0 to n − 1, search the graph from s with a fresh visited set.',
        'For every node w that the search reaches (other than s), append s to ancestors[w].',
        'Return the lists; they are already sorted.',
      ],
      ds: ['Adjacency list', 'Visited set', 'Array of lists'], time: 'O(n · (n + m))', space: 'O(n²) for the output',
      traps: ['The output alone can hold about n²/2 numbers, so no method beats O(n²) here.'],
    },
    {
      id: 851, title: 'Loud and Rich', pattern: 'DP in topological order',
      summary: 'People have distinct wealth and quietness, and some "x is richer than y" facts are known. For each person, return the quietest person among everyone known to be at least as rich as them.',
      hints: [
        'Draw an edge from each richer person to the poorer one.',
        'The answer for a person is either themselves or the answer of someone directly richer than them.',
        'Process people so that everyone richer is finished first: topological order, or a memoised DFS toward richer people.',
      ],
      insight: 'answer[x] is the quietest among x and answer[y] for every y directly richer than x. Computing it in topological order (richest first) means those answers are ready when x is reached.',
      approach: [
        'Build edges richer → poorer and in-degrees; start with answer[x] = x for everyone.',
        'Run Kahn\'s algorithm from the people nobody is known to be richer than.',
        'When y leaves the queue, for each poorer x: if quiet[answer[y]] < quiet[answer[x]], set answer[x] = answer[y]. Then decrease x\'s in-degree as usual.',
        'Return the answer array.',
      ],
      ds: ['Adjacency list', 'In-degree array', 'Queue', 'Answer array'], time: 'O(n + m)', space: 'O(n + m)',
      traps: ['Compare the quietness of the current answers, not of the two people directly.', 'Everyone counts as at least as rich as themselves.'],
    },
    {
      id: 2050, title: 'Parallel Courses III', pattern: 'DP in topological order', core: true,
      summary: 'Each course takes a number of months, any number of courses can run at once, and a course can start only after its prerequisites finish. Return the minimum number of months to finish everything.',
      hints: [
        'A course can start only when its slowest prerequisite has finished.',
        'finish(c) = time(c) + the largest finish among c\'s prerequisites.',
        'Compute it in topological order; the answer is the largest finish time of all.',
      ],
      insight: 'The earliest finish of a course is its own duration plus the latest finish among its prerequisites. Evaluating that in topological order gives the length of the longest weighted chain, the critical path.',
      approach: [
        'Build edges (convert the 1-based course numbers) and in-degrees; start[c] = 0 for every course.',
        'Run Kahn\'s algorithm. When course c leaves the queue, its finish time is start[c] + time[c].',
        'For each course d after c, raise start[d] to c\'s finish time if that is later.',
        'Return the largest finish time.',
      ],
      ds: ['Adjacency list', 'In-degree array', 'Queue', 'Array of times'], time: 'O(n + m)', space: 'O(n + m)',
      traps: ['Courses are numbered from 1.', 'Take the maximum over prerequisites, never the sum: they run in parallel.'],
    },
    {
      id: 1857, title: 'Largest Color Value in a Directed Graph', pattern: 'DP in topological order',
      summary: 'Each node has a lowercase letter as its colour. The colour value of a path is how many times its most frequent colour appears on it. Return the largest colour value of any path, or −1 if the graph has a cycle.',
      hints: [
        'Kahn\'s algorithm tells you about cycles for free.',
        'For each node, keep 26 counts: the most nodes of each colour on any path that ends at that node.',
        'Push those counts forward along edges in topological order, adding one for the node\'s own colour when you process it.',
      ],
      insight: 'Let dp[v][c] be the most nodes of colour c on a path ending at v. In topological order each node hands its 26 counts to its successors (taking maximums), so every colour is tracked at once without enumerating paths.',
      approach: [
        'Build adjacency lists and in-degrees; dp is an n × 26 table of zeros.',
        'Run Kahn\'s algorithm. When v leaves the queue, add 1 to dp[v][colour of v] and update the answer with that value.',
        'For each edge v → w and each colour c, set dp[w][c] to the larger of dp[w][c] and dp[v][c]; then decrease w\'s in-degree.',
        'If fewer than n nodes left the queue, return −1; otherwise return the answer.',
      ],
      ds: ['Adjacency list', 'Queue', 'n × 26 table'], time: 'O(26 · (n + m))', space: 'O(26 · n + m)',
      traps: ['Add the node\'s own colour when it is popped, before passing counts on.', 'A self-loop is a cycle, so the answer is −1.'],
    },
    {
      id: 329, title: 'Longest Increasing Path in a Matrix', pattern: 'DP in topological order', core: true,
      summary: 'In a grid of integers, find the length of the longest path that moves up, down, left or right and goes to a strictly larger value at every step.',
      hints: [
        'A strictly increasing walk can never come back to a cell, so the moves form a graph without cycles.',
        'The longest path starting at a cell is 1 plus the longest path from its best larger neighbour.',
        'Memoise that with a DFS, or peel cells layer by layer starting from the cells with no larger neighbour.',
      ],
      insight: 'Strict increase turns the grid into a DAG, so the longest path from a cell depends only on its larger neighbours. A memoised DFS (or a level-by-level Kahn) computes each cell exactly once.',
      approach: [
        'Keep a memo table, empty at first.',
        'Longest(r, c): if it is in the memo, return it. Otherwise start at 1, and for each neighbour with a larger value take the maximum of 1 + Longest(neighbour).',
        'Store the result in the memo and return it.',
        'The answer is the largest Longest(r, c) over all cells.',
      ],
      ds: ['Grid', 'Memo table'], time: 'O(m · n)', space: 'O(m · n)',
      traps: [
        'No visited set is needed: strictly increasing moves already stop a path from repeating a cell.',
        'A long snake-shaped path can make recursion 40,000 calls deep; the layer-by-layer version avoids that.',
      ],
    },

    // ---------- Build the graph first ----------
    {
      id: 2115, title: 'Find All Possible Recipes from Given Supplies', pattern: 'Build the graph first',
      summary: 'Each recipe needs a list of ingredients, some of which are other recipes. You have unlimited amounts of some basic supplies. Return every recipe you can make.',
      hints: ['Treat each recipe as something that waits for its ingredients.', 'Track, for each recipe, how many ingredients are still missing.', 'Start a queue with the supplies. Each item that becomes available may complete recipes that use it.'],
      insight: 'This is Kahn\'s algorithm on names: a recipe\'s in-degree is its number of ingredients, supplies seed the queue, and a recipe becomes available when its count reaches zero. Recipes in a cycle, or needing something nobody has, never get there.',
      approach: [
        'Map each ingredient name to the recipes that use it, and set missing[recipe] to its number of ingredients.',
        'Put every supply in a queue.',
        'Pop an item. For each recipe that uses it, decrease missing; when it reaches 0, record the recipe and push it as a newly available item.',
        'Return the recorded recipes.',
      ],
      ds: ['Map from ingredient to recipes', 'Map of missing counts', 'Queue'], time: 'O(total ingredients)', space: 'O(total ingredients)',
      traps: ['No explicit cycle check is needed: recipes that need each other simply never complete.'],
    },
    {
      id: 269, title: 'Alien Dictionary', pattern: 'Build the graph first',
      summary: 'You are given words sorted by the rules of an unknown alien alphabet. Return a valid order of the letters, or an empty string if no order fits.',
      hints: [
        'Compare each pair of neighbouring words. The first position where they differ gives one rule: that letter comes before the other.',
        'Rules are edges between letters. The alphabet is a topological order of the letters.',
        'A word followed by its own proper prefix (such as "abc" before "ab") can never be sorted correctly.',
      ],
      insight: 'Only neighbouring words matter, and only their first differing letter: it gives one edge. A topological sort of all letters that appear is the alphabet; a cycle or a prefix violation means there is none.',
      approach: [
        'Make every letter that appears in any word a node.',
        'For each neighbouring pair, find the first index where they differ and add an edge from the first word\'s letter to the second\'s. If there is no difference and the first word is longer, return "".',
        'Run Kahn\'s algorithm over the letters.',
        'If some letter was never output, return ""; otherwise join the letters in output order.',
      ],
      ds: ['Map of letter to set of letters', 'In-degree map', 'Queue'], time: 'O(C), C = total characters', space: 'O(1) (at most 26 letters)',
      traps: [
        'Letters after the first difference tell you nothing; do not compare them.',
        'Letters that appear in no rule still belong in the answer.',
        'Store edges in a set so a repeated rule does not inflate an in-degree.',
      ],
    },
    {
      id: 2392, title: 'Build a Matrix With Conditions', pattern: 'Build the graph first',
      summary: 'Place each number from 1 to k exactly once in a k × k grid (zeros elsewhere) so that given pairs end up in strictly higher rows and other given pairs in strictly further-left columns. Return any such grid, or an empty one.',
      hints: ['Rows and columns are two separate problems.', 'A topological order of the row conditions decides each number\'s row; the column conditions decide its column.', 'Each number gets a different row and a different column, so two numbers never collide.'],
      insight: 'Run two independent topological sorts over 1..k. A number\'s position in the row order is its row, and its position in the column order is its column. If either sort hits a cycle, no grid exists.',
      approach: [
        'Topologically sort 1..k using the row conditions; if not all k numbers come out, return an empty grid.',
        'Do the same with the column conditions.',
        'Record each number\'s row and column from its position in the two orders.',
        'Fill a k × k grid of zeros and write each number at its row and column.',
      ],
      ds: ['Adjacency lists', 'In-degree arrays', 'Queue', 'k × k grid'], time: 'O(k² + n + m)', space: 'O(k²)',
      traps: ['Numbers that appear in no condition still need a place: include all of 1..k in both sorts.', 'Conditions can repeat; that is fine as long as each copy adds one edge and one in-degree.'],
    },
    {
      id: 1203, title: 'Sort Items by Groups Respecting Dependencies', pattern: 'Build the graph first',
      summary: 'Items belong to at most one group, and some items must come before others. Return an order where each group\'s items are next to each other and every rule holds, or an empty list if impossible.',
      hints: ['Give every item without a group its own new group.', 'Sort on two levels: the groups among themselves, and the items inside each group.', 'A rule between items in different groups becomes a rule between their groups.'],
      insight: 'A two-level topological sort: order the groups using the rules that cross groups, order the items using the rules inside groups, then output each group\'s items, in group order.',
      approach: [
        'Assign a fresh group number to every item whose group is −1.',
        'For each rule "a before b": if a and b share a group, add an item edge a → b; otherwise add a group edge from a\'s group to b\'s group.',
        'Topologically sort the groups and, separately, all items. If either sort finds a cycle, return an empty list.',
        'Walk the sorted items, dropping each into its group\'s bucket, then concatenate the buckets in the sorted group order.',
      ],
      ds: ['Adjacency lists', 'In-degree arrays', 'Queue', 'Bucket per group'], time: 'O(n + m + E)', space: 'O(n + m + E)',
      traps: ['Forgetting to give ungrouped items their own groups lumps them into one fake group that must be contiguous.', 'Sorting all items once and bucketing them keeps every group\'s internal order valid.'],
    },
  ],
};
