---
title: "patterns-75: interview problems by pattern in TypeScript and Python, tested and visualised"
summary: A well-engineered repository of 75 classic interview problems organised by pattern, each solved in TypeScript and Python with tests, complexity notes and a written explanation, published as a searchable GitHub Pages site.
time: 5 days of evenings, then a few problems a week
---

## What you will build

A public repository that shows how you think, not just that you grind: 75 high-value interview problems (arrays and hashing, two pointers, sliding window, stacks, binary search, linked lists, trees, graphs, heaps, intervals, dynamic programming), each with:

- a solution in **TypeScript** and in **Python**, with tests covering normal and edge cases;
- a short write-up: the pattern, the brute force, the insight, and the time and space complexity;
- a link to the original problem (do not copy problem statements verbatim; write a one-paragraph summary in your own words).

CI runs both test suites on every push, and a GitHub Pages site lists the problems by pattern with search. It complements the portfolio's DSA Lab (a study app) by being your own public, tested work.

## What it proves

- Data structures and algorithms across the standard interview patterns
- Writing correct, tested code in two languages, with property-based or randomised tests against a brute-force oracle
- Engineering hygiene: a monorepo with two toolchains, linting, CI, a generated documentation site
- Clear technical writing: explaining an approach and its complexity in a few lines
- Keywords: data structures, algorithms, problem solving, TypeScript, Python, Vitest, pytest, CI/CD, GitHub Pages

## Architecture

```text
 problems/
   two-sum/
     README.md        ← summary in your own words, pattern, approach, complexity, link to the original
     solution.ts      ← TypeScript solution            solution.test.ts   (Vitest)
     solution.py      ← Python solution                test_solution.py   (pytest)
     meta.json        ← { pattern, difficulty, tags, source }
          │
          ▼  scripts/build-site.ts reads every meta.json + README.md
 site/ (static, built in CI) ──► GitHub Pages: problems by pattern, search, difficulty filter
```

## Milestones

### Milestone 1: repository skeleton and tooling

- Node.js 24 with TypeScript and Vitest; Python 3.13+ with pytest and ruff; one `Makefile` or npm script to run everything.
- A generator script: `npm run new two-sum` creates the folder with templates.

Done when: `npm test` and `pytest` both run (on an example problem) locally and in CI.

### Milestone 2: the first 25 problems (arrays, hashing, two pointers, sliding window, stacks)

- Solve in TypeScript first, then port to Python idiomatically (not line by line).
- Every problem has at least five tests, including empty input and duplicates.

Done when: 25 problems pass in both languages and each README states the complexity.

### Milestone 3: brute-force oracles and randomised tests

- For problems where a brute force is easy, add randomised tests that compare the optimal solution against it on hundreds of small random inputs (fast-check in TypeScript, Hypothesis in Python).

Done when: at least 10 problems have oracle tests, and you have recorded any bug they found in the README.

### Milestone 4: the next 50 problems (binary search, linked lists, trees, graphs, heaps, intervals, DP)

- Include topological sort, Dijkstra with a heap you implement, union-find, and two or three DP problems with both top-down and bottom-up versions.

Done when: all 75 problems pass in both languages.

### Milestone 5: the site and the write-ups

- `scripts/build-site.ts` turns `meta.json` and READMEs into a static site with a pattern index, search and difficulty filter; deploy with GitHub Pages from Actions.
- A top-level `PATTERNS.md`: for each pattern, the signals in a problem statement that point to it.

Done when: the site is live and every problem links to its code on GitHub.

## Repository layout

```text
patterns-75/
├── problems/<slug>/{README.md, solution.ts, solution.test.ts, solution.py, test_solution.py, meta.json}
├── scripts/{new.ts, build-site.ts}
├── site/                  # generated, not committed
├── PATTERNS.md
├── package.json  pyproject.toml
└── .github/workflows/{ci.yml,pages.yml}
```

## Tests and CI

- TypeScript: Vitest, with fast-check for randomised oracle tests.
- Python: pytest, with Hypothesis for the same.
- Lint and type-check both: `tsc --noEmit`, ruff and mypy (or pyright).

```yaml
# .github/workflows/ci.yml (outline)
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: 24, cache: npm }
      - uses: actions/setup-python@v7
        with: { python-version: "3.13" }
      - run: npm ci && npx tsc --noEmit && npx vitest run
      - run: pip install -r requirements-dev.txt && ruff check . && pytest -q
```

## README checklist

- Badges: CI, number of problems solved, licence; a link to the GitHub Pages site
- A table of patterns with problem counts and a link to each section
- "How I approach a problem" in six steps (clarify, example, brute force, optimise, code, test)
- One featured write-up shown in full as an example
- Note that problem statements are summarised in your own words, with links to the originals
- What's next (the problems you plan to add)

No Docker or services are needed; local development is Node.js 24 and Python.

## Stretch goals

- Step-through visualisations for a few problems (two pointers, BFS on a grid) on the site
- Benchmarks comparing approaches on large inputs
- A third language (Go or C#)
- A weekly GitHub Action that opens an issue with a random problem to re-solve from memory

## Talking about it in an interview

**60-second walkthrough:** "patterns-75 is my public practice repository: 75 classic problems organised by pattern, each solved in TypeScript and Python with tests and a short write-up of the brute force, the insight and the complexity. For many of them I added randomised tests that compare the optimal solution with a brute-force oracle on hundreds of random inputs; that caught real off-by-one bugs. CI runs both languages, and a GitHub Pages site indexes the problems by pattern so I can revise by pattern before interviews."

- **Why two languages?** Interviews let me choose, and roles differ; porting idiomatically also checks I understand the solution rather than memorised it.
- **What is an oracle test?** A slow but obviously correct solution used to check the fast one on random inputs; it finds edge cases I didn't think to write.
- **How do you recognise a sliding-window problem?** A contiguous subarray or substring with a constraint that can be maintained incrementally as the window grows and shrinks.

## LinkedIn post template

> I've published patterns-75: 75 classic interview problems organised by pattern, each solved in TypeScript and Python with tests and a short write-up of the approach and complexity.
> For many problems I added randomised tests against a brute-force oracle, which caught bugs my hand-written tests missed.
> CI runs both languages, and a searchable site groups everything by pattern: <link>
> #algorithms #datastructures #typescript #python

## Resume bullet

Built patterns-75, an open-source repository of 75 interview problems by pattern with tested TypeScript and Python solutions, randomised oracle tests (fast-check, Hypothesis), CI for both toolchains and a generated GitHub Pages index.
