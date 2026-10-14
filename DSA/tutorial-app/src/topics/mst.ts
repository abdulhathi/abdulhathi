import type { Topic } from './types';

export const topic: Topic = {
  id: 'mst',
  patterns: [
    { name: 'Kruskal', idea: 'Sort the edges by weight and keep each edge that joins two different components, using union-find to tell.' },
    { name: 'Prim on dense graphs', idea: 'Grow one tree from a start node, always adding the cheapest edge that leaves it. On a complete graph, an O(n²) array version beats any heap.' },
    { name: 'Virtual nodes', idea: 'A per-node cost (build a well, open a station) becomes an edge to one extra imaginary node, and the problem becomes a plain spanning tree.' },
    { name: 'Edges in every or some MST', idea: 'Test one edge at a time: force it in or leave it out, rebuild, and compare the total weight with the true minimum.' },
    { name: 'Bottleneck paths', idea: 'The path whose largest edge is as small as possible always runs along a minimum spanning tree, so Kruskal\'s order answers minimax questions.' },
  ],
  signals: [
    { see: 'Connect every node (houses, cities, points) at the lowest total cost', think: 'Minimum spanning tree', why: 'A cheapest connected network never contains a cycle, so it is a spanning tree with minimum weight.' },
    { see: 'An edge list with weights and up to about 10⁵ edges', think: 'Kruskal with union-find', why: 'Sorting dominates, O(E log E), and union-find rejects cycle edges almost for free.' },
    { see: 'Points in the plane where every pair can be connected', think: 'Prim with an O(n²) array, no heap', why: 'A complete graph has n²/2 edges; scanning a distance array is cheaper than sorting all of them.' },
    { see: 'Each node may instead pay its own cost (build a well, install a generator)', think: 'Add a virtual node joined to every node by that cost', why: 'Paying for a node\'s own supply is the same as connecting it to an imaginary source.' },
    { see: 'Which edges are in every MST, or in some MST', think: 'Rebuild the MST without the edge and with the edge forced in', why: 'An edge is critical if leaving it out raises the total; pseudo-critical if forcing it in keeps the total minimal.' },
    { see: 'Minimise the largest edge on a path, or maximise the smallest', think: 'Kruskal order or a minimax search', why: 'Bottleneck paths lie on a minimum (or maximum) spanning tree.' },
  ],
  problems: [
    // ---------- Kruskal ----------
    {
      id: 1135, title: 'Connecting Cities With Minimum Cost', pattern: 'Kruskal',
      summary: 'Cities can be joined by roads with given costs. Return the minimum total cost to connect all cities, or −1 if it is impossible.',
      hints: ['A cheapest network that connects everything never has a cycle: it is a spanning tree.', 'Sort the roads by cost and take each one that joins two separate groups.', 'If you end with fewer than n − 1 roads, the cities cannot all be connected.'],
      insight: 'This is exactly the minimum spanning tree. Kruskal\'s algorithm takes the cheapest road that joins two different components until n − 1 roads are chosen.',
      approach: [
        'Sort the roads by cost.',
        'Create a union-find over the cities (numbered from 1).',
        'For each road in order, if its ends are in different components, union them and add its cost.',
        'If n − 1 roads were taken, return the total; otherwise return −1.',
      ],
      ds: ['Edge list', 'Sorting', 'Union-find'], time: 'O(E log E)', space: 'O(n)',
      traps: ['Check the edge count at the end; a disconnected input needs −1.'],
    },

    // ---------- Prim on dense graphs ----------
    {
      id: 1584, title: 'Min Cost to Connect All Points', pattern: 'Prim on dense graphs', core: true,
      summary: 'Connect all points in the plane so every point can reach every other. Joining two points costs their Manhattan distance. Return the minimum total cost.',
      hints: ['Every pair of points is a possible edge, so the graph is complete.', 'Kruskal works but must sort about 500,000 edges.', 'Prim with a plain array of "cheapest connection to the tree" needs no edge list at all.'],
      insight: 'On a complete graph, Prim\'s algorithm with an O(n²) array is the natural fit: keep each outside point\'s cheapest distance to the tree, add the closest point, and update the others from it.',
      approach: [
        'best[v] = ∞ for every point, best[0] = 0, and nothing is in the tree yet.',
        'Repeat n times: pick the point outside the tree with the smallest best value, add it to the tree and add that value to the total.',
        'For every point still outside, compute its Manhattan distance to the new point and lower its best value if that is smaller.',
        'Return the total.',
      ],
      ds: ['Points array', 'Distance array', 'Boolean array (in tree)'], time: 'O(n²)', space: 'O(n)',
      traps: ['Building and sorting all n²/2 edges also passes but uses much more memory and time.', 'With one point, the answer is 0.'],
    },

    // ---------- Virtual nodes ----------
    {
      id: 1168, title: 'Optimize Water Distribution in a Village', pattern: 'Virtual nodes',
      summary: 'Each house can get water by building its own well (at a cost per house) or by a pipe to another house that has water (at a cost per pipe). Return the minimum total cost to supply every house.',
      hints: ['A well is a special kind of connection: to a source of water.', 'Add an imaginary node 0, the water source, with an edge to each house costing that house\'s well.', 'Now every house just needs to be connected to node 0.'],
      insight: 'Model each well as an edge from an imaginary source node to the house. Then the cheapest plan is a minimum spanning tree over the houses plus the source.',
      approach: [
        'Create edges (0, house i, well cost i) for every house.',
        'Add every pipe as an edge (it may appear several times; that is fine).',
        'Run Kruskal over n + 1 nodes.',
        'Return the total weight.',
      ],
      ds: ['Edge list', 'Sorting', 'Union-find'], time: 'O((n + P) log(n + P))', space: 'O(n + P)',
      traps: ['Houses are numbered from 1, which leaves 0 free for the source node.', 'Several pipes may join the same two houses; Kruskal keeps the cheapest automatically.'],
    },

    // ---------- Edges in every or some MST ----------
    {
      id: 1489, title: 'Find Critical and Pseudo-Critical Edges in Minimum Spanning Tree', pattern: 'Edges in every or some MST', core: true,
      summary: 'In a connected weighted graph, find the edges that are in every minimum spanning tree (critical) and those that are in some but not all (pseudo-critical).',
      hints: ['First compute the true minimum weight with Kruskal.', 'An edge is critical if building the MST without it costs more (or cannot connect the graph).', 'A non-critical edge is pseudo-critical if building the MST with it forced in still reaches the minimum.'],
      insight: 'Test each edge with two extra Kruskal runs: leaving it out tells you whether it is critical, forcing it in tells you whether some MST can use it. With at most 200 edges, that is cheap.',
      approach: [
        'Sort the edges once (keep their original indices) and compute the minimum weight W.',
        'For each edge e: run Kruskal skipping e. If the result is larger than W, or the graph is not connected, e is critical.',
        'Otherwise, run Kruskal with e united first. If the result equals W, e is pseudo-critical.',
        'Return both lists of original indices.',
      ],
      ds: ['Edge list with indices', 'Union-find'], time: 'O(E² α(n))', space: 'O(n + E)',
      traps: ['Sort once and keep original indices; the answer uses them.', 'Check pseudo-critical only for edges that are not critical.'],
    },

    // ---------- Bottleneck paths ----------
    {
      id: 1631, title: 'Path With Minimum Effort', pattern: 'Bottleneck paths', core: true,
      summary: 'Walk from the top-left to the bottom-right of a grid of heights. A route\'s effort is its largest height difference between neighbouring cells. Return the smallest possible effort.',
      hints: ['The route cost is its largest single step: a bottleneck path.', 'Make an edge between every pair of neighbouring cells, weighted by their height difference, and sort the edges.', 'Add edges from the smallest up with union-find; the moment the two corners connect, the current edge weight is the answer.'],
      insight: 'Kruskal\'s order solves minimax paths: adding edges from smallest weight upward, the first edge that connects start and end is the smallest possible bottleneck.',
      approach: [
        'Create an edge for each pair of neighbouring cells with weight = absolute height difference.',
        'Sort the edges by weight.',
        'Union their endpoints in order; after each union, check whether the start and end cells share a root.',
        'When they do, return the weight of the edge just added (or 0 for a single-cell grid).',
      ],
      ds: ['Edge list', 'Sorting', 'Union-find'], time: 'O(mn log(mn))', space: 'O(mn)',
      traps: ['The same problem is solved with Dijkstra (max in place of plus) in the Shortest paths chapter; know both views.'],
    },
    {
      id: 1724, title: 'Checking Existence of Edge Length Limited Paths II', pattern: 'Bottleneck paths',
      summary: 'Design a class built from a weighted undirected graph that answers many queries: is there a path between p and q using only edges strictly shorter than a limit? Queries arrive one at a time.',
      hints: ['Queries come online, so you cannot sort them as in the offline version.', 'The best path for any limit runs along a minimum spanning forest.', 'Build Kruskal\'s union-find without path compression and remember, for every node, the weight at which it was attached to its parent.'],
      insight: 'Minimax paths lie on the minimum spanning forest. A union-find built by Kruskal (union by rank, no path compression) records the edge weight of every parent link; walking up from p and q through links lighter than the limit tells you whether they meet.',
      approach: [
        'Sort the edges and run Kruskal with union by rank but no path compression; when a root is attached under another, store the edge weight on that link.',
        'For a query, walk from p toward its root, following only links whose stored weight is below the limit; do the same from q.',
        'The answer is whether the two walks stop at the same node.',
      ],
      ds: ['Union-find without path compression', 'Weight per parent link'], time: 'O(E log E) to build, O(log n) per query', space: 'O(n)',
      traps: ['Path compression would destroy the recorded weights, so union by rank alone keeps the depth logarithmic.', 'An MST plus binary lifting for the maximum edge on a path is the textbook alternative.'],
    },
    {
      id: 3600, title: 'Maximize Spanning Tree Stability with Upgrades', pattern: 'Bottleneck paths',
      summary: 'Some edges must be in the spanning tree. You may double the strength of up to k optional edges. The stability of a spanning tree is its weakest edge. Return the largest possible stability, or −1 if no valid spanning tree exists.',
      hints: ['If the required edges form a cycle, no spanning tree can contain them all: return −1.', 'Binary search on the stability X: can you build a spanning tree whose every edge is at least X?', 'For a fixed X: add the required edges, then free optional edges with strength ≥ X, then upgraded edges (2s ≥ X) only when they join components, counting upgrades.'],
      insight: 'Feasibility is monotone in X, so binary search it. For a fixed X, union-find greedily uses required edges, then optional edges that are already strong enough, and only then spends upgrades on edges that join two components.',
      approach: [
        'If the required edges contain a cycle, or the whole graph is disconnected, return −1.',
        'Binary search X between 1 and twice the largest strength.',
        'Check X: every required edge must have strength ≥ X; union them all; union optional edges with strength ≥ X; then union optional edges with 2s ≥ X, counting each successful union as one upgrade.',
        'X is feasible if the upgrades used are at most k and everything is connected. Return the largest feasible X.',
      ],
      ds: ['Union-find', 'Binary search'], time: 'O(E α(n) log S)', space: 'O(n)',
      traps: ['Required edges cannot be upgraded.', 'Using free edges before upgraded ones never costs an extra upgrade, because each union removes one component either way.'],
    },
  ],
};
