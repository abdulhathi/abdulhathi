# Node.js Lab

A hands-on course that teaches Node.js with TypeScript, from your first script to a tested, secured, production-ready API, as a React app. Twenty chapters, eleven practice projects, a capstone brief, and three reference appendices (troubleshooting, cheat sheet, interview questions).

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 (or the next free port)
npm test           # Vitest + Testing Library
npm run build      # type-check and build static files into dist/
npm run preview    # serve the built dist/ locally
```

## What the course covers

| Part | Chapters | Projects |
|---|---|---|
| Start here | What Node.js is, tools, TypeScript without a build step | `01-hello-node` |
| Core Node.js | Modules and npm, a CLI, async code, the event loop, events, buffers and streams | `02-modules-lab` … `07-log-analyzer` |
| Web APIs | HTTP from scratch, Express 5, SQLite, node:test, config and logging, authentication | `08-raw-http-api`, `09-tasks-api` |
| Advanced Node.js | Worker threads and child processes, profiling and memory | `10-cpu-lab`, `11-perf-lab` |
| Production | PostgreSQL, graceful shutdown, Docker, CI, capstone | `09-tasks-api`, your own repo |

You build each project yourself in `NodeJS/projects/`, following the chapter.

## How it is put together

| Path | What it holds |
|---|---|
| `src/chapters/` | One file per chapter, and the registry in `index.ts` that sets order, titles, goals and URLs |
| `src/components/` | Code blocks with copy buttons, terminal commands, expected output, the chapter overview, numbered steps, exercises, checkpoints |
| `src/diagrams/` | Diagrams: layout maths in `geometry.ts`, the SVG renderer, the zoom viewer, and one spec file per part in `specs/` |
| `src/lib/` | Hash routing (`#/streams`), chapter progress and theme (saved in localStorage), syntax highlighting, snippet loading |
| `snippets/` | The practice projects' source files, shown verbatim in the chapters |

Every file in `snippets/` was run on Node 24.21 LTS and type-checked with TypeScript 7.0 before it went into a chapter, and every "What you should see" box holds captured output. The app imports the files as raw strings (`import.meta.glob(..., { query: '?raw' })`), so the code on screen is the code that ran.

Testing notes:

- Every snapshot type-checks and runs from a clean `npm install` on Node 24.21; the tasks API's own suite passes: 71 tests without a database server, and all 84 against a real PostgreSQL 18 container.
- The main projects were also smoke-tested on Node 26.11, which becomes LTS in late October 2026.
- Not run: the chapter 19 Dockerfile build and Compose app service (no Node image could be pulled here), a real GitHub Actions run (the workflow's steps were run locally), the Chrome DevTools steps in chapter 17, and the Windows variants of commands.

`snippets/` holds one folder per runnable snapshot. Most projects have one (`03-notes-cli`); the API that grows over several chapters has one per chapter (`09-tasks-api.2-sqlite`), and exercise solutions sit in `.practice` snapshots. Code boxes show the part before the first dot as the project folder.

## Add or change a chapter

1. Write the body in `src/chapters/<id>.tsx`, using `ChapterIntro`, `Step`, `CodeFile`, `Terminal`, `Output`, `Box`, `Exercises`, `Checkpoint` and `Recap`.
2. Register it in `CHAPTERS` in `src/chapters/index.ts` with an `id` (its URL), number, group, title, goal and project folder.
3. Add the project files under `snippets/<snapshot>/` after running them, and show them with `<CodeFile path="<snapshot>/src/file.ts" />`.
4. Run `npm test`: every chapter is rendered, so a missing snippet, a broken diagram or a leftover placeholder fails the suite.

## Deploy

`vite.config.ts` sets `base: './'` and the app uses hash URLs, so `dist/` works from any static host or a GitHub Pages subpath without server rewrites.
