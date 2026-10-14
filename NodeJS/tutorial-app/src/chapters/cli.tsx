import { CodeFile, Terminal } from '../components/Code';
import { Box, ChapterIntro, Checkpoint, Exercises, Output, Recap, Step, TableWrap } from '../components/Content';

export function Cli() {
  return (
    <>
      <ChapterIntro
        time="90 minutes"
        project="03-notes-cli"
        learn={[
          'How a command-line program receives input and reports results: arguments, environment, standard streams, exit codes',
          'Parse options and subcommands with util.parseArgs, with no dependencies',
          'Read and write files with fs/promises, and build paths that work on every OS',
          'Handle system errors by their code (ENOENT, EACCES …) instead of guessing',
          'Write files atomically so a crash never corrupts your data',
          'Colour output that switches itself off when it should, and ask the user a question',
          'Turn your script into a real command with npm link',
        ]}
        tools={[
          { name: 'process', what: 'argv, env, exitCode, stdin, stdout, stderr.' },
          { name: 'node:util', what: 'parseArgs() for options, styleText() for colours.' },
          { name: 'node:fs/promises', what: 'Promise-based file system functions.' },
          { name: 'node:path, node:os', what: 'Join paths safely; find the home folder.' },
          { name: 'node:readline/promises', what: 'Ask a question and await the answer.' },
          { name: 'npm link', what: 'Installs your package’s command globally, as a symlink.' },
        ]}
      />

      <h2>Anatomy of a command-line program</h2>
      <div className="prose">
        <p>
          A command-line program is a function whose inputs are words, environment variables and a stream of text, and
          whose outputs are two streams of text and one number. Get these right and your tool fits into scripts,
          pipelines and CI like any Unix command.
        </p>
      </div>
      <Terminal title="The parts of one command">{`
NOTES_FILE=/tmp/n.json   notes   list   --all   -y   -- --not-an-option
└─ environment ──────┘   └ cmd ┘ └pos┘  └long┘ └short┘ └ after --, always positional`}</Terminal>
      <TableWrap>
        <thead>
          <tr><th>Input or output</th><th>In Node</th><th>Notes</th></tr>
        </thead>
        <tbody>
          <tr><td>Arguments</td><td><code>process.argv</code></td><td>An array of strings. <code>[0]</code> is the node binary, <code>[1]</code> the script, the rest are yours.</td></tr>
          <tr><td>Environment</td><td><code>process.env</code></td><td>Strings, or <code>undefined</code> when not set. Good for settings that rarely change, such as a file location.</td></tr>
          <tr><td>Standard input (fd 0)</td><td><code>process.stdin</code></td><td>The keyboard, or whatever is piped in: <code>echo y | notes clear</code>.</td></tr>
          <tr><td>Standard output (fd 1)</td><td><code>process.stdout</code>, <code>console.log</code></td><td>The result. This is what <code>&gt;</code> redirects and <code>|</code> pipes.</td></tr>
          <tr><td>Standard error (fd 2)</td><td><code>process.stderr</code>, <code>console.error</code></td><td>Errors, warnings and progress. Stays on screen when stdout is redirected.</td></tr>
          <tr><td>Exit code</td><td><code>process.exitCode</code></td><td>One number for the shell: zero means success. <code>&amp;&amp;</code>, <code>||</code> and CI all read it.</td></tr>
        </tbody>
      </TableWrap>
      <TableWrap>
        <thead>
          <tr><th>Exit code</th><th>Convention</th></tr>
        </thead>
        <tbody>
          <tr><td><code>0</code></td><td>Success</td></tr>
          <tr><td><code>1</code></td><td>General failure: the command was fine, but something went wrong (note not found, file unreadable)</td></tr>
          <tr><td><code>2</code></td><td>Usage error: the command was typed wrongly (unknown option, missing argument)</td></tr>
          <tr><td><code>130</code></td><td>Interrupted with <kbd>Ctrl</kbd>+<kbd>C</kbd> (128 + signal number 2)</td></tr>
        </tbody>
      </TableWrap>

      <h2>The file system API</h2>
      <div className="prose">
        <p>
          <code>node:fs</code> comes in three flavours with the same functions. Pick by context, not by habit.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Flavour</th><th>Example</th><th>Use it</th></tr>
        </thead>
        <tbody>
          <tr><td>Promises</td><td><code>await readFile(f, 'utf8')</code> from <code>node:fs/promises</code></td><td>Almost always. Never blocks the event loop.</td></tr>
          <tr><td>Callbacks</td><td><code>readFile(f, 'utf8', (err, text) =&gt; …)</code> from <code>node:fs</code></td><td>Older code. Chapter 06 shows how it works.</td></tr>
          <tr><td>Synchronous</td><td><code>readFileSync(f, 'utf8')</code> from <code>node:fs</code></td><td>Start-up code and one-shot scripts. Never inside a server's request handling: it blocks every user.</td></tr>
        </tbody>
      </TableWrap>
      <TableWrap>
        <thead>
          <tr><th>Function (fs/promises)</th><th>Does</th></tr>
        </thead>
        <tbody>
          <tr><td><code>readFile(path, 'utf8')</code></td><td>Whole file as a string (without an encoding: a Buffer of bytes)</td></tr>
          <tr><td><code>writeFile(path, data)</code></td><td>Creates or replaces a file</td></tr>
          <tr><td><code>appendFile(path, data)</code></td><td>Adds to the end, creating the file if needed</td></tr>
          <tr><td><code>mkdir(path, {'{ recursive: true }'})</code></td><td>Creates a folder and any missing parents; no error if it exists</td></tr>
          <tr><td><code>readdir(path, {'{ withFileTypes: true }'})</code></td><td>Folder entries, with <code>isFile()</code> / <code>isDirectory()</code></td></tr>
          <tr><td><code>stat(path)</code></td><td>Size, timestamps, type</td></tr>
          <tr><td><code>rename(from, to)</code></td><td>Moves or renames; atomic within one file system</td></tr>
          <tr><td><code>rm(path, {'{ recursive: true, force: true }'})</code></td><td>Deletes files or folders, like <code>rm -rf</code></td></tr>
          <tr><td><code>copyFile(from, to)</code></td><td>Copies one file</td></tr>
        </tbody>
      </TableWrap>
      <Box kind="warn" label="Do not check, then act">
        <p>
          Code like <code>if (existsSync(f)) readFile(f)</code> has a race: the file can disappear between the check and
          the read. Just try the operation and handle the error code. That is exactly what <code>store.ts</code> does
          below with <code>ENOENT</code>.
        </p>
      </Box>
      <TableWrap>
        <thead>
          <tr><th><code>err.code</code></th><th>Meaning</th><th>Typical cause</th></tr>
        </thead>
        <tbody>
          <tr><td><code>ENOENT</code></td><td>No such file or directory</td><td>First run, typo in a path, wrong working folder</td></tr>
          <tr><td><code>EACCES</code>, <code>EPERM</code></td><td>Permission denied</td><td>Writing somewhere your user cannot</td></tr>
          <tr><td><code>EEXIST</code></td><td>Already exists</td><td><code>mkdir</code> without <code>recursive</code>, or the <code>wx</code> flag</td></tr>
          <tr><td><code>EISDIR</code>, <code>ENOTDIR</code></td><td>Expected a file and found a folder, or the reverse</td><td>Wrong path</td></tr>
          <tr><td><code>EMFILE</code></td><td>Too many open files</td><td>Opening thousands of files at once (chapter 06 shows how to limit that)</td></tr>
        </tbody>
      </TableWrap>

      <h2>Paths</h2>
      <div className="prose">
        <p>
          Never build paths by gluing strings with <code>'/'</code>: Windows uses <code>\</code>, and doubled or missing
          slashes cause subtle bugs. <code>node:path</code> does it correctly for the OS you run on.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Call</th><th>Result</th></tr>
        </thead>
        <tbody>
          <tr><td><code>path.join('/data', 'notes', '..', 'todo.json')</code></td><td><code>/data/todo.json</code> (joins and tidies)</td></tr>
          <tr><td><code>path.resolve('notes.json')</code></td><td>An absolute path: the current working folder plus the name</td></tr>
          <tr><td><code>path.dirname('/data/notes/todo.json')</code></td><td><code>/data/notes</code></td></tr>
          <tr><td><code>path.basename('/data/notes/todo.json', '.json')</code></td><td><code>todo</code></td></tr>
          <tr><td><code>path.extname('archive.tar.gz')</code></td><td><code>.gz</code> (only the last extension)</td></tr>
          <tr><td><code>path.relative('/data/notes', '/data/backup/todo.json')</code></td><td><code>../backup/todo.json</code></td></tr>
          <tr><td><code>path.win32.join('C:\\data', 'notes')</code></td><td><code>C:\data\notes</code>: Windows rules on any OS</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          Relative paths are resolved against <code>process.cwd()</code>, the folder the user ran the command from, not
          the folder your code is in. For files that ship with your code, use <code>import.meta.dirname</code>. For user
          data, use a known place such as <code>os.homedir()</code>.
        </p>
      </div>

      <h2>The design</h2>
      <div className="prose">
        <p>
          The project has three files with three jobs. Pure logic knows nothing about disks or terminals; storage knows
          nothing about commands; the CLI layer turns words into calls and results into text. This split, sometimes
          called <em>functional core, imperative shell</em>, is why the same <code>notes.ts</code> could later sit behind
          an HTTP API unchanged.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>File</th><th>Job</th><th>Uses</th></tr>
        </thead>
        <tbody>
          <tr><td><code>src/notes.ts</code></td><td>The <code>Note</code> type and pure functions: add, find, remove</td><td>Nothing from Node</td></tr>
          <tr><td><code>src/store.ts</code></td><td>Load and save the JSON file safely</td><td><code>fs/promises</code>, <code>path</code>, <code>os</code></td></tr>
          <tr><td><code>src/cli.ts</code></td><td>Parse arguments, run a command, print, set the exit code</td><td><code>util</code>, <code>readline/promises</code>, <code>process</code></td></tr>
        </tbody>
      </TableWrap>

      <Step n={1}>Set up the project</Step>
      <Terminal>{`
cd ~/Developer/StudyGuide/github-portfolio/NodeJS/projects
mkdir -p 03-notes-cli/src && cd 03-notes-cli
cp ../01-hello-node/{tsconfig.json,.gitignore,.node-version} .
npm init -y
npm install --save-dev typescript @types/node@24`}</Terminal>
      <div className="prose">
        <p>Then edit <code>package.json</code> to match. The <code>bin</code> field is used in step 6.</p>
      </div>
      <CodeFile path="03-notes-cli/package.json" />

      <Step n={2}>The pure core</Step>
      <CodeFile path="03-notes-cli/src/notes.ts" />
      <div className="prose">
        <ul>
          <li><code>createdAt</code> is an ISO string, not a <code>Date</code>: JSON has no date type, so a <code>Date</code> would come back from the file as a string anyway.</li>
          <li><code>NoteNotFoundError</code> is a custom error class. Callers can tell it apart with <code>instanceof</code> and treat it as an expected failure rather than a bug.</li>
          <li><code>Math.max(0, ...ids) + 1</code> gives the next id, and <code>1</code> for an empty list.</li>
        </ul>
      </div>

      <Step n={3}>Safe storage</Step>
      <CodeFile path="03-notes-cli/src/store.ts" />
      <div className="prose">
        <ul>
          <li>
            <strong><code>process.env.NOTES_FILE ?? …</code></strong>: an environment variable overrides the default
            location. You will use it to experiment without touching your real home folder.
          </li>
          <li>
            <strong>Errors by code</strong>: a missing file (<code>ENOENT</code>) means "no notes yet" and returns an
            empty list. Any other read error is rethrown, because hiding a permissions problem would be worse.{' '}
            <code>isErrnoException</code> is a <em>type guard</em>: after it returns true, TypeScript knows{' '}
            <code>err.code</code> exists.
          </li>
          <li>
            <strong><code>unknown</code>, then check</strong>: <code>JSON.parse</code> returns whatever is in the file.
            Typing it <code>unknown</code> forces a check before use. A real app would validate every field, as chapter
            11 does with Zod.
          </li>
        </ul>
      </div>
      <Box kind="key" label="Atomic writes">
        <p>
          <code>writeFile</code> truncates the file and then writes. If the process dies in between (power cut, crash,{' '}
          <kbd>Ctrl</kbd>+<kbd>C</kbd>), the file is left empty or half-written and every note is gone. Writing a
          temporary file and then calling <code>rename</code> avoids that: a rename on the same file system is{' '}
          <strong>atomic</strong>, so the notes file is always either the complete old version or the complete new one.
          Databases, package managers and editors all use this trick.
        </p>
      </Box>

      <Step n={4}>The command-line layer</Step>
      <CodeFile path="03-notes-cli/src/cli.ts" />
      <TableWrap>
        <thead>
          <tr><th>Piece</th><th>What to notice</th></tr>
        </thead>
        <tbody>
          <tr><td><code>#!/usr/bin/env node</code></td><td>The <em>shebang</em>. Lets the file run as a command on macOS and Linux (step 6). Node ignores it.</td></tr>
          <tr><td><code>parseArgs</code></td><td>Declares each option's type, short alias and default. <code>allowPositionals</code> accepts the command and its words. Unknown options throw, which the CLI reports as a usage error. TypeScript infers <code>values.all</code> as <code>boolean</code> from the config.</td></tr>
          <tr><td><code>UsageError</code></td><td>Separates "typed it wrong" (exit 2, show help hint) from "it went wrong" (exit 1).</td></tr>
          <tr><td><code>process.exitCode = …</code></td><td>Sets the exit code and lets Node finish normally, flushing any output still being written.</td></tr>
          <tr><td><code>console.error</code></td><td>All errors go to stderr.</td></tr>
          <tr><td><code>styleText</code></td><td>Built-in colours. Checks whether stdout is a terminal and respects <code>NO_COLOR</code> (step 7).</td></tr>
          <tr><td><code>createInterface</code> + <code>rl.question</code></td><td>Asks a question and awaits a line of input. <code>finally</code> closes it, or the process would keep waiting for more input.</td></tr>
          <tr><td>Top-level <code>await main()</code></td><td>Every error ends up in one <code>catch</code>. Expected errors print one line; unexpected ones print the stack, because they are bugs.</td></tr>
        </tbody>
      </TableWrap>
      <Box kind="warn" label="process.exit() versus process.exitCode">
        <p>
          <code>process.exit(1)</code> stops the process immediately: pending file writes, unflushed output to a pipe and{' '}
          <code>finally</code> blocks may never complete. Prefer setting <code>process.exitCode</code> and returning, so
          the event loop empties naturally. Keep <code>process.exit()</code> for the rare case where you must stop at once.
        </p>
      </Box>

      <Step n={5}>Use it</Step>
      <div className="prose">
        <p>Point the tool at a scratch file first, so experiments never touch <code>~/.notes.json</code>.</p>
      </div>
      <Terminal>{`
export NOTES_FILE=/tmp/notes-dev.json
node src/cli.ts list
node src/cli.ts add Buy milk
node src/cli.ts add "Read chapter 05"
node src/cli.ts add Call the bank
node src/cli.ts list
node src/cli.ts done 2
node src/cli.ts list
node src/cli.ts list --all
node src/cli.ts remove 3`}</Terminal>
      <Output>{`
No notes yet. Add one with: notes add <text>
Added #1: Buy milk
Added #2: Read chapter 05
Added #3: Call the bank
[ ] #1 Buy milk
[ ] #2 Read chapter 05
[ ] #3 Call the bank
Completed #2: Read chapter 05
[ ] #1 Buy milk
[ ] #3 Call the bank
[ ] #1 Buy milk
[x] #2 Read chapter 05
[ ] #3 Call the bank
Removed #3`}</Output>
      <div className="prose">
        <p>
          <code>add Buy milk</code> and <code>add "Buy milk"</code> behave the same, because <code>add</code> joins all its
          positional words. Open <code>/tmp/notes-dev.json</code> to see what was stored:
        </p>
      </div>
      <Output caption="/tmp/notes-dev.json">{`
[
  {
    "id": 1,
    "text": "Buy milk",
    "done": false,
    "createdAt": "2026-10-12T06:58:22.154Z"
  },
  {
    "id": 2,
    "text": "Read chapter 05",
    "done": true,
    "createdAt": "2026-10-12T06:58:22.220Z"
  }
]`}</Output>
      <div className="prose">
        <p>Now the failures. After each one, <code>echo $?</code> prints the exit code of the last command.</p>
      </div>
      <Terminal>{`
node src/cli.ts done 9;  echo $?
node src/cli.ts done abc; echo $?
node src/cli.ts add;      echo $?
node src/cli.ts fly;      echo $?
node src/cli.ts list --colour; echo $?`}</Terminal>
      <Output>{`
Error: There is no note #9.
1
Error: Expected a note number, got "abc".
Run "notes --help" for usage.
2
Error: add needs some text, e.g. notes add Buy milk
Run "notes --help" for usage.
2
Error: Unknown command "fly".
Run "notes --help" for usage.
2
Error: Unknown option '--colour'. To specify a positional argument starting with a '-', place it at the end of the command after '--', as in '-- "--colour"
Run "notes --help" for usage.
2`}</Output>
      <Box kind="try" label="Try it: stdout and stderr are different streams">
        <Terminal>{`
node src/cli.ts list > list.txt          # the list goes into the file, nothing on screen
node src/cli.ts done 7 > list.txt        # the error still appears on screen
node src/cli.ts done 7 2> errors.txt     # 2> redirects stderr instead
cat errors.txt`}</Terminal>
        <Output>{`
Error: There is no note #7.
Error: There is no note #7.`}</Output>
        <p>
          The first line is from the second command: redirecting stdout did not hide the error. The second line is the
          contents of <code>errors.txt</code>. Tools that print errors to stdout corrupt files and pipelines; yours does not.
        </p>
      </Box>
      <Step n={6}>Colours that know when to stop</Step>
      <div className="prose">
        <p>
          Your notes file still holds the two notes from step 5. In a terminal, done notes show a green{' '}
          <code>[x]</code> and the ids are bold. Colours are invisible escape
          codes, which turn into rubbish when output goes to a file or another program. <code>styleText</code> checks the
          stream for you:
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Situation</th><th>Colours?</th></tr>
        </thead>
        <tbody>
          <tr><td>stdout is a terminal</td><td>Yes</td></tr>
          <tr><td>Piped or redirected (<code>| cat</code>, <code>&gt; file</code>)</td><td>No</td></tr>
          <tr><td><code>NO_COLOR=1</code> is set</td><td>No (a widely followed convention, see no-color.org)</td></tr>
          <tr><td><code>FORCE_COLOR=1</code> is set</td><td>Yes, even into a pipe; wins over <code>NO_COLOR</code>, with a warning</td></tr>
        </tbody>
      </TableWrap>
      <Terminal>{`
node src/cli.ts list --all | cat -v                 # cat -v shows escape codes as text
FORCE_COLOR=1 node src/cli.ts list --all | cat -v`}</Terminal>
      <Output>{`
[ ] #1 Buy milk
[x] #2 Read chapter 05
[ ] ^[[1m#1^[[22m Buy milk
^[[32m[x]^[[39m ^[[1m#2^[[22m ^[[2mRead chapter 05^[[22m`}</Output>
      <div className="prose">
        <p>
          <code>^[[32m</code> means "green", <code>^[[39m</code> "default colour", <code>^[[1m</code> "bold". Piped without{' '}
          <code>FORCE_COLOR</code>, the output is clean text.
        </p>
      </div>

      <Step n={7}>Confirmation, and running non-interactively</Step>
      <div className="prose">
        <p><code>clear</code> asks first. In a terminal you type the answer; in a script you either pipe it in or pass <code>--yes</code>.</p>
      </div>
      <Terminal>{`
node src/cli.ts clear            # type n, then Enter
node src/cli.ts clear            # type y, then Enter
node src/cli.ts add Water plants
echo n | node src/cli.ts clear   # the answer comes from the pipe
node src/cli.ts clear --yes      # no question at all`}</Terminal>
      <Output>{`
Delete 2 notes? (y/N) n
Nothing deleted.
Delete 2 notes? (y/N) y
Deleted 2 notes.
Added #1: Water plants
Delete 1 note? (y/N) Nothing deleted.
Deleted 1 note.`}</Output>
      <div className="prose">
        <p>
          When the answer is piped, nothing echoes it, so the result appears straight after the question. The capital{' '}
          <code>N</code> in <code>(y/N)</code> is the convention for "pressing Enter means no".
        </p>
      </div>

      <Box kind="try" label="Try it: a corrupt file">
        <p>Write rubbish into the notes file, run the tool, then delete the file and run it again.</p>
        <Terminal>{`
echo "{ not json" > /tmp/notes-dev.json
node src/cli.ts list; echo $?
rm /tmp/notes-dev.json
node src/cli.ts list`}</Terminal>
        <Output>{`
Error: /tmp/notes-dev.json is not valid JSON. Fix it or delete it.
1
No notes yet. Add one with: notes add <text>`}</Output>
      </Box>

      <Step n={8}>Make it a real command</Step>
      <div className="prose">
        <p>
          The <code>notes</code> script in <code>package.json</code> is the quickest alias. npm prints a banner before
          running a script; <code>-s</code> (silent) hides it, which matters when the output is piped somewhere.
        </p>
      </div>
      <Terminal>{`
npm run notes -- list
npm run -s notes -- list`}</Terminal>
      <Output>{`
> 03-notes-cli@1.0.0 notes
> node src/cli.ts list

No notes yet. Add one with: notes add <text>
No notes yet. Add one with: notes add <text>`}</Output>
      <div className="prose">
        <p>
          To type <code>notes</code> from any folder, use the <code>bin</code> field. <code>npm link</code> creates a
          global symlink named after each <code>bin</code> entry, pointing at your file, and makes the file executable.
          The shebang tells the shell to run it with <code>node</code>, which strips the types as usual.
        </p>
      </div>
      <Terminal>{`
npm link
cd ~
notes add Linked from anywhere
notes list
npm unlink -g 03-notes-cli      # removes the global command again`}</Terminal>
      <Output>{`
added 1 package, and audited 3 packages in 195ms

found 0 vulnerabilities
Added #1: Linked from anywhere
[ ] #1 Linked from anywhere

removed 1 package in 104ms`}</Output>
      <Box kind="tip" label="Where did it go?">
        <p>
          With fnm, global packages live inside the folder of the current Node version, so <code>npm link</code> needs no{' '}
          <code>sudo</code>, and switching Node versions hides the command until you link again. Published CLIs ship
          compiled JavaScript instead, because Node will not strip types inside <code>node_modules</code>; linking works
          here because the symlink points back to your project folder.
        </p>
      </Box>

      <Exercises
        items={[
          {
            task: <>Add <code>edit &lt;id&gt; &lt;text…&gt;</code>, which replaces a note's text. Missing text is a usage error.</>,
            hint: <>Reuse <code>findNote</code> and <code>parseId</code>; the new text is <code>rest.slice(1).join(' ')</code>. Add the command to <code>USAGE</code> too.</>,
            solution: (
              <>
                <p>The solution file below contains all three exercises.</p>
                <CodeFile path="03-notes-cli.practice/src/cli.ts" />
              </>
            ),
          },
          {
            task: <>Add a <code>--json</code> option to <code>list</code> that prints the notes as JSON, so other programs can use them (try <code>notes list --json | jq length</code> if you have jq).</>,
            hint: <>Declare <code>json: {'{ type: \'boolean\', default: false }'}</code> in <code>parseArgs</code>, and print <code>JSON.stringify(shown, null, 2)</code> before the "no notes" check, so an empty list prints <code>[]</code>.</>,
            solution: <>See the <code>list</code> case in the solution above.</>,
          },
          {
            task: <>Add <code>stats</code>: total, open and done counts, and how many days ago the oldest open note was added.</>,
            hint: <><code>Date.parse(createdAt)</code> gives milliseconds; a day is <code>86_400_000</code> ms. The numeric separator <code>_</code> is only for readability.</>,
            solution: (
              <Output>{`
$ notes add Buy milk
$ notes add Read chapter 05
$ notes edit 1 Buy oat milk
Updated #1: Buy oat milk
$ notes done 2
$ notes stats
2 total, 1 open, 1 done
Oldest open note: #1, added 0 day(s) ago`}</Output>
            ),
          },
        ]}
      />

      <Checkpoint question="Why does saveNotes write a temporary file and rename it, instead of calling writeFile on the notes file directly?">
        <p>
          <code>writeFile</code> empties the file before writing the new contents. A crash in between leaves an empty or
          partial file and loses every note. <code>rename</code> within one file system is atomic: other readers see
          either the old complete file or the new complete file, never anything in between.
        </p>
      </Checkpoint>
      <Checkpoint question={<>A script runs <code>notes list &gt; todo.txt &amp;&amp; echo saved</code>, and the notes file is corrupt. What ends up in <code>todo.txt</code>, what appears on screen, and is <code>saved</code> printed?</>}>
        <p>
          <code>todo.txt</code> is empty, because nothing was written to stdout. The error appears on screen, because it
          went to stderr. <code>saved</code> is not printed: the tool exited with code 1, and <code>&amp;&amp;</code> only
          runs the next command after a zero exit code.
        </p>
      </Checkpoint>

      <Recap>
        <ul>
          <li>A CLI's contract: arguments and environment in; stdout for results, stderr for errors, and an exit code (0 ok, 1 failed, 2 misuse).</li>
          <li><code>util.parseArgs</code> handles options, short aliases, defaults and unknown-option errors with no dependency.</li>
          <li>Use <code>fs/promises</code>; handle failures by <code>err.code</code>; never check-then-act.</li>
          <li>Build paths with <code>node:path</code>. Relative paths follow <code>process.cwd()</code>, not your file's location.</li>
          <li>Write important files atomically: temporary file, then <code>rename</code>.</li>
          <li>Prefer <code>process.exitCode</code> to <code>process.exit()</code>; <code>styleText</code> switches colours off for pipes and <code>NO_COLOR</code>.</li>
        </ul>
      </Recap>
    </>
  );
}
