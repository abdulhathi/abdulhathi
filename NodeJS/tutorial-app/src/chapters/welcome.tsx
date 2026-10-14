import { Terminal } from '../components/Code';
import { Box, TableWrap } from '../components/Content';

const ROUTE: [string, string, string, string][] = [
  ['03', 'Tools and your first project', 'Version manager, npm, TypeScript without a build step', '01-hello-node'],
  ['04', 'Modules and npm packages', 'ES modules, CommonJS, package.json, semver, lockfiles', '02-modules-lab'],
  ['05', 'Build a CLI', 'process, fs/promises, path, exit codes, atomic writes', '03-notes-cli'],
  ['06', 'Async code', 'Promises, async/await, Promise.all, cancellation, concurrency limits', '04-async-lab'],
  ['07', 'The event loop', 'Phases, microtasks, nextTick, blocking, the thread pool', '05-event-loop-lab'],
  ['08', 'Events', 'EventEmitter, typed events, error events, events.once', '06-events-lab'],
  ['09', 'Buffers and streams', 'Readable, Writable, Transform, pipeline, backpressure', '07-log-analyzer'],
  ['10', 'HTTP from scratch', 'node:http, routing, JSON bodies, status codes, fetch', '08-raw-http-api'],
  ['11–15', 'A real REST API', 'Express 5, Zod, SQLite, node:test, pino, JWT auth, security', '09-tasks-api'],
  ['16', 'Worker threads and child processes', 'CPU-bound work, worker pools, spawn and exec', '10-cpu-lab'],
  ['17', 'Performance and memory', 'CPU profiles, event-loop delay, heap snapshots, leaks', '11-perf-lab'],
  ['18–19', 'PostgreSQL and production', 'Connection pools, graceful shutdown, Docker, CI', '09-tasks-api'],
  ['20', 'Capstone', 'Design and build your own service', 'your own repo'],
];

export function Welcome() {
  return (
    <>
      <div className="prose">
        <p>
          This course takes you from <code>node hello.ts</code> to an API you could put in front of real users. You
          learn each part of Node.js in two passes: first the idea, explained properly, then a small project where you
          type the code, run it and break it on purpose. Nothing is hidden behind a framework until you have built that
          piece by hand at least once.
        </p>
        <p>
          You write everything in <strong>TypeScript</strong>, and you run it with <strong>Node.js 24 LTS</strong>, which
          can execute <code>.ts</code> files directly. There is no build step to learn first, so on day one you write
          code, not configuration.
        </p>
      </div>

      <h2>The route</h2>
      <div className="prose">
        <p>
          Chapters 01–09 cover the runtime itself. Chapters 10–15 turn that into web APIs. Chapters 16–19 are what
          separates someone who uses Node from someone who can run it in production. Each project lives in its own
          folder, so you can always go back and rerun an earlier step.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Ch.</th><th>Topic</th><th>Concepts</th><th>Project</th></tr>
        </thead>
        <tbody>
          {ROUTE.map(([num, topic, concepts, project]) => (
            <tr key={num}>
              <td>{num}</td>
              <td>{topic}</td>
              <td>{concepts}</td>
              <td><code>{project}</code></td>
            </tr>
          ))}
        </tbody>
      </TableWrap>

      <h2>Where your projects go</h2>
      <div className="prose">
        <p>
          Keep your own work in a <code>projects</code> folder next to this tutorial. Every chapter tells you which
          folder it builds, and every file in a code box is shown under its path inside that folder.
        </p>
      </div>
      <Terminal title="Your folder layout">{`
NodeJS/
├── tutorial-app/        # this course
└── projects/            # your work, one folder per project
    ├── 01-hello-node/
    ├── 02-modules-lab/
    ├── ...
    └── 09-tasks-api/    # grows from chapter 11 to chapter 19`}</Terminal>
      <Terminal title="Create it once">{`
cd ~/Developer/StudyGuide/github-portfolio/NodeJS
mkdir projects`}</Terminal>

      <h2>How every chapter is laid out</h2>
      <TableWrap>
        <thead>
          <tr><th>Part</th><th>What it gives you</th></tr>
        </thead>
        <tbody>
          <tr><td>Overview box</td><td>What you will learn, the tools involved, how long it takes and the project folder.</td></tr>
          <tr><td>Concepts</td><td>The idea in plain words, with diagrams and tables, before any code.</td></tr>
          <tr><td>Numbered steps</td><td>Exactly what to type: commands, then each file in full.</td></tr>
          <tr><td>What you should see</td><td>Real output, captured when the code was tested, so you can compare.</td></tr>
          <tr><td>Try it</td><td>Small experiments that break things on purpose. This is where understanding comes from.</td></tr>
          <tr><td>Practice on your own</td><td>Exercises that extend the project, with a hint and a tested solution behind each.</td></tr>
          <tr><td>Checkpoint</td><td>A question to answer before you open the answer.</td></tr>
          <tr><td>Key takeaways</td><td>The handful of points worth remembering.</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          Code boxes from a project you already have are marked <span className="change new">New file</span> or{' '}
          <span className="change updated">Updated</span>. An updated file is always shown in full, so you can replace
          the whole file rather than hunt for the changed line.
        </p>
      </div>

      <Box kind="key" label="How to study so it sticks">
        <ol>
          <li><strong>Type the code, do not paste it.</strong> Typing is slower, and that is the point: you notice every import, type and argument.</li>
          <li><strong>Run it after every step,</strong> and compare with the expected output before moving on.</li>
          <li><strong>Do the experiments.</strong> Reading an error message you caused on purpose teaches more than ten that surprise you.</li>
          <li><strong>Do at least one exercise per chapter</strong> without opening the hint.</li>
          <li><strong>Answer the checkpoint out loud</strong> before you look. If you cannot explain it, reread the concept section.</li>
          <li><strong>Commit each project to git</strong> as you go. By the end you have a history that shows how you learned.</li>
        </ol>
      </Box>

      <h2>Conventions used everywhere</h2>
      <TableWrap>
        <thead>
          <tr><th>Rule</th><th>Why</th></tr>
        </thead>
        <tbody>
          <tr><td>Node.js 24 LTS</td><td>The current long-term support line, so what you learn is what companies run.</td></tr>
          <tr><td>ES modules (<code>import</code>)</td><td>The JavaScript standard. Chapter 04 shows the older CommonJS style so you can read it.</td></tr>
          <tr><td><code>node:</code> prefix for built-ins</td><td><code>node:fs</code> can never be confused with a package from npm.</td></tr>
          <tr><td>Imports end in <code>.ts</code></td><td>Node finds files by their exact name. Chapter 03 explains this.</td></tr>
          <tr><td>Strict TypeScript</td><td>The compiler catches mistakes before your users do.</td></tr>
          <tr><td>Built-ins first</td><td>Node ships a test runner, watch mode, <code>fetch</code>, SQLite and more. Packages come in only when they earn their place.</td></tr>
        </tbody>
      </TableWrap>

      <Box kind="tip" label="Stuck?">
        <p>
          Appendix A lists the errors you are most likely to meet, with the exact message and the fix. Appendix B is a
          one-page cheat sheet, and appendix C collects interview questions that test the same concepts as the
          chapters.
        </p>
      </Box>
    </>
  );
}
