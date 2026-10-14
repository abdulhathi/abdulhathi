# Writing a chapter

Each chapter is one Markdown file, `content/<id>.md`, where `<id>` is registered in `src/chapters.ts`.
The app splits the file into open notes, interview question cards (answer hidden until revealed) and
coding problems (hints and solution hidden until revealed).

## File format

```md
---
title: Functions, closures and decorators
goal: One sentence: what the reader can do in the interview after this chapter.
minutes: 35
---

One or two short paragraphs: why interviewers ask about this, and what to focus on.

## Any section title

Open notes: prose, bullet lists, tables, code blocks. Use ### subheadings freely here.

## Interview questions

### What is a closure? {core}

The answer. The FIRST paragraph is the answer you say out loud in 20–40 seconds.
Then go deeper: detail, an example, a code block, the follow-up they will ask next.

### How does functools.wraps help? {deep}

...

## Coding problems

### Write a retry decorator {medium core}

The problem statement, written like an interviewer would say it, with an example input and output.

#### Hints

1. First hint: a nudge.
2. Second hint: the key idea.
3. Third hint (optional): nearly the plan.

#### Solution

How to think about it, in a few sentences. Then the code:

```python
...code with asserts...
```

Complexity: O(n) time, O(1) extra space. Why.

#### Follow-ups

- **What if the function is async?** Short answer.
- **How would you test it?** Short answer.
```

Rules the content test enforces (`npx vitest run src/test/content.test.ts -t <id>`):

- Front matter has `title`, `goal` and `minutes` (honest study time for this chapter).
- There is an intro paragraph before the first `##` heading. No `# ` H1 anywhere (the title comes from front matter).
- The section titled exactly **Interview questions** holds the question cards: each `###` is one card.
  Question tags: `{core}` = very likely to be asked / must know, `{deep}` = follow-up or senior-level. Untagged is fine.
- The section titled exactly **Coding problems** holds problems: each `###` is one problem, tagged with one of
  `{easy}`, `{medium}`, `{hard}` and optionally `core` (e.g. `{medium core}`).
  Inside a problem, the only `####` headings allowed are **Hints** (a numbered list, 2–4 items), **Solution**
  (must contain a code block) and **Follow-ups** (optional).
- Topic chapters need at least 10 interview questions. Live coding chapters need at least 8 coding problems.
- Every code fence names its language: `python`, `ts`, `tsx`, `sql`, `bash`, `text`, `json`, `yaml`,
  `dockerfile`, `http`, `xml`, `html`, `css`, `diff`, `ini`, `toml`.
- No TODO, TBD, FIXME or placeholder text.

## Every code block is executed

`node scripts/check-code.mjs content/<id>.md` runs the code in a chapter:

- `python` blocks run one by one with `.venv/bin/python` (Python 3.14 with fastapi, httpx, pydantic 2, pandas,
  numpy, scikit-learn, sqlalchemy 2, pytest). Each block must run on its own: include its imports, and prove it
  works with `assert`s (or short prints). No network, no files outside the current directory, under 60 s.
  FastAPI examples are tested with `fastapi.testclient.TestClient`. Async examples use `asyncio.run`.
- `ts` and `tsx` blocks are type-checked together with strict TypeScript and React 19 types. Each block must be a
  complete module: import what it uses (`import { useState } from 'react'`).
- `sql` blocks run in order against one in-memory SQLite database per chapter. Put a setup block (CREATE TABLE,
  INSERT) before the queries. End a query block with `-- expect: [(…), (…)]` (a Python literal) to check its rows.
  Use standard SQL that SQLite supports (window functions, CTEs, joins are fine). For PostgreSQL-only syntax, mark
  the block `norun`.
- Add `norun` after the language (```` ```python norun ````) only for a deliberate fragment, a broken "spot the bug"
  example, or code needing a service (a real database server, an LLM API, PyTorch). Keep norun rare.

Show output with a `text` block after the code when it helps.

## Style

- Plain, direct English. Short paragraphs. British or American spelling, but be consistent within a chapter.
- Interview-first: every section answers "what will they ask, and what is a strong answer?"
- Model answers sound like a senior engineer talking: precise terms, a concrete example, a trade-off.
- Prefer tables for comparisons (threading vs multiprocessing vs asyncio; Redux vs Context vs TanStack Query).
- Where the candidate's own experience fits, add a short **Your angle:** line pointing at a real project from the
  resume (LDH Medicaid Document AI at Quantiphi, myMedidata at Medidata, Molina Healthcare at Cognizant, Labels Web
  and AKS at The Dot Corp). Never invent achievements, numbers or technologies the resume does not list.
- Accuracy over volume. If you are not sure a fact is true for current versions (Python 3.12+, React 19,
  Pydantic 2, FastAPI, scikit-learn 1.x, SQLAlchemy 2), verify it by running code or leave it out.
