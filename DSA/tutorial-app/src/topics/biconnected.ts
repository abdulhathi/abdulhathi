import type { Topic } from './types';

export const topic: Topic = {
  id: 'biconnected',
  patterns: [
    { name: 'Bridges', idea: 'An edge is a bridge when it lies on no cycle. One DFS with discovery times and low-links finds every bridge, and peeling leaves finds what is left when bridges hang off a cycle.' },
    { name: 'Articulation points', idea: 'A node is a cut vertex when some child subtree cannot reach above it without passing through it, or when it is a DFS root with two or more children.' },
  ],
  signals: [
    { see: '"Critical connection", "single point of failure", or an edge whose removal disconnects the network', think: 'Bridges with low-links', why: 'An edge is critical exactly when no cycle runs through it, which is what low[child] > disc[parent] detects.' },
    { see: 'A node (server, cell, city) whose removal splits the graph', think: 'Articulation points', why: 'Low-links tell you whether a subtree has another way up besides through that node.' },
    { see: 'The fewest removals to disconnect something', think: 'Check 0, then 1 (cut vertex or bridge), and look for a small upper bound', why: 'Grids and many graphs can always be disconnected in very few steps, so you only need to test small answers.' },
    { see: 'A connected graph with exactly n nodes and n edges', think: 'One cycle: peel degree-1 nodes to find it', why: 'Every edge off the cycle is a bridge, and leaf peeling strips them away.' },
  ],
  problems: [
    // ---------- Bridges ----------
    {
      id: 1192, title: 'Critical Connections in a Network', pattern: 'Bridges', core: true,
      summary: 'Servers form a connected undirected network. A connection is critical if removing it leaves some servers unable to reach others. Return all critical connections.',
      hints: [
        'Removing each edge and checking connectivity costs O(E · (V + E)): far too slow for 10⁵ edges.',
        'An edge is critical exactly when it lies on no cycle.',
        'Run one DFS with discovery times and low-links. A tree edge u–v is critical when low[v] > disc[u].',
      ],
      insight: 'A tree edge u–v is a bridge exactly when nothing in v\'s subtree can reach u or any ancestor of u without using that edge, which is the condition low[v] > disc[u].',
      approach: [
        'Build an adjacency list.',
        'DFS from node 0, giving each node a discovery time and setting its low-link to that time.',
        'For each neighbour: if unvisited, recurse, then lower low[u] to low[v] if smaller, and record u–v as critical when low[v] > disc[u]. If already visited and not the edge you arrived by, lower low[u] to disc[v] if smaller.',
        'Return the recorded edges.',
      ],
      ds: ['Adjacency list', 'Discovery time array', 'Low-link array'], time: 'O(V + E)', space: 'O(V + E)',
      traps: [
        'Skip only the edge you arrived by, not every edge to the parent. With parallel edges, a second edge to the parent is a real back edge.',
        'Recursion can go 10⁵ levels deep; an explicit stack avoids overflows.',
      ],
    },
    {
      id: 2204, title: 'Distance to a Cycle in Undirected Graph', pattern: 'Bridges',
      summary: 'A connected undirected graph has n nodes and n edges, so it contains exactly one cycle. For every node, return its distance to the nearest node on the cycle.',
      hints: ['A node of degree 1 cannot lie on the cycle: remove it, and keep removing new degree-1 nodes.', 'What remains after peeling is exactly the cycle.', 'Then run one BFS that starts from every cycle node at distance 0.'],
      insight: 'Repeatedly removing degree-1 nodes strips away every bridge and leaves exactly the cycle. A multi-source BFS from all cycle nodes then gives every node\'s distance.',
      approach: [
        'Compute degrees and queue every node of degree 1.',
        'Pop a node, mark it removed, and lower each neighbour\'s degree, queuing any that drop to 1.',
        'Every node not removed is on the cycle: give it distance 0 and put it in a BFS queue.',
        'Run the BFS outward to fill in every other distance.',
      ],
      ds: ['Adjacency list', 'Degree array', 'Queue'], time: 'O(n)', space: 'O(n)',
      traps: ['One BFS from all cycle nodes at once, not one BFS per node.', 'Low-links would also find the cycle edges (the non-bridges), but peeling is simpler when there is exactly one cycle.'],
    },

    // ---------- Articulation points ----------
    {
      id: 1568, title: 'Minimum Number of Days to Disconnect Island', pattern: 'Articulation points', core: true,
      summary: 'In a grid of land and water, each day you may turn one land cell into water. Return the fewest days needed so that the land no longer forms exactly one island.',
      hints: [
        'If the land is already not exactly one island (none, or several), the answer is 0.',
        'The answer is never more than 2: the top-most land cell (left-most among ties) has at most two land neighbours, right and below, and removing them cuts it off from the rest. Tiny islands of one to three cells are also broken within two days.',
        'So the real question is whether removing one cell is enough: is there an articulation point?',
      ],
      insight: 'The answer is 0, 1 or 2. It is 0 if the grid is not exactly one island, 1 if the island is a single cell or has an articulation point, and 2 otherwise.',
      approach: [
        'Count islands with a flood fill. If the count is not exactly 1, return 0.',
        'If the island has exactly one cell, return 1.',
        'Find articulation points with discovery times and low-links on the land cells (or, with at most 900 cells, remove each land cell in turn and recount).',
        'Return 1 if a single removal disconnects the island, otherwise 2.',
      ],
      ds: ['Grid', 'Discovery and low-link arrays, or repeated flood fill'], time: 'O(mn) with low-links, O((mn)²) by trying every cell', space: 'O(mn)',
      traps: ['A single land cell takes one day: removing it leaves zero islands.', 'Two adjacent land cells need two days: removing one still leaves one island.'],
    },
  ],
};
