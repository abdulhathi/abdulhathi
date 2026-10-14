import { CodeFile, Terminal } from '../components/Code';
import { Box, ChapterIntro, Checkpoint, Exercises, Output, Recap, Step, TableWrap } from '../components/Content';
import { Diagram } from '../diagrams/Diagram';
import { typescriptFlow } from '../diagrams/specs/foundations';

export function Setup() {
  return (
    <>
      <ChapterIntro
        time="60–75 minutes"
        project="01-hello-node"
        learn={[
          'Install Node 24 with a version manager, and switch versions per project',
          'Create a package.json and know what each field does',
          'Install packages, and the difference between dependencies and devDependencies',
          'Configure TypeScript so Node runs .ts files with no build step',
          'Run, watch and type-check a project with npm scripts',
          'The four rules of writing TypeScript that Node can run',
        ]}
        tools={[
          { name: 'fnm', what: 'Fast Node Manager. Installs Node versions and switches between them.' },
          { name: 'npm', what: 'Comes with Node. Installs packages and runs project scripts.' },
          { name: 'npx', what: 'Runs a command from a package, installed locally or fetched on demand.' },
          { name: 'typescript', what: 'The tsc compiler. Here it only checks types; Node runs the code.' },
          { name: '@types/node', what: 'Type definitions for Node’s built-in modules.' },
          { name: 'VS Code', what: 'Editor with TypeScript support built in.' },
        ]}
      />

      <h2>The toolchain</h2>
      <div className="prose">
        <p>
          Every project in this course uses the same small set of tools. You install two things globally (a version
          manager and an editor); everything else is installed per project, so each project records exactly what it
          needs.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Tool</th><th>Job</th><th>Installed</th></tr>
        </thead>
        <tbody>
          <tr><td>fnm</td><td>Installs Node versions; picks the right one when you enter a project folder</td><td>Once, globally</td></tr>
          <tr><td>node</td><td>Runs JavaScript and TypeScript files</td><td>By fnm</td></tr>
          <tr><td>npm, npx</td><td>Package manager and package runner</td><td>Bundled with Node</td></tr>
          <tr><td>typescript</td><td>Type checker (<code>tsc</code>)</td><td>Per project, as a dev dependency</td></tr>
          <tr><td>@types/node</td><td>Types for <code>node:fs</code>, <code>process</code> and friends</td><td>Per project, as a dev dependency</td></tr>
          <tr><td>git</td><td>Version control for every project</td><td>Once (comes with Xcode tools on macOS)</td></tr>
        </tbody>
      </TableWrap>

      <Step n={1}>Install Node 24 with fnm</Step>
      <div className="prose">
        <p>
          You could download an installer from nodejs.org, but then every project shares one version. A version manager
          lets one project stay on Node 24 while another tries Node 26, and installs everything in your home folder, so
          you never need <code>sudo</code>. This course uses <strong>fnm</strong> because it is fast and reads a{' '}
          <code>.node-version</code> file automatically. (nvm works too, with the same ideas.)
        </p>
      </div>
      <Terminal title="macOS (zsh)">{`
brew install fnm
echo 'eval "$(fnm env --use-on-cd --shell zsh)"' >> ~/.zshrc
exec zsh                 # reload the shell so the line above takes effect
fnm install 24
fnm default 24`}</Terminal>
      <Terminal title="Windows (PowerShell)">{`
winget install Schniz.fnm
# add this line to your PowerShell profile (notepad $PROFILE), then open a new window:
fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression
fnm install 24
fnm default 24`}</Terminal>
      <Terminal title="Linux">{`
curl -fsSL https://fnm.vercel.app/install | bash
exec $SHELL
fnm install 24
fnm default 24`}</Terminal>
      <Terminal title="Check it worked">{`
node -v
npm -v
which node        # on Windows: where.exe node`}</Terminal>
      <Output>{`
v24.21.0
11.19.0
/Users/you/…/fnm_multishells/48213_1760195431000/bin/node`}</Output>
      <Box kind="warn" label="Still seeing an old version?">
        <p>
          If <code>node -v</code> prints something else, such as <code>v25.x</code>, an older Node installed by
          Homebrew or an installer is earlier on your <code>PATH</code>. The <code>which node</code> path should contain{' '}
          <code>fnm</code>. Fix it by making the <code>fnm env</code> line the last line of <code>~/.zshrc</code>, or remove
          the old one with <code>brew uninstall node</code>.
        </p>
      </Box>
      <TableWrap>
        <thead>
          <tr><th>fnm command</th><th>What it does</th></tr>
        </thead>
        <tbody>
          <tr><td><code>fnm install 24</code></td><td>Installs the newest 24.x release</td></tr>
          <tr><td><code>fnm default 24</code></td><td>Uses 24 in every new terminal</td></tr>
          <tr><td><code>fnm use 26</code></td><td>Switches this terminal to 26 (install it first)</td></tr>
          <tr><td><code>fnm list</code></td><td>Shows installed versions</td></tr>
          <tr><td><code>fnm current</code></td><td>Shows the version in use</td></tr>
        </tbody>
      </TableWrap>

      <Step n={2}>Set up your editor</Step>
      <div className="prose">
        <p>
          VS Code understands TypeScript out of the box: red underlines, autocomplete and go-to-definition all work as
          soon as a folder has a <code>tsconfig.json</code>. Always open the <strong>project folder</strong>, not a
          single file, so the editor finds that config. In VS Code, run <em>Shell Command: Install 'code' command in
          PATH</em> once from the command palette, and you can open any folder from the terminal with{' '}
          <code>code .</code>.
        </p>
      </div>

      <Step n={3}>Create the project</Step>
      <Terminal>{`
cd ~/Developer/StudyGuide/github-portfolio/NodeJS/projects
mkdir 01-hello-node && cd 01-hello-node
npm init -y`}</Terminal>
      <Output>{`
Wrote to ~/…/projects/01-hello-node/package.json:

{
  "name": "01-hello-node",
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  "scripts": {
    "test": "echo \\"Error: no test specified\\" && exit 1"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "type": "commonjs"
}`}</Output>
      <div className="prose">
        <p>
          <code>npm init -y</code> writes a <code>package.json</code> with default answers. That file is the identity
          card of every Node project: its name, its dependencies and the commands it knows. Notice{' '}
          <code>"type": "commonjs"</code>. That selects the old module system. Switch it to ES modules straight away:
        </p>
      </div>
      <Terminal>{`npm pkg set type=module`}</Terminal>

      <Step n={4}>Install TypeScript and Node's types</Step>
      <Terminal>{`npm install --save-dev typescript @types/node@24`}</Terminal>
      <Output>{`
added 4 packages, and audited 5 packages in 627ms

found 0 vulnerabilities`}</Output>
      <div className="prose">
        <p>Three things just happened:</p>
        <ul>
          <li>
            The packages were downloaded into <code>node_modules/</code>. Never edit or commit that folder; anyone can
            recreate it with <code>npm install</code>.
          </li>
          <li>
            They were recorded under <code>devDependencies</code> in <code>package.json</code>, because{' '}
            <code>--save-dev</code> marks them as tools for development. Packages your code imports at run time go in{' '}
            <code>dependencies</code> (plain <code>npm install name</code>).
          </li>
          <li>
            <code>package-lock.json</code> appeared. It pins the exact version of every package, including the
            packages those packages need. Commit it, so everyone installs identical code.
          </li>
        </ul>
        <p>
          The <code>@24</code> in <code>@types/node@24</code> matters: the types should describe the Node major version
          you run, or the editor may offer functions your Node does not have.
        </p>
      </div>

      <Step n={5}>Tidy package.json</Step>
      <div className="prose">
        <p>Open <code>package.json</code> and make it look like this. You can delete the fields <code>npm init</code> added that an application does not need.</p>
      </div>
      <CodeFile path="01-hello-node/package.json" />
      <TableWrap>
        <thead>
          <tr><th>Field</th><th>Meaning</th></tr>
        </thead>
        <tbody>
          <tr><td><code>name</code>, <code>version</code></td><td>Identify the package. Required if you ever publish it to npm.</td></tr>
          <tr><td><code>private: true</code></td><td>Stops <code>npm publish</code> from uploading it by accident.</td></tr>
          <tr><td><code>type: "module"</code></td><td>Every <code>.ts</code> and <code>.js</code> file in the project is an ES module.</td></tr>
          <tr><td><code>engines</code></td><td>Documents the Node version the project needs. <code>npm install</code> prints an <code>EBADENGINE</code> warning on a mismatch, and hosting platforms read it.</td></tr>
          <tr><td><code>scripts</code></td><td>Named commands. <code>npm start</code> runs <code>start</code>; anything else is <code>npm run &lt;name&gt;</code>. Scripts can call tools in <code>node_modules/.bin</code>, such as <code>tsc</code>, without a path.</td></tr>
          <tr><td><code>devDependencies</code></td><td>Tools needed only while developing. <code>^7.0.2</code> means "7.0.2 or any newer 7.x" (chapter 04 explains ranges).</td></tr>
        </tbody>
      </TableWrap>

      <Step n={6}>Configure TypeScript</Step>
      <div className="prose">
        <p>
          Node 24 runs <code>.ts</code> files by <strong>type stripping</strong>: it deletes the type annotations and
          runs the JavaScript that is left. It never checks whether your types are correct. That job belongs to{' '}
          <code>tsc</code>, which reads the same files and reports errors but writes nothing. Two tools, two jobs.
        </p>
      </div>
      <Diagram spec={typescriptFlow} caption="Running and type checking are separate. Node runs your code even if it has type errors, so run tsc before you trust it." />
      <div className="prose">
        <p>Create <code>tsconfig.json</code> in the project folder. TypeScript config files allow comments.</p>
      </div>
      <CodeFile path="01-hello-node/tsconfig.json" />
      <TableWrap>
        <thead>
          <tr><th>Option</th><th>Why it is set</th></tr>
        </thead>
        <tbody>
          <tr><td><code>noEmit</code></td><td>tsc only checks. Node runs the <code>.ts</code> files directly, so there is nothing to build.</td></tr>
          <tr><td><code>target: esnext</code></td><td>Node 24 understands all modern JavaScript, so tsc should not expect older syntax.</td></tr>
          <tr><td><code>module: nodenext</code></td><td>Resolve imports exactly the way Node does, including its ES module rules.</td></tr>
          <tr><td><code>types: ["node"]</code></td><td>Load <code>@types/node</code>. Since TypeScript 6, no types load unless you list them.</td></tr>
          <tr><td><code>erasableSyntaxOnly</code></td><td>Reject TypeScript features that generate code (<code>enum</code>, <code>namespace</code>, constructor parameter properties). Node cannot strip those.</td></tr>
          <tr><td><code>verbatimModuleSyntax</code></td><td>Imports used only as types must say <code>import type</code>, so Node can delete them safely.</td></tr>
          <tr><td><code>allowImportingTsExtensions</code></td><td>Allow <code>import ... from './greet.ts'</code>, the form Node needs.</td></tr>
          <tr><td><code>strict</code>, <code>noUncheckedIndexedAccess</code></td><td>Maximum checking. The second makes <code>array[0]</code> possibly <code>undefined</code>, which it is.</td></tr>
          <tr><td><code>skipLibCheck</code></td><td>Do not type-check the <code>.d.ts</code> files inside <code>node_modules</code>. Faster, and not your code.</td></tr>
        </tbody>
      </TableWrap>
      <Box kind="key" label="The four rules of TypeScript in Node">
        <ol>
          <li><strong>Relative imports name the real file:</strong> <code>'./greet.ts'</code>, never <code>'./greet'</code>. Node does not guess extensions.</li>
          <li><strong>Type-only imports say so:</strong> <code>import type {'{ Task }'} from './types.ts'</code>.</li>
          <li><strong>No code-generating syntax:</strong> use a union like <code>'low' | 'high'</code> or an <code>as const</code> object instead of <code>enum</code>.</li>
          <li><strong>Types vanish at run time.</strong> Data from users, files or the network must be checked with real code. Chapter 11 uses Zod for that.</li>
        </ol>
      </Box>

      <Step n={7}>Write the code</Step>
      <div className="prose">
        <p>Create a <code>src</code> folder with two files. The first is a small module with no Node-specific code at all.</p>
      </div>
      <CodeFile path="01-hello-node/src/greet.ts" />
      <div className="prose">
        <p>The second is the entry point. It uses three things only Node has: the <code>process</code> global, the <code>node:os</code> module and <code>import.meta.filename</code>.</p>
      </div>
      <CodeFile path="01-hello-node/src/index.ts" />
      <TableWrap>
        <thead>
          <tr><th>Expression</th><th>Gives you</th></tr>
        </thead>
        <tbody>
          <tr><td><code>process.argv</code></td><td>Command-line words. Index 2 onwards are yours. Its type is <code>string[]</code>, so with <code>noUncheckedIndexedAccess</code> index 2 is <code>string | undefined</code>, which is why <code>??</code> supplies a default.</td></tr>
          <tr><td><code>os.userInfo().username</code></td><td>The logged-in user's name.</td></tr>
          <tr><td><code>process.version</code>, <code>.platform</code>, <code>.arch</code></td><td>Node version, OS (<code>darwin</code>, <code>linux</code>, <code>win32</code>) and CPU type.</td></tr>
          <tr><td><code>import.meta.filename</code></td><td>Absolute path of the current file. <code>import.meta.dirname</code> gives its folder.</td></tr>
          <tr><td><code>process.pid</code>, <code>process.uptime()</code></td><td>The operating system's id for this process, and seconds since it started.</td></tr>
        </tbody>
      </TableWrap>

      <Step n={8}>Run it</Step>
      <Terminal>{`
npm start
npm start -- Ada          # everything after -- goes to your script
node src/index.ts Grace   # what npm start does underneath`}</Terminal>
      <Output>{`
> 01-hello-node@1.0.0 start
> node src/index.ts

Good evening, abdulhathi!
Node v24.21.0 on darwin (arm64)
This file: ~/…/projects/01-hello-node/src/index.ts
Process 96093 has been running for 0.06s

> 01-hello-node@1.0.0 start
> node src/index.ts Ada

Good evening, Ada!
…

Good evening, Grace!
…`}</Output>
      <div className="prose">
        <p>The greeting follows your clock, and the name defaults to your user name. A Node process starts in well under a tenth of a second.</p>
      </div>

      <Step n={9}>Watch mode</Step>
      <div className="prose">
        <p>
          <code>node --watch</code> reruns the program whenever a file it imported changes. Start it, then change the
          greeting text in <code>greet.ts</code> and save.
        </p>
      </div>
      <Terminal>{`npm run dev -- Ada`}</Terminal>
      <Output>{`
Good evening, Ada!
Node v24.21.0 on darwin (arm64)
…
Completed running 'src/index.ts Ada'. Waiting for file changes before restarting...
Restarting 'src/index.ts Ada'
Good evening, Ada! Welcome to Node.js.
…
Completed running 'src/index.ts Ada'. Waiting for file changes before restarting...`}</Output>
      <div className="prose">
        <p>
          Watch mode clears the terminal on each restart; add <code>--watch-preserve-output</code> to keep the history.
          Press <kbd>Ctrl</kbd>+<kbd>C</kbd> to stop. For servers, which never "complete", it restarts the server on every
          save, which is exactly what you want while developing.
        </p>
      </div>

      <Step n={10}>Break it on purpose</Step>
      <div className="prose">
        <p>Change one line of <code>index.ts</code> to pass a number where a string belongs, then run and type-check.</p>
      </div>
      <Terminal>{`
# in src/index.ts:  console.log(greet(42));
npm start
npm run typecheck`}</Terminal>
      <Output panes={[
        { tag: 'npm start', text: 'Good evening, 42!\n…' },
        { tag: 'npm run typecheck', text: "src/index.ts(7,19): error TS2345: Argument of type 'number'\n  is not assignable to parameter of type 'string'." },
      ]} />
      <div className="prose">
        <p>
          Node happily ran it: types are deleted before execution, so they cannot stop anything. Only <code>tsc</code>{' '}
          caught the mistake, and it tells you the file, line and column. Make <code>npm run typecheck</code> a habit
          before every commit; chapter 19 makes CI run it on every push. Undo the change before moving on.
        </p>
      </div>
      <Box kind="try" label="Try it: two more errors you will meet">
        <ol>
          <li>
            <p>Change the import to <code>from './greet'</code> (no extension) and run <code>npm start</code>:</p>
            <Output caption="Node says">{`Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…/src/greet' imported from …/src/index.ts`}</Output>
            <p>
              <code>tsc</code> reports the same problem as <code>TS2835</code> and suggests <code>'./greet.js'</code>.
              That advice is for projects that compile to JavaScript; in this course the answer is <code>'./greet.ts'</code>.
            </p>
          </li>
          <li>
            <p>Create <code>src/color.ts</code> containing <code>export enum Color {'{ Red, Green }'}</code> and run it with <code>node src/color.ts</code>:</p>
            <Output caption="Node says">{`SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]: TypeScript enum is not supported in strip-only mode`}</Output>
            <p>
              and <code>tsc</code> says <code>TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled.</code>{' '}
              Use <code>type Color = 'red' | 'green'</code> instead, then delete the file.
            </p>
          </li>
        </ol>
      </Box>

      <Step n={11}>Commit it</Step>
      <div className="prose">
        <p>
          Add two small files. <code>.gitignore</code> keeps installed packages, build output and secrets out of git.{' '}
          <code>.node-version</code> tells fnm (and many hosting platforms) which Node to use in this folder.
        </p>
      </div>
      <CodeFile path="01-hello-node/.gitignore" />
      <CodeFile path="01-hello-node/.node-version" />
      <Terminal>{`
git init
git add .
git commit -m "Hello Node: TypeScript on Node 24 without a build step"`}</Terminal>
      <Box kind="tip" label="Your template">
        <p>
          Every later project starts with these same five files: <code>package.json</code>, <code>tsconfig.json</code>,{' '}
          <code>.gitignore</code>, <code>.node-version</code> and a <code>src</code> folder. Chapters say{' '}
          <em>"set up the project as in chapter 03"</em> and then list only what differs.
        </p>
      </Box>

      <Exercises
        items={[
          {
            task: <>Add a <code>--shout</code> flag: <code>npm start -- Ada --shout</code> prints the greeting in capitals. The name and the flag may come in either order.</>,
            hint: <>Take <code>process.argv.slice(2)</code>, check it with <code>.includes('--shout')</code>, and pick the name with <code>.find()</code> on words that do not start with <code>--</code>.</>,
            solution: <CodeFile path="01-hello-node.practice/src/index.ts" />,
          },
          {
            task: <>Print one more line: the number of CPUs and the free and total memory in megabytes.</>,
            hint: <><code>os.cpus().length</code>, <code>os.freemem()</code> and <code>os.totalmem()</code>. Memory comes in bytes; divide by 1024 twice.</>,
            solution: <>The last two lines of the solution above.</>,
          },
          {
            task: <>Add a <code>'night'</code> part of day for hours before 5 and from 22 onwards. Notice what you must change for the types to stay correct.</>,
            hint: <>Add <code>'night'</code> to the <code>PartOfDay</code> union first, then add the check at the top of <code>partOfDay</code>.</>,
            solution: <CodeFile path="01-hello-node.practice/src/greet.ts" />,
          },
        ]}
      />

      <Checkpoint question={<>A teammate's file has <code>import {'{ db }'} from './db'</code>. It works in their old project, which compiles to JavaScript first, but fails with <code>ERR_MODULE_NOT_FOUND</code> in yours. Why, and what is the fix?</>}>
        <p>
          Node's ES module loader never adds extensions; it looks for a file literally called <code>db</code>. Build
          tools and older resolution modes guessed <code>.js</code> or <code>.ts</code>, which is why it used to work.
          The fix is <code>'./db.ts'</code>, which <code>allowImportingTsExtensions</code> lets tsc accept.
        </p>
      </Checkpoint>

      <Recap>
        <ul>
          <li>Install Node with a version manager and pin the version with <code>.node-version</code>.</li>
          <li><code>package.json</code> holds the project's identity, scripts and dependencies; <code>package-lock.json</code> pins exact versions. Commit both, never <code>node_modules</code>.</li>
          <li>Node 24 runs TypeScript by stripping types. <code>tsc --noEmit</code> is the only thing that checks them.</li>
          <li>Import relative files with their <code>.ts</code> extension, use <code>import type</code> for types, and avoid <code>enum</code> and <code>namespace</code>.</li>
        </ul>
      </Recap>
    </>
  );
}
