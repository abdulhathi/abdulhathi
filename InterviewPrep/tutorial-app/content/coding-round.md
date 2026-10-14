---
title: How to pass the live coding round
goal: Run a calm, repeatable routine for any coding problem, and show the interviewer exactly the signals they score.
minutes: 20
---

Live coding is 30–60% of this interview. Interviewers are not only checking whether your code works. They score how you **clarify** the problem, whether you find a **correct approach** and can say its **cost**, how **clean** your code is, and whether you **test** it yourself. A candidate who talks through a clear plan and catches their own bug scores better than one who silently types a perfect answer.

## The six-step routine

Use the same six steps on every problem tonight, out loud, so they are automatic tomorrow.

| Step | What you do | What you say |
|---|---|---|
| 1. Clarify | Restate the problem, ask about input size, empty input, duplicates, negatives, return format | "So I get a list of claim amounts and return… Can the list be empty? Can values repeat?" |
| 2. Example | Work one small example by hand, plus one edge case | "For `[3, 1, 3]` I'd expect… and for an empty list, an empty result." |
| 3. Brute force | Say the simplest correct idea and its cost | "The simple way checks every pair: O(n²). That works, but we can do better." |
| 4. Optimise | Name what the brute force repeats, and the structure that removes it | "I keep searching for the complement, so a dict of seen values makes each lookup O(1)." |
| 5. Code | Write clean Python while narrating | "I'll loop once, and for each value check the dict before adding it." |
| 6. Test | Trace your example through the code, then the edge cases, then state complexity | "With `[3, 1, 3]`: … Empty list returns `[]`. O(n) time, O(n) space." |

## How long each part should take

For a 20-minute medium problem: about 3 minutes to clarify and work an example, 3 for the brute force and better idea, 10 to code, and 4 to test and discuss. If you have been stuck for 5 minutes, say what you are thinking and ask a focused question ("Would it help to sort first?"). Interviewers often give a hint, and taking it well is a positive signal.

## Python that reads like a senior engineer wrote it

- **Name things by meaning:** `seen`, `counts`, `left`, `best_total`, not `d`, `x`, `tmp`.
- **Type hints on the signature:** `def top_k(nums: list[int], k: int) -> list[int]:`. They make your intent clear without slowing you down.
- **Reach for the standard library:** `collections.Counter`, `defaultdict`, `deque`, `heapq`, `bisect`, `itertools`. The [Python toolkit](#/code-toolkit) has the cheat sheet.
- **Small helpers** for repeated logic, and **early returns** for edge cases.
- **No clever one-liners** that you cannot explain. Readable beats short.
- **Say the complexity** without being asked, for time and extra space.

## A worked example, the way to narrate it

The interviewer says: *"Given a list of patient IDs from today's check-ins, return the IDs that checked in more than once, in the order they first appeared."*

You clarify: IDs are strings; the list can be empty; output keeps first-appearance order; each duplicate appears once in the output. Brute force: for each ID, count it with `list.count`, which is O(n²). Better: count everything once with `Counter` (O(n)), then walk the list in order and collect IDs with a count above 1 that you have not already added.

```python
from collections import Counter


def repeat_check_ins(ids: list[str]) -> list[str]:
    counts = Counter(ids)
    result: list[str] = []
    added: set[str] = set()
    for patient_id in ids:
        if counts[patient_id] > 1 and patient_id not in added:
            result.append(patient_id)
            added.add(patient_id)
    return result


assert repeat_check_ins(["p3", "p1", "p3", "p2", "p1", "p3"]) == ["p3", "p1"]
assert repeat_check_ins([]) == []
assert repeat_check_ins(["p1", "p2"]) == []
assert repeat_check_ins(["p7", "p7", "p7"]) == ["p7"]
```

Then test out loud: trace `["p3", "p1", "p3", …]`, then the empty list, then no duplicates. Finish with: "O(n) time and O(n) extra space for the counter and the set."

## When you get stuck

- **Shrink the input:** solve n = 1, 2, 3 by hand and look at what you did.
- **Ask what you are recomputing:** that is usually where a dict, a set, prefix sums or sorting comes in.
- **Sort it:** many problems become two pointers or a single pass once sorted.
- **Draw it:** intervals on a line, a grid, or nodes and edges.
- **Say it out loud:** "I'm thinking about using a heap to keep the top k, because…". The interviewer can only help if they hear your reasoning.

## If they ask for React or SQL instead

- **React:** they may ask you to build a small component (a counter, a list with a filter, a fetch with loading and error states). Talk about state, effects and keys as you go. Practise in [Live React tasks](#/code-react).
- **SQL:** joins, GROUP BY with HAVING, and window functions for "top N per group" come up most. Practise in [SQL](#/sql).
- **pandas:** with the AI-engineer side of the role, a data-wrangling task is possible. Practise in [pandas and NumPy](#/code-pandas).

## Going deeper later

The [DSA Lab](http://localhost:5182) teaches every algorithm technique behind LeetCode problems, chapter by chapter. Tonight, stay with the problems in this lab: they are the ones most likely in a Python developer interview.
