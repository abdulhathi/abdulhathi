---
title: "Capgemini: the live coding round in TypeScript and React"
goal: Run a calm, repeatable routine for any coding problem, in TypeScript, React or Python, and show the interviewer exactly the signals they score.
minutes: 20
---

For a senior full-stack role on a front-end-heavy product, the coding round is usually one of three things: a **TypeScript or JavaScript problem** (often async: debounce, a promise pool, retry with backoff, parsing a stream), a **small React component** built live (a typeahead, a chat box, a data table), or a **classic algorithm problem**. Python is possible because the backend can be Python. Interviewers are not only checking whether your code works. They score how you **clarify** the problem, whether you find a **correct approach** and can state its **cost**, how **clean** your code is, and whether you **test** it yourself.

## The six-step routine

Use the same six steps on every problem, out loud, so they are automatic in the interview.

| Step | What you do | What you say |
|---|---|---|
| 1. Clarify | Restate the problem; ask about input size, empty input, duplicates, ordering, errors, return format | "So I get a list of agent events and return… Can the list be empty? Are events already in time order?" |
| 2. Example | Work one small example by hand, plus one edge case | "For these four events I'd expect `['r2', 'r1']`, and for no events an empty array." |
| 3. Brute force | Say the simplest correct idea and its cost | "The simple way rescans the list for every run: O(n²). That works, but we can do better." |
| 4. Optimise | Name what the brute force repeats, and the structure that removes it | "I keep looking up whether I've seen a run, so a `Set` makes each check O(1)." |
| 5. Code | Write clean code while narrating | "I'll loop once; for each failed step I check the set before adding the run." |
| 6. Test | Trace your example through the code, then the edge cases, then state complexity | "With the four events: … Empty input returns `[]`. O(n) time, O(n) space." |

## How long each part should take

For a 20-minute medium problem: about 3 minutes to clarify and work an example, 3 for the brute force and the better idea, 10 to code, and 4 to test and discuss. If you have been stuck for 5 minutes, say what you are thinking and ask a focused question ("Would it help to sort by timestamp first?"). Interviewers often give a hint, and taking it well is a positive signal.

## A worked example, the way to narrate it

The interviewer says: *"You get the event log from our agent runner. Return the IDs of runs that had at least one failed step, in the order their first failure happened."*

You clarify: events arrive in time order; a run can fail more than once but appears once in the output; the log can be empty. Brute force: for each failed event, scan the output array to check for duplicates, which is O(n²) in the worst case. Better: keep a `Set` of runs already reported, so each check is O(1).

```ts
import assert from 'node:assert/strict';

type AgentEvent =
  | { type: 'step_started'; runId: string; step: string }
  | { type: 'step_failed'; runId: string; step: string; error: string }
  | { type: 'run_completed'; runId: string };

function runsWithFailures(events: AgentEvent[]): string[] {
  const reported = new Set<string>();
  const result: string[] = [];
  for (const event of events) {
    if (event.type === 'step_failed' && !reported.has(event.runId)) {
      reported.add(event.runId);
      result.push(event.runId);
    }
  }
  return result;
}

const log: AgentEvent[] = [
  { type: 'step_started', runId: 'r1', step: 'plan' },
  { type: 'step_failed', runId: 'r2', step: 'fetch', error: 'timeout' },
  { type: 'step_failed', runId: 'r1', step: 'plan', error: 'invalid tool args' },
  { type: 'step_failed', runId: 'r2', step: 'retry', error: 'timeout' },
  { type: 'run_completed', runId: 'r3' },
];
assert.deepEqual(runsWithFailures(log), ['r2', 'r1']);
assert.deepEqual(runsWithFailures([]), []);
assert.deepEqual(runsWithFailures([{ type: 'run_completed', runId: 'r9' }]), []);
```

Then test out loud: trace the five events, then the empty log, then a log with no failures. Finish with: "O(n) time, and O(k) extra space for the k failed runs." Notice the **discriminated union** for the events: it shows TypeScript maturity at no cost, and `event.runId` is type-safe in every branch.

