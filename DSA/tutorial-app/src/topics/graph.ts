import type { Topic } from './types';

export const topic: Topic = {
  id: 'graph',
  patterns: [
    { name: 'Model and count degrees', idea: 'Decide what the nodes and edges are; often counting each node\'s edges (in-degree and out-degree) is the whole solution.' },
    { name: 'Traverse, copy and count components', idea: 'Walk the graph once with DFS or BFS to copy it, count its pieces, or check that it is a tree.' },
    { name: 'Bipartite (two-colouring)', idea: 'Colour nodes alternately while traversing; an edge between two nodes of the same colour proves an odd cycle.' },
    { name: 'Colouring', idea: 'Give neighbouring nodes different colours: greedily when the degree is small, or count colourings with DP when the structure is regular.' },
    { name: 'DAG reasoning', idea: 'In a graph without directed cycles, sources have in-degree 0, reachability is well defined, and answers can be propagated along edges.' },
    { name: 'Hamiltonian paths', idea: 'Visiting every node exactly once is hard in general; for up to about 20 nodes, use backtracking or bitmask DP.' },
    { name: 'Planar regions', idea: 'When lines cut a picture into regions, turn each piece into nodes and count the connected areas.' },
  ],
  signals: [
    { see: 'Pairs that relate two things: friends, roads, prerequisites, trust, dislikes', think: 'Model a graph: what are the nodes, what are the edges, directed or not?', why: 'Once modelled, the question usually becomes a standard graph question.' },
    { see: '"Everyone trusts X, X trusts nobody", "the centre", "the most connected"', think: 'Count in-degrees and out-degrees', why: 'Many graph facts are local to a node and need no traversal at all.' },
    { see: '"Split into two groups with no conflicts inside a group"', think: 'Bipartite check by two-colouring', why: 'A graph splits into two independent groups exactly when it has no odd cycle.' },
    { see: '"Neighbours must differ", "colour the map"', think: 'Graph colouring', why: 'Two colours: bipartite check. Few neighbours: greedy works. Counting colourings: DP over rows.' },
    { see: '"Directed graph with no cycles", ancestors, prerequisites, "who has no one above them"', think: 'DAG facts: in-degree 0 sources, propagation in topological order', why: 'Acyclic graphs allow processing nodes in an order where all predecessors come first.' },
    { see: '"Visit every node / cell exactly once" with n ≤ 20', think: 'Hamiltonian path: backtracking or bitmask DP', why: 'No efficient general algorithm is known, so the limits are kept small on purpose.' },
  ],
  problems: [
    // ---------- Model and count degrees ----------
    {
      id: 1791, title: 'Find Center of Star Graph', pattern: 'Model and count degrees',
      summary: 'A star graph has one centre connected to every other node. Given its edges, return the centre.',
      hints: ['The centre appears in every edge.', 'Two edges are enough to find it.'],
      insight: 'The centre is the only node shared by every edge, so it is whichever endpoint the first two edges have in common.',
      approach: ['Look at the first two edges.', 'Return the node that appears in both.'],
      ds: ['Edge list'], time: 'O(1)', space: 'O(1)',
      traps: ['Counting all degrees also works (the centre has degree n − 1) but reads the whole input for nothing.'],
    },
    {
      id: 997, title: 'Find the Town Judge', pattern: 'Model and count degrees', core: true,
      summary: 'In a town of n people, the judge trusts nobody and is trusted by everyone else. Given who trusts whom, return the judge, or −1.',
      hints: ['Model trust as directed edges: a → b means a trusts b.', 'What are the judge\'s in-degree and out-degree?', 'Keep one score per person: +1 for each person trusting them, −1 for each person they trust.'],
      insight: 'The judge is the unique person with in-degree n − 1 and out-degree 0, which a single score of (in-degree − out-degree) = n − 1 captures.',
      approach: ['Make an array of scores for people 1 to n.', 'For each trust pair (a, b): subtract 1 from a and add 1 to b.', 'Return the person whose score is n − 1, or −1 if nobody has it.'],
      ds: ['Array of counts'], time: 'O(n + t)', space: 'O(n)',
      traps: ['With n = 1 and no trust pairs, person 1 is the judge (score 0 = n − 1).'],
    },
    {
      id: 1615, title: 'Maximal Network Rank', pattern: 'Model and count degrees',
      summary: 'The rank of a pair of cities is the number of roads touching either city (a road joining them counts once). Return the largest rank over all pairs.',
      hints: ['The rank of (a, b) is degree(a) + degree(b), minus 1 if a and b are joined directly.', 'With n ≤ 100, checking every pair is cheap.', 'An adjacency matrix answers "are a and b joined?" in O(1).'],
      insight: 'Network rank is degree(a) + degree(b) − [a and b adjacent]; with degrees and an adjacency matrix, every pair costs O(1).',
      approach: ['Count each city\'s degree and fill a boolean adjacency matrix.', 'For every pair a < b, compute degree(a) + degree(b) − (adjacent ? 1 : 0).', 'Return the maximum.'],
      ds: ['Degree array', 'Adjacency matrix'], time: 'O(n² + roads)', space: 'O(n²)',
    },
    {
      id: 2285, title: 'Maximum Total Importance of Roads', pattern: 'Model and count degrees',
      summary: 'Assign the values 1 to n to the cities (each value once). A road\'s importance is the sum of its two cities\' values. Maximise the total importance.',
      hints: ['How many times is a city\'s value counted in the total?', 'Exactly its degree.', 'Give the largest values to the cities with the largest degree.'],
      insight: 'The total equals the sum of value × degree over cities, so pairing the largest values with the largest degrees (sorting both) maximises it.',
      approach: ['Count each city\'s degree.', 'Sort the degrees in ascending order.', 'Multiply the i-th smallest degree by i (starting at 1) and add everything up.'],
      ds: ['Degree array', 'Sorting'], time: 'O(n log n + roads)', space: 'O(n)',
      traps: ['The total can reach about 5 · 10⁹: beyond 32-bit integers, but exact in TypeScript numbers.'],
    },

    // ---------- Traverse, copy and count components ----------
    {
      id: 133, title: 'Clone Graph', pattern: 'Traverse, copy and count components', core: true,
      summary: 'Given one node of a connected undirected graph, return a deep copy of the whole graph.',
      hints: ['Traverse the graph from the given node.', 'Keep a Map from each original node to its copy.', 'When you meet a neighbour already in the Map, link to its existing copy instead of making another.'],
      insight: 'A Map from original to copy doubles as the visited set: it guarantees each node is copied once and lets cycles link back to existing copies.',
      approach: [
        'If the input is null, return null.',
        'Copy the start node and put the pair in the Map; push the original on a stack (or queue).',
        'Pop a node; for each neighbour, if it has no copy yet, create one, store it and push the neighbour.',
        'Append the neighbour\'s copy to the current node\'s copy\'s neighbour list. Return the start\'s copy.',
      ],
      ds: ['Map from node to copy', 'Stack or queue'], time: 'O(V + E)', space: 'O(V)',
      traps: ['Without the Map, a cycle makes the copy loop forever.'],
    },
    {
      id: 2685, title: 'Count the Number of Complete Components', pattern: 'Traverse, copy and count components',
      summary: 'Count the connected components in which every pair of vertices is joined by an edge.',
      hints: ['Find each component with DFS or BFS.', 'Count its vertices v and its edges e.', 'It is complete exactly when e = v(v − 1) / 2, or equivalently every vertex has degree v − 1.'],
      insight: 'A component is complete when every one of its v vertices has v − 1 neighbours, which you check while traversing it.',
      approach: [
        'Build an adjacency list.',
        'For each unvisited vertex, traverse its component, collecting its vertices.',
        'If every collected vertex has degree equal to the component size minus 1, count the component.',
      ],
      ds: ['Adjacency list', 'Visited array'], time: 'O(V + E)', space: 'O(V + E)',
      traps: ['An isolated vertex is a complete component of size 1.'],
    },
    {
      id: 1361, title: 'Validate Binary Tree Nodes', pattern: 'Traverse, copy and count components',
      summary: 'Given left and right child links for nodes 0 to n − 1, decide whether they form exactly one valid binary tree.',
      hints: ['In a tree, every node except the root has exactly one parent.', 'There must be exactly one node with no parent: the root.', 'From the root, a traversal must reach all n nodes (no separate pieces, no cycles).'],
      insight: 'A valid tree means: every in-degree ≤ 1, exactly one root with in-degree 0, and all n nodes reachable from that root.',
      approach: [
        'Count in-degrees from both child arrays; if any is 2 or more, return false.',
        'Find the nodes with in-degree 0; there must be exactly one.',
        'Traverse from it and count reachable nodes; return whether the count is n.',
      ],
      ds: ['In-degree array', 'Stack or queue'], time: 'O(n)', space: 'O(n)',
      traps: ['A cycle elsewhere can coexist with a valid-looking root: the reachability count catches it.'],
    },
    {
      id: 684, title: 'Redundant Connection', pattern: 'Traverse, copy and count components', core: true,
      summary: 'A tree had one extra edge added. Return an edge whose removal leaves a tree; if several work, the one appearing last in the input.',
      hints: ['Add edges one at a time.', 'The first edge whose endpoints are already connected closes the cycle.', 'That edge is also the last cycle edge in the input order.'],
      insight: 'Processing edges in order, the edge that joins two already-connected nodes is the one that closes the only cycle, and it is the cycle edge that appears last.',
      approach: [
        'For each edge (a, b) in order: check whether a and b are already connected (union-find, or a DFS over the edges added so far).',
        'If they are, return this edge.',
        'Otherwise join them (union, or add the edge to the adjacency list).',
      ],
      ds: ['Union-find (or adjacency list + DFS)'], time: 'O(n α(n)) with union-find, O(n²) with DFS', space: 'O(n)',
      traps: ['Union-find (Union-find chapter) is the natural tool; the DFS version works because n ≤ 1000.'],
    },

    // ---------- Bipartite (two-colouring) ----------
    {
      id: 785, title: 'Is Graph Bipartite?', pattern: 'Bipartite (two-colouring)', core: true,
      summary: 'Decide whether the nodes of an undirected graph can be split into two groups so that every edge joins the two groups.',
      hints: ['Give a node colour A; its neighbours must be B; theirs must be A again.', 'Traverse each component, assigning colours as you go.', 'A neighbour that already has the same colour as you means the answer is false.'],
      insight: 'Two-colouring during a traversal is forced: once one node is coloured, its whole component is determined, and a same-coloured edge proves an odd cycle.',
      approach: [
        'Keep a colour array, all unset.',
        'For each uncoloured node, colour it 0 and BFS (or DFS) from it.',
        'For each neighbour: if uncoloured, give it the opposite colour and enqueue it; if it has the same colour as the current node, return false.',
        'Return true after all components are done.',
      ],
      ds: ['Adjacency list (given)', 'Colour array', 'Queue'], time: 'O(V + E)', space: 'O(V)',
      traps: ['The graph may be disconnected: start a traversal from every uncoloured node.'],
    },
    {
      id: 886, title: 'Possible Bipartition', pattern: 'Bipartite (two-colouring)', core: true,
      summary: 'Split n people into two groups so that no one is in the same group as someone they dislike.',
      hints: ['People are nodes, dislikes are edges.', 'Two groups with no dislike inside a group: that is a bipartite graph.', 'Run the two-colouring check.'],
      insight: 'The split exists exactly when the dislike graph is bipartite, so build the graph and two-colour it.',
      approach: ['Build an adjacency list from the dislike pairs (people are numbered from 1).', 'Run the BFS or DFS two-colouring over every component.', 'Return false on a same-colour edge, true otherwise.'],
      ds: ['Adjacency list', 'Colour array'], time: 'O(n + d)', space: 'O(n + d)',
      traps: ['Union-find also works: union each person\'s disliked people together, and fail if a person ends up in the same set as someone they dislike.'],
    },
    {
      id: 947, title: 'Most Stones Removed with Same Row or Column', pattern: 'Bipartite (two-colouring)',
      summary: 'A stone can be removed if another remaining stone shares its row or column. Return the most stones you can remove.',
      hints: [
        'Stones that share a row or column, directly or through other stones, form a group.',
        'Within a group you can always remove all stones but one.',
        'Model rows and columns as the two sides of a bipartite graph, with each stone an edge between its row and its column.',
      ],
      insight: 'Each connected group of stones can be reduced to one stone, so the answer is (number of stones) − (number of groups); making rows and columns the nodes and stones the edges finds the groups cheaply.',
      approach: [
        'Create a node for every row and every column that holds a stone (offset columns so they do not clash with rows).',
        'For each stone, connect its row node and column node (union-find, or adjacency lists).',
        'Count the connected components among the nodes used.',
        'Return stones − components.',
      ],
      ds: ['Union-find or adjacency list', 'Map from row/column to node'], time: 'O(n α(n))', space: 'O(n)',
      traps: ['Connecting every pair of stones directly is O(n²), fine for 1000 stones but slower.'],
    },

    // ---------- Colouring ----------
    {
      id: 1042, title: 'Flower Planting With No Adjacent', pattern: 'Colouring',
      summary: 'Each garden has at most three paths to other gardens. Plant one of four flower types in each garden so connected gardens differ.',
      hints: ['Each garden has at most 3 neighbours, but there are 4 types.', 'So some type is always free.', 'Go through the gardens in any order and pick a type not used by a neighbour.'],
      insight: 'With degree at most 3 and 4 colours, greedy colouring never gets stuck: the neighbours can use at most 3 types, leaving one free.',
      approach: ['Build an adjacency list.', 'For each garden in order, collect the types already chosen by its neighbours.', 'Assign the first type from 1 to 4 that is not among them.'],
      ds: ['Adjacency list', 'Answer array'], time: 'O(n + paths)', space: 'O(n + paths)',
      traps: ['Greedy colouring is not optimal in general; it works here because of the degree bound.'],
    },
    {
      id: 1411, title: 'Number of Ways to Paint N × 3 Grid', pattern: 'Colouring',
      summary: 'Count the ways to colour an n × 3 grid with three colours so no two side-by-side or vertically adjacent cells match, modulo 10⁹ + 7.',
      hints: [
        'A valid row is either of type ABA (two colours, 6 ways) or ABC (three colours, 6 ways).',
        'Only the type of the previous row matters for counting the next row.',
        'Work out how many rows of each type can sit below a row of each type.',
      ],
      insight: 'Counting colourings row by row only needs two numbers: how many grids end in an ABA row and how many in an ABC row. Under an ABA row fit 3 ABA and 2 ABC rows; under an ABC row fit 2 of each.',
      approach: [
        'Start with aba = 6 and abc = 6 for the first row.',
        'For each further row: newAba = 3 · aba + 2 · abc and newAbc = 2 · aba + 2 · abc, taken modulo 10⁹ + 7.',
        'Return (aba + abc) modulo 10⁹ + 7.',
      ],
      ds: ['Two counters'], time: 'O(n)', space: 'O(1)',
      traps: ['Both counters stay below 10⁹ + 7, so 3 · aba + 2 · abc stays below about 5 · 10⁹: exact in TypeScript numbers, as long as you take the remainder after every row.', 'Enumerating all 12 row patterns and their compatibility also works if you do not spot the two types.'],
    },

    // ---------- DAG reasoning ----------
    {
      id: 1557, title: 'Minimum Number of Vertices to Reach All Nodes', pattern: 'DAG reasoning', core: true,
      summary: 'In a directed acyclic graph, find the smallest set of starting vertices from which every vertex can be reached.',
      hints: ['A vertex with an incoming edge can be reached from some other vertex.', 'A vertex with no incoming edge can only be reached from itself.', 'So which vertices must be in the set, and are they enough?'],
      insight: 'Vertices with in-degree 0 must be chosen, and in a DAG they are also enough, since walking backwards from any vertex always ends at one of them.',
      approach: ['Mark every vertex that appears as the target of an edge.', 'Return all unmarked vertices.'],
      ds: ['Boolean array of in-degrees'], time: 'O(n + e)', space: 'O(n)',
    },
    {
      id: 2924, title: 'Find Champion II', pattern: 'DAG reasoning',
      summary: 'In a tournament DAG, an edge a → b means a is stronger than b. Return the team nobody is stronger than, if it is unique; otherwise −1.',
      hints: ['A champion has no incoming edge.', 'Count the teams with in-degree 0.', 'If exactly one, it is the champion.'],
      insight: 'Teams with in-degree 0 are exactly those nobody beats; the champion is unique only if there is exactly one such team.',
      approach: ['Compute in-degrees from the edges.', 'Collect teams with in-degree 0.', 'Return the team if there is exactly one, else −1.'],
      ds: ['In-degree array'], time: 'O(n + m)', space: 'O(n)',
    },
    {
      id: 2192, title: 'All Ancestors of a Node in a Directed Acyclic Graph', pattern: 'DAG reasoning',
      summary: 'For every node of a DAG, list (in ascending order) all nodes that can reach it.',
      hints: ['u is an ancestor of v exactly when v is reachable from u.', 'Run a traversal from each node u and add u to the list of every node it reaches.', 'Processing u in ascending order keeps every list sorted automatically.'],
      insight: 'Ancestors are reachability read backwards: a DFS from each node, done in increasing node order, appends that node to the ancestor list of everything it reaches, in sorted order.',
      approach: ['Build an adjacency list.', 'For u from 0 to n − 1: DFS from u with a fresh visited array; for every node v reached (other than u), append u to answer[v].', 'Return the answer lists.'],
      ds: ['Adjacency list', 'Visited array per search'], time: 'O(n · (n + e))', space: 'O(n²) for the output',
      traps: ['Merging ancestor sets in topological order also works, but needs sorting and duplicate removal.'],
    },
    {
      id: 851, title: 'Loud and Rich', pattern: 'DAG reasoning',
      summary: 'Given pairs saying who is richer than whom (consistent, so no cycles) and everyone\'s quietness, return for each person the quietest person among those at least as rich.',
      hints: ['Draw an edge from a poorer person to each richer person.', 'The answer for x is the quietest of x and the answers of the people directly richer than x.', 'Memoise: compute each answer once with DFS.'],
      insight: 'In the "richer than" DAG, answer(x) = the quietest among x and answer(r) for every r directly richer than x, so a memoised DFS computes all answers in linear time.',
      approach: [
        'Build a list of directly richer people for each person.',
        'answer(x): if computed, return it. Start with x; for each richer r, compare quietness with answer(r) and keep the quieter.',
        'Store and return the result. Compute it for every person.',
      ],
      ds: ['Adjacency list', 'Memo array'], time: 'O(n + richer pairs)', space: 'O(n + richer pairs)',
    },

    // ---------- Hamiltonian paths ----------
    {
      id: 980, title: 'Unique Paths III', pattern: 'Hamiltonian paths',
      summary: 'Count the walks from the start cell to the end cell that pass over every non-obstacle cell exactly once.',
      hints: ['Count how many cells must be visited.', 'Backtrack from the start, marking cells on the path and unmarking on return.', 'At the end cell, count the walk only if every required cell has been visited.'],
      insight: 'Visiting every cell exactly once is a Hamiltonian path, which has no fast general algorithm; with at most 20 cells, backtracking with a remaining-cells counter is enough.',
      approach: [
        'Count the non-obstacle cells and find the start.',
        'DFS(cell, remaining): if the cell is the end, count 1 when remaining is 0 and return.',
        'Mark the cell, recurse into each free unmarked neighbour with remaining − 1, then unmark.',
      ],
      ds: ['Grid', 'Recursion'], time: 'O(3^(cells)) in the worst case, cells ≤ 20', space: 'O(cells)',
      traps: ['The start and end cells count as cells to visit; get the remaining count right on a tiny grid.'],
    },
    {
      id: 943, title: 'Find the Shortest Superstring', pattern: 'Hamiltonian paths',
      summary: 'Find the shortest string that contains every word in a list (up to 12 words, none inside another) as a substring.',
      hints: [
        'Placing word j right after word i saves overlap(i, j) characters: the longest suffix of i that is a prefix of j.',
        'You need an order of all words that maximises the total overlap: a Hamiltonian path, like the travelling salesman problem.',
        'Bitmask DP: best[mask][last] = largest total overlap using the words in mask and ending with last.',
      ],
      insight: 'The shortest superstring is the word order with the greatest total overlap, which is a maximum-weight Hamiltonian path solved by DP over subsets in O(n² · 2ⁿ).',
      approach: [
        'Precompute overlap[i][j] for every ordered pair.',
        'best[1 << i][i] = 0. For every mask and last word in it, try adding a word j not in mask: best[mask with j][j] = max(…, best[mask][last] + overlap[last][j]), remembering the parent.',
        'Take the best ending over the full mask, rebuild the order from the parents.',
        'Join the words in that order, adding only the non-overlapping part of each.',
      ],
      ds: ['2D overlap table', 'DP table [2ⁿ][n]', 'Parent table'], time: 'O(n² · 2ⁿ + n² · L²)', space: 'O(n · 2ⁿ)',
      traps: ['Greedily merging the pair with the largest overlap is not always optimal.', 'See the Bitmasks chapter for the DP-over-subsets technique.'],
    },

    // ---------- Planar regions ----------
    {
      id: 959, title: 'Regions Cut By Slashes', pattern: 'Planar regions',
      summary: 'An n × n grid of squares holds "/", "\\" or blanks that cut the picture. Count the regions.',
      hints: [
        'Slashes cut squares diagonally, so cells are not the right nodes.',
        'Split each square into 4 triangles (top, right, bottom, left).',
        'Join triangles that are not separated (inside a square according to its character, and across shared edges between squares), then count components.',
      ],
      insight: 'Splitting each square into four triangles turns the drawing into an ordinary graph whose connected components are exactly the regions.',
      approach: [
        'Number the triangles of square (r, c) as 4 · (r · n + c) + 0..3 for top, right, bottom, left.',
        'Inside a square: blank joins all four; "/" joins top with left and right with bottom; "\\" joins top with right and bottom with left.',
        'Across squares: join the bottom triangle with the top triangle of the square below, and the right triangle with the left triangle of the square to the right.',
        'Count the connected components (union-find or DFS).',
      ],
      ds: ['Union-find (or adjacency list)', '4 · n² nodes'], time: 'O(n² α(n))', space: 'O(n²)',
      traps: ['Remember that "\\" appears escaped in the input string.', 'Another way: scale each square up to a 3 × 3 block of pixels, draw the slashes, and flood fill.'],
    },
  ],
};
