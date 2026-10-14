import type { Topic } from './types';

export const topic: Topic = {
  id: 'network-flow',
  patterns: [
    { name: 'Max flow and min cut', idea: 'Model the problem as a network with capacities, push flow along augmenting paths, and read the answer from the maximum flow or from the minimum cut it reveals.' },
    { name: 'Bipartite matching', idea: 'Pair items from two sides with no item used twice. Augmenting paths grow the matching one pair at a time; König\'s theorem turns it into vertex covers and independent sets.' },
    { name: 'Assignment problems', idea: 'Pair everyone on one side with someone on the other at minimum (or maximum) total cost. The Hungarian algorithm solves it in O(n³); with n ≤ 15 or so, bitmask DP is simpler.' },
    { name: 'Min-cost flow', idea: 'When connections carry a cost as well as a capacity, repeatedly send flow along the cheapest augmenting path (successive shortest paths).' },
    { name: 'Counting matchings', idea: 'Counting perfect matchings is not a flow problem at all. With one small side, DP with a bitmask over that side counts them.' },
  ],
  signals: [
    { see: 'Things move from sources to sinks through links with limits (pipes, roads, supply and demand)', think: 'Maximum flow', why: 'Capacities on edges and conservation at nodes are exactly a flow network.' },
    { see: 'The cheapest set of edges or nodes to cut so that A can no longer reach B', think: 'Minimum cut = maximum flow', why: 'The max-flow min-cut theorem says the smallest cut capacity equals the largest flow.' },
    { see: 'Pair items from two groups, each used at most once, as many pairs as possible', think: 'Bipartite maximum matching', why: 'Augmenting paths find the largest matching; it is max flow with unit capacities.' },
    { see: 'Remove the fewest nodes so no two neighbours remain, on a grid or a two-colourable graph', think: 'König: minimum vertex cover = maximum matching', why: 'In bipartite graphs the hard vertex cover problem becomes a matching problem.' },
    { see: 'Assign n people to n tasks at minimum or maximum total cost', think: 'Hungarian algorithm, or bitmask DP when n ≤ about 15', why: 'It is a minimum-cost perfect matching; 2ⁿ states fit when n is small.' },
    { see: 'LeetCode tags a problem with flow or matching, but the input sizes are tiny (8 to 14)', think: 'Try bitmask DP first', why: 'Many such problems are designed for DP over subsets; flow is the general tool, not always the expected one.' },
  ],
  problems: [
    // ---------- Max flow and min cut ----------
    {
      id: 1605, title: 'Find Valid Matrix Given Row and Column Sums', pattern: 'Max flow and min cut', core: true,
      summary: 'Build any matrix of non-negative integers whose row sums and column sums match the given lists. A solution is guaranteed to exist.',
      hints: [
        'As a network: the source sends rowSum[i] to row i, every row can send any amount to every column, and column j sends colSum[j] to the sink. A full flow is a valid matrix.',
        'Because every row connects to every column, you do not need a flow algorithm.',
        'Put min(rowSum[i], colSum[j]) in a cell and subtract it from both. One of them reaches zero, so move past that row or column.',
      ],
      insight: 'The matrix is a flow from rows to columns. Since every row may send to every column, a greedy fill always succeeds: each cell takes the smaller of the remaining row sum and column sum, which finishes a row or a column at every step.',
      approach: [
        'Start with a zero matrix and two indices, i on rows and j on columns.',
        'Set cell (i, j) to the smaller of the remaining rowSum[i] and colSum[j], and subtract that value from both.',
        'Move i on if the row is used up, and j on if the column is used up (both if both).',
        'Stop when either index runs out; the totals are equal, so both finish together.',
      ],
      ds: ['Matrix', 'Two indices'], time: 'O(m · n) to create the matrix, O(m + n) to fill it', space: 'O(m · n)',
      traps: ['Many valid answers exist; any one is accepted.', 'Filling every cell with the same rule (in row order) also works; the two indices just skip cells that stay 0.'],
    },
    {
      id: 2123, title: 'Minimum Operations to Remove Adjacent Ones in Matrix', pattern: 'Max flow and min cut',
      summary: 'In a binary matrix, one operation turns a 1 into a 0. Return the fewest operations so that no two 1s are horizontally or vertically adjacent.',
      hints: [
        'Make every 1 a node and every pair of adjacent 1s an edge. You must delete a set of nodes that touches every edge: a minimum vertex cover.',
        'Colour the grid like a chessboard. Every edge joins a black cell to a white cell, so the graph is bipartite.',
        'In a bipartite graph, the minimum vertex cover equals the maximum matching (König\'s theorem).',
      ],
      insight: 'The 1s form a bipartite graph under chessboard colouring, and the fewest deletions is its minimum vertex cover, which equals the maximum matching. Hopcroft–Karp (or max flow with unit capacities) computes it.',
      approach: [
        'Put 1-cells with even row + column on the left side and odd ones on the right; join adjacent 1s.',
        'Find a maximum matching with augmenting paths: Hopcroft–Karp for large grids, or Kuhn\'s algorithm for small ones.',
        'Return the size of the matching.',
      ],
      ds: ['Bipartite adjacency list', 'Matching arrays', 'Queue for BFS layers'], time: 'O(E √V) with Hopcroft–Karp', space: 'O(V + E)',
      traps: ['Minimum vertex cover is hard on general graphs; only the bipartite structure makes it a matching.', 'Plain Kuhn\'s algorithm can be too slow on the largest grids; Hopcroft–Karp augments many paths per phase.'],
    },

    // ---------- Bipartite matching ----------
    {
      id: 1820, title: 'Maximum Number of Accepted Invitations', pattern: 'Bipartite matching',
      summary: 'Boys can invite girls they are friends with. Each boy invites at most one girl and each girl accepts at most one invitation. Return the most invitations that can be accepted.',
      hints: ['Boys and girls are the two sides of a bipartite graph.', 'You want the largest set of boy–girl pairs where nobody appears twice: a maximum matching.', 'For each boy, look for a free girl, or a taken girl whose partner can move to someone else.'],
      insight: 'The answer is a maximum bipartite matching. Each boy searches for an augmenting path: a free girl, or a taken girl whose current partner can be moved to another girl, recursively.',
      approach: [
        'Set every girl\'s partner to "none".',
        'For each boy, run a DFS with a fresh visited set over the girls he can invite.',
        'For a girl not yet visited in this search: if she is free, or her partner can find another girl, give her to this boy and report success.',
        'Count the boys whose search succeeded.',
      ],
      ds: ['Friendship grid', 'Matching array', 'Visited set per search'], time: 'O(V · E)', space: 'O(V)',
      traps: ['Reset the visited set for every boy.', 'Greedily giving each boy his first free girl can block later boys; augmenting paths undo such choices.'],
    },
    {
      id: 1349, title: 'Maximum Students Taking Exam', pattern: 'Bipartite matching', core: true,
      summary: 'Seats form a grid and some are broken. A student can see the papers of students to the left, right, upper-left and upper-right. Seat as many students as possible so that nobody can cheat.',
      hints: [
        'Rows have at most 8 seats: describe a row\'s seating as an 8-bit mask.',
        'A mask is valid if it uses only good seats and has no two side-by-side students; it fits under the previous row\'s mask if no student has someone at the upper-left or upper-right.',
        'DP over rows keeps the best total for every valid mask. The graph view also works: every conflict joins seats in columns of different parity, so the conflict graph is bipartite.',
      ],
      insight: 'With at most 8 columns, row-by-row bitmask DP fits the limits: keep the best total for each valid mask of the current row, built from compatible masks of the row above. The flow view: conflicts join odd and even columns, so the graph is bipartite, and the answer is good seats − maximum matching (the largest independent set).',
      approach: [
        'For each row, compute the mask of good seats.',
        'Keep a table from masks of the previous row to the best total so far, starting with the empty mask at 0.',
        'For each mask of the current row that uses only good seats and has no two adjacent students, combine it with every previous mask that has nobody at its upper-left or upper-right, and store the best previous total plus the number of students in the mask.',
        'Return the largest total after the last row.',
      ],
      ds: ['Bitmasks', 'Table of size 2ⁿ per row'], time: 'O(m · 4ⁿ)', space: 'O(2ⁿ)',
      traps: [
        'Students directly in front or behind do not conflict; only side and diagonal neighbours do.',
        'Two side-by-side students show up as overlapping bits when the mask is shifted by one place; the same shift test catches diagonal conflicts with the previous row.',
      ],
    },

    // ---------- Assignment problems ----------
    {
      id: 1029, title: 'Two City Scheduling', pattern: 'Assignment problems', core: true,
      summary: 'Fly 2n people to two cities so that exactly n arrive in each, minimising the total flight cost.',
      hints: ['Imagine sending everyone to city B, then moving n of them to city A.', 'Moving person i changes the total by costA − costB.', 'Move the n people for whom that change is smallest.'],
      insight: 'Start with everyone in B. Moving person i to A changes the total by costA[i] − costB[i], so sort by that difference and send the first half to A. It is also a small min-cost flow (hence the Hungarian tag), but here the greedy is exact.',
      approach: ['Sort people by costA − costB.', 'Send the first n people to city A and the rest to city B.', 'Add up the matching costs.'],
      ds: ['Array', 'Sorting'], time: 'O(n log n)', space: 'O(1) besides the sort',
      traps: ['Sorting by costA alone is wrong; only the difference between the two cities matters.'],
    },
    {
      id: 1947, title: 'Maximum Compatibility Score Sum', pattern: 'Assignment problems', core: true,
      summary: 'Pair m students with m mentors one-to-one so that the total number of matching survey answers is as large as possible.',
      hints: ['Precompute the score of every student–mentor pair.', 'With m ≤ 8 you could try all 40,320 pairings, or use DP over the set of mentors already used.', 'In general this is the assignment problem, which the Hungarian algorithm solves in O(m³).'],
      insight: 'It is a maximum-weight perfect matching. For m ≤ 8, DP over the set of used mentors (assigning students in order) is the simplest exact method; the Hungarian algorithm is the scalable one.',
      approach: [
        'Precompute score[i][j] for every student i and mentor j.',
        'dp[set] = best total when the first k students (k = size of the set) are assigned to exactly the mentors in the set; dp[empty] = 0.',
        'From each set, give student k each unused mentor j and update dp[set plus j] with dp[set] + score[k][j].',
        'Return dp of the full set.',
      ],
      ds: ['Score matrix', 'DP array of size 2ᵐ'], time: 'O(m · 2ᵐ + m² · n)', space: 'O(2ᵐ)',
      traps: ['The student to assign next is the number of mentors already in the set; no extra state needed.', 'Pairing the best-scoring pair first and repeating can miss the optimum.'],
    },
    {
      id: 1066, title: 'Campus Bikes II', pattern: 'Assignment problems',
      summary: 'Workers and bikes sit on a grid (at most 10 bikes, at least as many as workers). Give each worker a different bike so that the total Manhattan distance is as small as possible.',
      hints: ['This is a minimum-cost matching of workers to bikes.', 'With at most 10 bikes, DP over the set of used bikes has only 1024 states.', 'Assign workers in order: the next worker is the number of bikes already used.'],
      insight: 'A minimum-cost bipartite matching. With at most 10 bikes, DP over the set of used bikes is enough; the Hungarian algorithm or min-cost flow would scale further.',
      approach: [
        'dp[set] = smallest total after the first k workers (k = size of the set) got exactly the bikes in the set; dp[empty] = 0.',
        'From each set with k smaller than the number of workers, give worker k each unused bike b and update dp[set plus b].',
        'Return the smallest dp among sets that contain exactly as many bikes as there are workers.',
      ],
      ds: ['DP array of size 2ᵐ'], time: 'O(m · 2ᵐ)', space: 'O(2ᵐ)',
      traps: ['There may be more bikes than workers; the answer is the best set of the right size.', 'Nearest-bike-first greedy is not optimal.'],
    },
    {
      id: 1879, title: 'Minimum XOR Sum of Two Arrays', pattern: 'Assignment problems',
      summary: 'Rearrange nums2 so that the sum of nums1[i] XOR nums2[i] over all positions is as small as possible, and return that sum.',
      hints: ['Rearranging nums2 means giving each element of nums1 a different element of nums2: an assignment problem.', 'n ≤ 14, so DP over the set of used nums2 elements has 16,384 states.', 'The next nums1 index is the number of elements already used.'],
      insight: 'A minimum-cost perfect matching where pairing a with b costs a XOR b. With n ≤ 14, DP over the set of used nums2 elements runs in O(n · 2ⁿ); the Hungarian algorithm would take O(n³).',
      approach: [
        'dp[set] = smallest sum after pairing the first k elements of nums1 (k = size of the set) with the nums2 elements in the set; dp[empty] = 0.',
        'From each set, pair nums1[k] with each unused nums2[j] and update dp[set plus j] with dp[set] + (nums1[k] XOR nums2[j]).',
        'Return dp of the full set.',
      ],
      ds: ['DP array of size 2ⁿ'], time: 'O(n · 2ⁿ)', space: 'O(2ⁿ)',
      traps: ['Trying all 14! ≈ 8.7·10¹⁰ orders is hopeless.', 'The pair cost is XOR, not a sum or a difference.'],
    },

    // ---------- Min-cost flow ----------
    {
      id: 1595, title: 'Minimum Cost to Connect Two Groups of Points', pattern: 'Min-cost flow',
      summary: 'Every point in the first group must connect to at least one point in the second group, and every point in the second group to at least one in the first. Connections have costs; minimise the total. Each group has at most 12 points.',
      hints: ['This is not a matching: a point may have several connections.', 'Process the first group one point at a time, remembering which second-group points are already covered as a bitmask.', 'After the last first-group point, every uncovered second-group point simply takes its cheapest connection.'],
      insight: 'DP over the first group with a mask of covered second-group points. Each first-group point needs only one connection of its own, and any second-group point left uncovered at the end pays its cheapest connection. A min-cost flow model also works, but this DP fits the limits.',
      approach: [
        'Precompute, for each second-group point, its cheapest connection to any first-group point.',
        'dp[mask] = cheapest cost so far with mask the covered second-group points; start with dp[empty] = 0.',
        'For each first-group point, build a new table: from every mask, connect the point to one second-group point j and update the entry for mask plus j.',
        'Answer = the minimum over masks of dp[mask] + the cheapest connections of the second-group points not in mask.',
      ],
      ds: ['DP array of size 2^size2', 'Precomputed cheapest costs'], time: 'O(size1 · size2 · 2^size2)', space: 'O(2^size2)',
      traps: ['Extra connections from a first-group point only help to cover second-group points, which the final step already does more cheaply.', 'Solving it as a one-to-one matching gives a wrong answer.'],
    },

    // ---------- Counting matchings ----------
    {
      id: 1434, title: 'Number of Ways to Wear Different Hats to Each Other', pattern: 'Counting matchings',
      summary: 'Each of up to 10 people likes some of 40 hats. Count the ways for everyone to wear a different hat they like, modulo 10⁹ + 7.',
      hints: ['Counting matchings is a DP problem, not a flow problem.', 'There are only 10 people but 40 hats: put the people in the bitmask, not the hats.', 'Go hat by hat: each hat goes to one person who likes it and has no hat yet, or to nobody.'],
      insight: 'Count perfect matchings with DP over hats and a bitmask of people who already wear a hat: 40 × 2¹⁰ states. Choosing the small side for the mask is the whole trick.',
      approach: [
        'For each hat, list the people who like it.',
        'dp[mask] = number of ways the people in mask have hats so far; dp[empty] = 1.',
        'For each hat, make a copy of dp (the hat unused); for each mask and each person p who likes the hat and is not in mask, add dp[mask] to the copy at mask plus p.',
        'Return dp of the full mask, modulo 10⁹ + 7.',
      ],
      ds: ['List of people per hat', 'DP array of size 2ⁿ'], time: 'O(40 · 2ⁿ · n)', space: 'O(2ⁿ)',
      traps: ['A mask over hats would need 2⁴⁰ states.', 'Update from a copy (or loop masks in the right order) so each hat is given out at most once.'],
    },
  ],
};
