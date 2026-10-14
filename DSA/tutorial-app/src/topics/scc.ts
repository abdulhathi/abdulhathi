import type { Topic } from './types';

export const topic: Topic = {
  id: 'scc',
  patterns: [
    { name: 'Condensation', idea: 'Shrink every strongly connected component to one node. What remains has no cycles, so questions about reachability become questions about a DAG.' },
    { name: 'Functional graphs', idea: 'When every node has exactly one outgoing edge, every component is one cycle with trees flowing into it. Peel the trees, then measure the cycles.' },
  ],
  signals: [
    { see: '"Every node can reach every other node" inside a group of a directed graph', think: 'Strongly connected components (Kosaraju or Tarjan)', why: 'That mutual reachability is exactly the definition of a strongly connected component.' },
    { see: 'Reachability or "can it loop forever?" questions on a directed graph that may have cycles', think: 'Condense the graph into its components', why: 'The graph of components is a DAG, where cycles no longer get in the way.' },
    { see: 'The fewest starting points from which everything is reachable', think: 'Sources of the condensation (components with no incoming edges)', why: 'A component with an incoming edge can be reached from elsewhere; one without cannot.' },
    { see: 'Each node points to exactly one next node (favourite person, next index, edges[i])', think: 'Functional graph: peel in-degree-0 nodes, the rest are cycles', why: 'Following a single out-edge from anywhere must end in a cycle, so every component is a cycle with incoming trees.' },
    { see: 'The longest cycle, or what happens if you keep following pointers', think: 'Walk with timestamps, or peel trees first', why: 'In a functional graph each walk is a chain that ends in exactly one cycle.' },
  ],
  problems: [
    // ---------- Condensation ----------
    {
      id: 1557, title: 'Minimum Number of Vertices to Reach All Nodes', pattern: 'Condensation', core: true,
      summary: 'In a directed graph without cycles, find the smallest set of vertices from which every node can be reached.',
      hints: ['A node with an incoming edge can be reached from the node that points to it.', 'Which nodes can never be reached from anywhere else?'],
      insight: 'In a DAG the answer is exactly the nodes with in-degree 0: nothing reaches them, so they must be chosen, and every other node can be traced back to one of them.',
      approach: ['Mark every node that is the target of some edge.', 'Return all unmarked nodes.'],
      ds: ['Boolean array'], time: 'O(n + E)', space: 'O(n)',
      traps: ['In a graph with cycles, apply the same rule to the condensation: choose one node from each component that has no incoming edge from another component.'],
    },
    {
      id: 802, title: 'Find Eventual Safe States', pattern: 'Condensation', core: true,
      summary: 'A node is safe if every path that starts there ends at a node with no outgoing edges. Return all safe nodes in ascending order.',
      hints: ['A node is unsafe exactly when some path from it can enter a cycle.', 'Cycles live inside strongly connected components with more than one node, or on self-loops.', 'A simpler route: reverse the edges and run Kahn\'s algorithm from the nodes with no outgoing edges.'],
      insight: 'Unsafe nodes are those that can reach a non-trivial strongly connected component. Reversing every edge and peeling from the terminal nodes (Kahn on out-degrees) removes exactly the safe nodes.',
      approach: [
        'Count each node\'s out-degree and build the reversed adjacency list.',
        'Queue every node with out-degree 0: they are terminal and safe.',
        'Pop a node, mark it safe, and for each node that points to it, decrease that node\'s out-degree; queue it when it reaches 0.',
        'Return the safe nodes in ascending order.',
      ],
      ds: ['Reversed adjacency list', 'Out-degree array', 'Queue'], time: 'O(V + E)', space: 'O(V + E)',
      traps: ['A self-loop makes a node unsafe; its out-degree never reaches 0, so this happens automatically.', 'The same problem appears in Topological sort with a three-colour DFS; know both.'],
    },
    {
      id: 1059, title: 'All Paths from Source Lead to Destination', pattern: 'Condensation',
      summary: 'In a directed graph, decide whether every path that starts at source eventually ends at destination: no path may stop somewhere else or loop forever.',
      hints: ['A path that reaches a node with no outgoing edges must be standing on destination.', 'A path that can loop forever is a failure, so look for cycles reachable from source.', 'Use a three-colour DFS from source.'],
      insight: 'Every path ends at destination exactly when, among the nodes reachable from source, there is no cycle and destination is the only dead end. One three-colour DFS checks both.',
      approach: [
        'DFS from source. Entering a node colours it grey.',
        'If the node has no outgoing edges, it must be destination; otherwise return false.',
        'An edge to a grey node means a reachable cycle: return false.',
        'Colour finished nodes black and skip them later. If the DFS completes, return true.',
      ],
      ds: ['Adjacency list', 'Colour array'], time: 'O(V + E)', space: 'O(V)',
      traps: ['Destination must itself have no outgoing edges, or paths could continue past it.', 'Self-loops count as cycles.'],
    },

    // ---------- Functional graphs ----------
    {
      id: 2360, title: 'Longest Cycle in a Graph', pattern: 'Functional graphs', core: true,
      summary: 'Each node has at most one outgoing edge. Return the length of the longest cycle, or −1 if there is none.',
      hints: ['With at most one outgoing edge, following edges from a node traces a single chain.', 'Walk from each unvisited node, stamping each node with the step at which you first reached it.', 'If a walk meets a node stamped during the same walk, you found a cycle; its length is the difference of the stamps.'],
      insight: 'Every walk is a simple chain that may end in a cycle. Stamping nodes with a global time and remembering when each walk began finds each cycle exactly once, with its length as a difference of stamps.',
      approach: [
        'Keep a stamp for every node (0 = unvisited) and a running time.',
        'For each unvisited node, note the start time and follow edges, stamping each new node with the next time.',
        'Stop at −1 or at an already-stamped node. If that node\'s stamp is at least this walk\'s start time, the cycle length is the next stamp you would have handed out minus that node\'s stamp.',
        'Return the longest length found, or −1.',
      ],
      ds: ['Array of next pointers', 'Timestamp array'], time: 'O(n)', space: 'O(n)',
      traps: ['A node stamped by an earlier walk leads to a cycle already counted (or to a dead end); do not count it again.', 'Kosaraju or Tarjan also work, but this graph shape allows a simpler walk.'],
    },
    {
      id: 2876, title: 'Count Visited Nodes in a Directed Graph', pattern: 'Functional graphs',
      summary: 'Every node has exactly one outgoing edge. For each node, count how many different nodes a walk from it visits before it reaches a node it has already seen.',
      hints: ['Every walk ends in a cycle, and a node on a cycle visits exactly the cycle.', 'A node off the cycle visits itself plus everything its successor visits.', 'Find the cycle nodes by peeling in-degree-0 nodes (Kahn); then fill in the tails in reverse peel order.'],
      insight: 'The graph is cycles with trees flowing into them. Cycle nodes answer their cycle\'s length; every other node answers 1 + its successor\'s answer, which is ready if you process the trees from the cycle outward.',
      approach: [
        'Compute in-degrees and peel nodes with in-degree 0 using a queue, recording the order. Nodes never peeled lie on cycles.',
        'For each cycle, walk around it once to measure its length and assign that length to all its nodes.',
        'Go through the peeled nodes in reverse order: each answer is 1 + the answer of the node it points to.',
        'Return the answers.',
      ],
      ds: ['Array of next pointers', 'In-degree array', 'Queue'], time: 'O(n)', space: 'O(n)',
      traps: ['Reverse peel order guarantees the successor is already answered.', 'A recursive version can overflow the stack on long tails; the queue version cannot.'],
    },
    {
      id: 2127, title: 'Maximum Employees to Be Invited to a Meeting', pattern: 'Functional graphs',
      summary: 'Each employee has one favourite colleague and attends only if seated next to them at a round table. Return the largest number of employees that can be invited.',
      hints: [
        'Draw an edge from each employee to their favourite. Every node has out-degree one, so the graph is cycles with trees flowing into them.',
        'A cycle of length 3 or more can sit around the table, but only by itself.',
        'Cycles of length 2 (mutual favourites) are special: each partner can bring the longest chain of fans leading to them, and all such pairs can share one table.',
      ],
      insight: 'The answer is the larger of two options: the longest cycle of length at least 3, or the sum over every mutual pair of 2 + the longest fan chain into each partner. Long cycles fill the table alone; pairs with their chains sit side by side.',
      approach: [
        'Peel nodes with in-degree 0 (Kahn). When a node is peeled, update its favourite\'s longest incoming chain: chain[fav] = max(chain[fav], chain[node] + 1).',
        'The nodes left are on cycles. Measure each cycle once.',
        'For a cycle of length 2 with partners a and b, add chain[a] + chain[b] + 2 to a running sum.',
        'Return the larger of the longest cycle of length 3 or more and that sum.',
      ],
      ds: ['Array of favourites', 'In-degree array', 'Queue', 'Chain length array'], time: 'O(n)', space: 'O(n)',
      traps: ['All mutual pairs (with their chains) fit at one table, so their totals add up; long cycles cannot be combined with anything.', 'chain[x] counts the fans leading to x, not x itself.'],
    },
  ],
};