The same thing in Python, if the interviewer prefers it:

```python
def runs_with_failures(events: list[dict]) -> list[str]:
    reported: set[str] = set()
    result: list[str] = []
    for event in events:
        if event["type"] == "step_failed" and event["run_id"] not in reported:
            reported.add(event["run_id"])
            result.append(event["run_id"])
    return result


log = [
    {"type": "step_started", "run_id": "r1"},
    {"type": "step_failed", "run_id": "r2"},
    {"type": "step_failed", "run_id": "r1"},
    {"type": "step_failed", "run_id": "r2"},
]
assert runs_with_failures(log) == ["r2", "r1"]
assert runs_with_failures([]) == []
```

## TypeScript that reads like a senior engineer wrote it

- **Type the signature and the data**, not every local: `function topK(nums: number[], k: number): number[]`. Use a discriminated union when the input has several shapes.
- **Reach for the right built-ins:** `Map` and `Set` (not plain objects) for lookups, `Array.from({ length: n }, () => [])` for 2-D arrays, `arr.toSorted()` when you must not mutate. The [TypeScript toolkit](#/code-ts-toolkit) has the cheat sheet.
- **Know the traps:** `[10, 9, 1].sort()` sorts as strings, so always pass a comparator; `new Array(3).fill([])` shares one array; `for...in` iterates keys as strings; `==` coerces.
- **Async code:** say whether operations run in sequence or in parallel, and how errors and cancellation flow. Use `AbortController` for anything that can be cancelled. [Async JavaScript](#/code-async) drills the classics.
- **Small helpers and early returns** for edge cases. No clever one-liners you cannot explain.
- **Say the complexity** without being asked, for time and extra space.

## If they ask for a React component

Build it in this order and narrate each step:

1. **State first:** "The state is the query, the results, a loading flag and an error." Say what is derived and therefore not state.
2. **Render the static shape** with semantic HTML: a `<label>` for the input, a `<ul>` for results, a `<button>` for actions.
3. **Effects last**, with cleanup: abort the in-flight fetch, clear the timer, close the socket. Say "the cleanup prevents a race where an old response overwrites a new one."
4. **Edge cases out loud:** empty results, an error, very fast typing, unmount mid-request, a long list (mention virtualisation), keyboard users and screen readers (`aria-live` for streaming text).
5. **Then improve:** extract a custom hook (`useDebouncedValue`, `useChatStream`), memoise only if there is a measured reason, and say how you would test it with React Testing Library.

Practise in [Live React tasks](#/code-react-live) and read [the streaming chat UI](#/streaming-chat-ui): a streaming chat box is the single most likely React exercise for this role.

## When you get stuck

- **Shrink the input:** solve n = 1, 2, 3 by hand and look at what you did.
- **Ask what you are recomputing:** that is usually where a map, a set, prefix sums or sorting comes in.
- **Sort it:** many problems become two pointers or a single pass once sorted.
- **Draw it:** intervals on a line, a grid, nodes and edges, or the timeline of an async flow.
- **Say it out loud:** "I'm thinking about a heap to keep the top k, because…". The interviewer can only help if they hear your reasoning.

## Practice map

| If they ask for… | Practise in |
|---|---|
| Async JS: debounce, throttle, promise pool, retry, stream parsing | [Async JavaScript](#/code-async) |
| Practical tasks: LRU with TTL, task queue, state machine reducer, router matcher | [Practical TypeScript](#/code-practical-ts) |
| A React component | [Live React tasks](#/code-react-live) |
| Classic algorithms | [Algorithms, part 1](#/code-algo-arrays) and [part 2](#/code-algo-graphs) |
| Python | [Python live coding](#/code-python) |
| SQL | The coding problems at the end of [PostgreSQL](#/postgres) |

## Going deeper later

The [DSA Lab](http://localhost:5182) teaches every algorithm technique behind LeetCode problems, chapter by chapter. Before this interview, stay with the problems in the library's live-coding chapters: they are the ones most likely for a senior full-stack role.
