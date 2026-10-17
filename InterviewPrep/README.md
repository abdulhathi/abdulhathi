# Interview Labs

Interview preparation apps, each built from one job description and the resume submitted for it. Every chapter has
notes, interview questions with a model answer to say out loud, and coding problems with layered hints and a tested
solution. Each lab also has a timed mock interview, a flash-card drill and a weak-spots page.

**Start with `library-app/`, the Interview Library.** It holds every topic once, organised by tech stack, with one
track per job description (Capgemini, CitiusTech). See `library-app/README.md`.

The two original per-JD labs are kept for reference; their content now lives in the library:

| Lab | Role | Folder |
|---|---|---|
| CitiusTech (old) | Full Stack Python Developer (Python & AI Engineer), healthcare | `tutorial-app/` |
| Capgemini (old) | Sr. Full Stack Engineer, agentic AI platform on Google Cloud | `capgemini-app/` |

`react-dotnet-lead/` is different: model answers to the coding questions asked in a client interview
for Technical Lead – Full Stack (React + .NET), as a tested .NET solution, a tested React component and a
JavaScript file. Start with `react-dotnet-lead/README.md`.

## Run a lab

```bash
cd library-app   # or one of the old labs
npm install
npm run dev
```

## Checks

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # once, for the code check
npm run verify   # type-check, tests, and run every code block in every chapter
```

`npm run check:code` runs each Python block, type-checks each TS/TSX block, and runs each SQL block against SQLite
(checking `-- expect:` results). In the Capgemini lab it also runs TypeScript blocks with Node and runs
`sql postgres` blocks against a local PostgreSQL server. See each lab's `CONTENT-GUIDE.md` for the chapter format.

The Capgemini lab also includes `capgemini-app/projects/streaming-demo/`, a runnable FastAPI + React streaming agent
chat with its own README.
