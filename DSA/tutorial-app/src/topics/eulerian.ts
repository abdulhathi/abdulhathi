import type { Topic } from './types';

export const topic: Topic = {
  id: 'eulerian',
  patterns: [
    { name: 'Degree conditions', idea: 'Whether a route through every edge exists depends only on degrees (and connectivity): all even for a circuit, exactly two odd for a path; in directed graphs, in-degree equals out-degree except at the two ends.' },
    { name: "Hierholzer's algorithm", idea: 'Walk unused edges from the top of a stack; when a node has none left, pop it onto the route. Reverse the route at the end.' },
    { name: 'De Bruijn sequences', idea: 'Make every (n − 1)-character string a node and every n-character string an edge. An Eulerian circuit then lists every string of length n exactly once, overlapping.' },
  ],
  signals: [
    { see: 'Use every ticket, domino, pair or edge exactly once in one continuous route', think: "Eulerian path with Hierholzer's algorithm", why: 'A route that uses each edge once is exactly an Eulerian path.' },
    { see: 'Chain pairs so each one ends where the next begins', think: 'Pairs are directed edges; find an Eulerian path', why: 'The arrangement is a walk over all the edges, starting where out-degree exceeds in-degree.' },
    { see: 'The shortest string that contains every combination of n symbols', think: 'De Bruijn sequence via an Eulerian circuit', why: 'Each new character completes one new combination when combinations overlap in n − 1 characters.' },
    { see: 'Make all degrees even, or decide whether a drawing can be traced without lifting the pen', think: 'Count odd-degree nodes', why: 'An Eulerian circuit needs every degree even; a path allows exactly two odd nodes.' },
    { see: 'A greedy walk that keeps getting stuck before all edges are used', think: 'Hierholzer: add a node to the route only when it is stuck', why: 'Dead ends are pushed to the end of the route, and the detours are spliced in before them.' },
  ],
  problems: [
    // ---------- Degree conditions ----------
    {
      id: 2508, title: 'Add Edges to Make Degrees of All Nodes Even', pattern: 'Degree conditions',
      summary: 'You may add at most two new edges to an undirected graph, without repeating an edge or making a self-loop. Decide whether every node can end up with an even degree.',
      hints: [
        'Only nodes with odd degree matter, and there is always an even number of them.',
        'Each new edge changes the parity of its two ends, so two edges can fix at most four odd nodes.',
        'With two odd nodes a and b: join them if they are not already joined, or find a third node joined to neither and connect it to both. With four, try the three ways of pairing them.',
      ],
      insight: 'An added edge flips the parity of both its ends, so only 0, 2 or 4 odd nodes can be fixed. With 2, join them directly or through a free third node; with 4, one of the three pairings must use two edges that do not exist yet.',
      approach: [
        'Compute degrees, store every edge in a Set, and list the odd-degree nodes.',
        'No odd nodes: true. More than four: false.',
        'Two odd nodes a and b: true if a–b is not an edge, or if some other node is adjacent to neither a nor b.',
        'Four odd nodes a, b, c, d: true if one of the pairings (ab, cd), (ac, bd) or (ad, bc) uses two missing edges.',
      ],
      ds: ['Degree array', 'Set of edges'], time: 'O(n + E)', space: 'O(n + E)',
      traps: ['Store an undirected edge with the smaller endpoint first, so a–b and b–a give the same key.', 'The third node must differ from a and b and be adjacent to neither.'],
    },

    // ---------- Hierholzer's algorithm ----------
    {
      id: 332, title: 'Reconstruct Itinerary', pattern: "Hierholzer's algorithm", core: true,
      summary: 'Given airline tickets as (from, to) pairs, use every ticket exactly once to build an itinerary that starts at JFK. If several work, return the one that comes first in lexical order.',
      hints: [
        'Airports are nodes and tickets are directed edges. Using every ticket once is an Eulerian path.',
        'Always flying to the alphabetically smallest destination can strand you at a dead end before all tickets are used.',
        'Hierholzer: walk smallest destinations first, but add an airport to the route only when it has no tickets left, then reverse.',
      ],
      insight: 'The itinerary is an Eulerian path from JFK. Hierholzer\'s algorithm, taking destinations in sorted order and adding an airport to the route only once it runs out of tickets, sends dead ends to the back. The reversed route is the smallest valid itinerary.',
      approach: [
        'Group tickets by departure airport and sort each list of destinations.',
        'Start a stack with JFK.',
        'While the stack is not empty: if the airport on top still has tickets, take its smallest destination, remove that ticket and push the destination; otherwise pop the airport onto the route.',
        'Return the route reversed.',
      ],
      ds: ['Map from airport to sorted destinations', 'Stack', 'Route array'], time: 'O(E log E)', space: 'O(E)',
      traps: ['A plain greedy walk can get stuck; Hierholzer\'s "add when stuck" rule is what fixes it.', 'Two identical tickets are two separate edges; keep both.'],
    },
    {
      id: 2097, title: 'Valid Arrangement of Pairs', pattern: "Hierholzer's algorithm", core: true,
      summary: 'Arrange the given pairs [start, end] so that each pair\'s end equals the next pair\'s start. A valid arrangement is guaranteed to exist.',
      hints: [
        'Each pair is a directed edge from start to end, and an arrangement is a walk that uses every edge once.',
        'The walk must begin at a node with one more outgoing than incoming edge, if there is one; otherwise anywhere.',
        'Run Hierholzer from there and read the edges off the reversed route.',
      ],
      insight: 'Pairs are directed edges and a valid arrangement is an Eulerian path. Start where out-degree exceeds in-degree by one (or anywhere if every node is balanced) and run Hierholzer\'s algorithm.',
      approach: [
        'Build adjacency lists in a Map (values go up to 10⁹) and track out-degree minus in-degree per node.',
        'Pick the start: the node whose difference is +1, or the first pair\'s start if all are balanced.',
        'Run Hierholzer with an explicit stack, recording nodes in the order they are popped.',
        'Reverse that list and turn each pair of consecutive nodes into an output pair.',
      ],
      ds: ['Map from value to list of targets', 'Map of degree differences', 'Stack'], time: 'O(n)', space: 'O(n)',
      traps: ['With 10⁵ pairs a recursive DFS can overflow; use an explicit stack.', 'Starting at the wrong node in an unbalanced graph leaves edges unused.'],
    },

    // ---------- De Bruijn sequences ----------
    {
      id: 753, title: 'Cracking the Safe', pattern: 'De Bruijn sequences', core: true,
      summary: 'A password has n digits, each from 0 to k − 1, and the safe checks the last n digits typed after every keystroke. Return any shortest string that is sure to contain every possible password.',
      hints: [
        'There are kⁿ passwords, so the string has at least kⁿ + n − 1 characters.',
        'Let each string of n − 1 digits be a node. Typing digit d at node s moves to the last n − 1 digits of s followed by d; that edge is one password.',
        'Every node has k edges in and k edges out, so an Eulerian circuit exists. Hierholzer finds it.',
      ],
      insight: 'With (n − 1)-digit strings as nodes and n-digit passwords as edges, every node is balanced, so an Eulerian circuit uses every password exactly once. Writing it down gives a de Bruijn sequence of length kⁿ + n − 1.',
      approach: [
        'Start at the node made of n − 1 zeros, with an empty set of used passwords.',
        'From a node, try each digit d: if the password node + d is unused, mark it used, move to the new node (the password without its first digit) and continue from there.',
        'When a node has no unused passwords left, record the digit of the edge that led to it (post-order).',
        'The answer is the start node followed by the recorded digits in reverse.',
      ],
      ds: ['Set of used passwords', 'Recursion or a stack'], time: 'O(n · kⁿ)', space: 'O(n · kⁿ)',
      traps: ['The shortest length is kⁿ + n − 1: after the first password, each new digit completes exactly one more.', 'With n = 1 the start node is empty and the answer is simply every digit once.'],
    },
  ],
};
