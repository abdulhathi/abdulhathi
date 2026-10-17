# Interview Library

Interview preparation organised by **tech stack**, with one **track** per job description. Every topic is written
once, so what you study for one interview counts for the next.

```bash
npm install
npm run dev -- --port 5189   # or start it from Study Hub
```

## How it is organised

- **Library:** chapters in 16 stacks (Python; React and TypeScript; Backend services; Node.js; Messaging and streaming; Data; Real-time streaming;
  Testing; Security and identity; Cloud and DevOps; Machine learning; Generative AI; Healthcare domain; System design;
  Live coding in TypeScript/React; Live coding in Python). Each chapter has notes, interview questions with a spoken
  model answer, and coding problems with layered hints and tested solutions. Chapters are job-neutral.
- **Tracks:** one per job description (`src/tracks.ts`). A track lists the library chapters it needs, each as
  **Must study**, **Review** or **Optional** with a one-line reason, plus three chapters of its own: a study plan, a
  coding-round guide and your stories (`content/<track>-welcome.md`, `-coding-round.md`, `-stories.md`).
- **Practice:** the mock interview follows the active track (its formats, topic weights and coding language). The
  flash-card drill and weak spots can cover the active track, one stack, or the whole library.
- **Progress and ratings are shared** across tracks: a chapter you finished for one JD stays finished for the next.

## Learning paths and the voice interviewer

Each technology (Python, Node.js, Redis, Kafka, RabbitMQ, React, …: `src/paths.ts`) has a learning path in six steps:

1. **Read** the library chapters for it.
2. **Answer the questions out loud.** The interviewer reads each question aloud, transcribes your spoken answer
   (Chrome or Edge speech recognition), and Claude scores it against the model answer: a percentage, what you got
   right, what was missing or wrong, grammar and wording corrections, speaking pace and filler words. You move on only
   after a passing answer (80% by default). After two failed tries you can see a strong answer, then you still have to
   say it in your own words. Passed questions come back for review after 3, 7 and 21 days.
3. **Take a short course** (LinkedIn Learning first) and record the certificate link.
4. **Build a GitHub portfolio project** from the brief in `projects/<path>.md`.
5. **Earn an online assessment** (HackerRank skill certificates, vendor certifications).
6. **Show it:** ready-to-paste entries for LinkedIn (skills, licenses and certifications, projects, a post), your GitHub
   profile README, your website and your resume, built from what you recorded.

The **Profile kit** page lists everything earned across paths and backs up your progress to a file.

**The grader needs Claude credentials once:** run `ant auth login` in a terminal (or put `ANTHROPIC_API_KEY=...` in
`library-app/.env.local`), then restart the library. It runs inside the dev server (`server/evaluate.ts`), so it works
with `npm run dev`, not with a static build. Each graded answer uses API credit; pick Opus (best feedback), Sonnet or
Haiku (cheapest) in the interview settings.

## The code editor

Every coding problem opens in an editor (**💻 Solve in the editor** on the problem card, or `#/code/<chapter>/<problem>`):
the problem, hints and tables on the left, your code on the right.

- **Run** (⌘/Ctrl + Enter) runs your code and shows its output; **Run tests** (⌘/Ctrl + Shift + Enter) runs it
  against the problem's tests and shows each failure with the expected and actual values. TypeScript is also
  type-checked, with errors given against your own line numbers.
- **SQL** runs against SQLite or a throwaway local PostgreSQL database and shows your result table beside the expected
  one, including "right rows, wrong order".
- **Code review** asks Claude for an interviewer-style review: correctness, complexity, edge cases, readability and the
  questions an interviewer would ask next (uses API credit, like the voice grader).
- **A− / A+** changes the code font size, and **Editor: Right · Left · Bottom · Top** moves the editor around the
  problem; both are remembered in this browser.
- Your code is saved as a draft per problem. Passing every test marks the problem solved and rates it "good"; the model
  solution stays behind a confirmation until then.

Code runs on your machine through the dev server (`server/run-api.ts`, `server/runner.ts`, `server/harness/`), with a
10-second limit per run, and only for requests from the library page. Each problem's exercise (starter code, given
helpers, tests, SQL tables) is in `exercises/<chapter>.json`. `node scripts/make-exercises.mjs` drafts exercises for
new problems from the chapter's reference solution; `--check` confirms every solution passes its tests with no type
errors and every starter fails them. (Running it without `--check` only adds missing exercises; `--force` redrafts all
of them and overwrites curated work.)

## Adding a new job description

1. Add a track to `src/tracks.ts`: company, role, context, the plan (`[chapterId, priority, why]`), and the mock
   settings (formats, stack weights, coding chapters).
2. Write its three chapters: `content/<track>-welcome.md`, `content/<track>-coding-round.md`,
   `content/<track>-stories.md`.
3. Only if the JD needs a stack the library does not cover: write new chapters and register them in `STACKS` in
   `src/chapters.ts`.

`npm run verify` checks that every planned chapter exists, that no chapter is in two stacks, and that library chapters
stay job-neutral (no company names or JD wording).

## Checks

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # once
npm run verify   # type-check, tests, and run every code block in every chapter
node scripts/make-exercises.mjs --check   # every editor exercise: solutions pass, starters fail
```

`npm run check:code` runs every Python block, type-checks every TS/TSX block and runs the TS ones with Node, and runs
SQL against SQLite or (for `sql postgres` blocks) a local PostgreSQL. The chapter format is in `CONTENT-GUIDE.md`.

The runnable streaming demo used by the "Build it" chapter lives in `../capgemini-app/projects/streaming-demo/`.
