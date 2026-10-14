# DSA Lab

A hands-on course that teaches data structures and algorithms technique by technique, as a React app. Each chapter explains one technique in plain words, shows it running step by step, says which data structure to use in TypeScript, and gives hand-picked LeetCode problems with hints you reveal one at a time. There is deliberately no solution code: you write every solution yourself.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 (or the next free port)
npm test           # Vitest + Testing Library
npm run build      # type-check and build static files into dist/
npm run preview    # serve the built dist/ locally
npm run snapshot   # refresh the LeetCode problem list (about 45 requests)
```

## What it covers

| Part | Chapters |
|---|---|
| Start here | How the lab works, how to solve any problem |
| Phase 1 · Foundations | Complexity, recursion, math, bit manipulation |
| Phase 2 · Linear structures | Arrays, strings, hash tables, counting, matrices, simulation, enumeration, linked lists, stacks, queues |
| Phase 3 · Core techniques | Two pointers, sliding window, prefix sums, binary search, sorting, divide and conquer, merge sort, quickselect, linear-time sorts, intervals, sweep line, monotonic stack and queue |
| Phase 4 · Trees and heaps | Trees, binary trees, BSTs, heaps, tries, ordered sets |
| Phase 5 · Graphs and search | DFS, BFS, backtracking, graph theory, topological sort, union-find, shortest paths, MSTs, SCCs, bridges, Eulerian paths, network flow and matching |
| Phase 6 · Greedy and DP | Greedy, memoization, DP foundations, grid, knapsack, sequence, interval, state machine, tree and digit DP, bitmask DP, DP optimizations |
| Phase 7 · Advanced structures | Segment trees, Fenwick trees, sparse tables, LCA and binary lifting, hashing, rolling hash, string matching, suffix arrays, design, iterators, data streams |
| Phase 8 · Math and special topics | Number theory, combinatorics, geometry, probability, game theory, brainteasers, randomized algorithms, reservoir and rejection sampling, interactive problems |
| Reference | Pattern recognition guide, TypeScript toolbox, study plan |

Practice pages: a **problem tracker** (status for every problem, plus a finder that names the chapters for any LeetCode number), a **recognition drill** (name the technique for a problem without its chapter), and a **review queue** (solved problems return after 3, 7, 15 and 30 days). Progress is stored in the browser's localStorage.

## How it is put together

| Path | What it holds |
|---|---|
| `src/chapters/` | One body file per chapter, and the registry in `index.ts` (order, titles, goals, LeetCode tags taught). Bodies load on demand. |
| `src/topics/` | Per chapter: signals, patterns and problems (summary, hints, key idea, approach, data structures, complexity, traps) |
| `src/traces/` | Algorithms that produce walkthrough frames by actually running, with tests that check their results |
| `src/viz/` | Renderers for arrays, grids, trees, graphs, linked lists, stacks, queues, sets, maps, variables, bar charts and intervals, plus the step-through player |
| `src/components/` | Chapter building blocks: overview, signals table, recipes, data structure tables, quizzes, problem cards |
| `src/pages/` | Tracker, drill and review queue |
| `src/data/leetcode.json` | Snapshot of LeetCode's public problem list: number, slug, title, difficulty, premium flag, topic tags |

## What the tests guarantee

- Every chapter renders, with no placeholders, valid cross-links and non-empty walkthroughs.
- Every problem number exists on LeetCode and its title matches the snapshot exactly, so a wrong number cannot slip in.
- Every LeetCode topic tag except Database, Shell and Concurrency is taught by at least one chapter.
- Every problem has a summary, 2–4 hints, a key idea, an approach in words, data structures and complexities, and none of it looks like code.
- Walkthrough frames come from real runs of each algorithm, and their results are checked.

## Deploy

`vite.config.ts` sets `base: './'` and the app uses hash URLs, so `dist/` works from any static host or a GitHub Pages subpath.
