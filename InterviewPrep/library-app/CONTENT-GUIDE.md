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
  Every question also needs an entry in `src/topics.json`: `"<chapter>/q-<slug>": "s-<section slug>"`, the section of
  the same chapter that teaches it (`null` if no one section does). It drives the "Topic:" link on the card, and the
  content test fails until a new question has one.
- The section titled exactly **Coding problems** holds problems: each `###` is one problem, tagged with one of
  `{easy}`, `{medium}`, `{hard}` and optionally `core` (e.g. `{medium core}`).
  Inside a problem, the only `####` headings allowed are **Hints** (a numbered list, 2–4 items), **Solution**
  (must contain a code block) and **Follow-ups** (optional).
- Topic chapters need at least 10 interview questions. Live coding chapters need at least 8 coding problems.
- Every code fence names its language: `python`, `ts`, `tsx`, `sql`, `bash`, `text`, `json`, `yaml`,
  `dockerfile`, `http`, `xml`, `html`, `css`, `diff`, `ini`, `toml`, `proto`, `hcl` (Terraform), `graphql`, `js`.
- No TODO, TBD, FIXME or placeholder text.

## Every code block is executed

`node scripts/check-code.mjs content/<id>.md` runs the code in a chapter:

- `python` blocks run one by one with `.venv/bin/python` (Python 3.14 with fastapi 0.143 (including `fastapi.sse`),
  httpx, pydantic 2, pytest, sqlalchemy 2, psycopg 3, fakeredis (with Lua scripting via lupa), grpcio + grpcio-tools, langgraph, numpy, uvicorn).
  Each block must run on its own: include its imports, and prove it works with `assert`s. No network, no files outside
  the current directory, under 60 s. FastAPI examples (including SSE and WebSocket endpoints) are tested with
  `fastapi.testclient.TestClient`. Async examples use `asyncio.run`. Redis examples use `fakeredis`. gRPC examples can
  compile a `.proto` at runtime with `grpc_tools.protoc` into the current directory and run a server on `localhost:0`.
- `ts` blocks are type-checked (strict, ES2025 library (`toSorted`, `Object.groupBy`, Set methods, iterator helpers), React 19 and Node types, `erasableSyntaxOnly`, `verbatimModuleSyntax`) **and
  then run with Node 25** by stripping types. So: no `enum`, `namespace` or constructor parameter properties; write
  `import type { X }` for type-only imports; prove the code works with `import assert from 'node:assert/strict'`
  (`console.assert` does not fail the run). Top-level `await` is fine. Installed packages you may import: zod 4, xstate 5,
  ws 8, express 5, @grpc/grpc-js, @grpc/proto-loader, @tanstack/react-query 5, zustand 5, @reduxjs/toolkit 2,
  react-redux 9, msw 2, ioredis, @playwright/test.
- Flag a `ts` block `typecheck` (```` ```ts typecheck ````) when it must not be executed: a server that keeps
  listening, code that needs a browser, Redis, a network or a cloud service, or a Playwright test. It is still type-checked.
- `tsx` blocks are type-checked only. Each must be a complete module: import what it uses (`import { useState } from 'react'`).
- `sql` blocks run in order against one in-memory SQLite database per chapter. Put a setup block (CREATE TABLE,
  INSERT) before the queries. End a query block with `-- expect: [(…), (…)]` (a Python literal) to check its rows.
- `sql postgres` blocks run in order against a throwaway database on the local **PostgreSQL 14** server instead
  (JSONB, `FOR UPDATE SKIP LOCKED`, `ON CONFLICT`, partial and GIN indexes, `generate_series`, CTEs all work; MERGE,
  `NULLS NOT DISTINCT` and JSON_TABLE need 15+, so mark those `norun`). In `-- expect:` rows, numeric values compare as
  int or float, dates and timestamps as ISO strings, JSON as Python dicts and lists. `EXPLAIN` output is not stable:
  show it in a `text` block instead of expecting it.
- Add `norun` after the language (```` ```python norun ````) only for a deliberate fragment, a broken "spot the bug"
  example, or code needing a service that is not available (a cloud API, an LLM API, a real Redis or Firestore). Keep
  norun rare: most things can be shown with fakes, TestClient, or an in-process server.

Show output with a `text` block after the code when it helps.

## Style

- Plain, direct English. Short paragraphs. British or American spelling, but be consistent within a chapter.
- Interview-first: every section answers "what will they ask, and what is a strong answer?"
- Model answers sound like a senior engineer talking: precise terms, a concrete example, a trade-off.
- Prefer tables for comparisons (threading vs multiprocessing vs asyncio; Redux vs Context vs TanStack Query).
- Where the candidate's own experience fits, add a short **Your angle:** line pointing at a real project from the
  resume (the GCP Document AI platform with HITL at Quantiphi, myMedidata at Medidata, Labels Web, the LINE platform,
  Labcorp workflows and AKS at The Dot Corp, Azure microservices at Cognizant). Never invent achievements, numbers or
  technologies the resume does not list. Where the resume shows no experience (WebSockets, SSE, gRPC, Redis,
  Playwright, LangGraph, Terraform, GKE, Pub/Sub, SAP), say so plainly and give the honest bridge.
- Never include private details: no pay rate, phone number, email address, recruiter or vendor names, or the end
  client's name. The lab may be published on GitHub.
- Accuracy over volume. If you are not sure a fact is true for current versions (React 19, TypeScript 5.x/7, Node 24+,
  Python 3.12+, FastAPI, Pydantic 2, PostgreSQL 16+, current GCP products), verify it by running code, reading the
  installed package, or checking the official docs (context7 or web search), or leave it out.
