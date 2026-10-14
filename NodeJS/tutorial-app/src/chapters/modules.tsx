import { Code, CodeFile, Terminal } from '../components/Code';
import { Box, ChapterIntro, Checkpoint, Exercises, Output, Recap, Step, TableWrap } from '../components/Content';

export function Modules() {
  return (
    <>
      <ChapterIntro
        time="75–90 minutes"
        project="02-modules-lab"
        learn={[
          'What a module is, and why each file gets its own scope',
          'Every form of import and export, live bindings, and when module code runs',
          'JSON imports, import.meta, top-level await and dynamic import()',
          'CommonJS: how to read it, and how the two systems call each other',
          'How Node decides whether a file is ES module or CommonJS',
          'Subpath imports (#lib/…) and the "exports" field',
          'npm properly: dependency types, semver ranges, lockfiles, npm ci and supply-chain safety',
        ]}
        tools={[
          { name: 'node:module', what: 'createRequire(), for the rare ES module that needs require().' },
          { name: 'npm', what: 'install, ci, ls, outdated, audit, view, run.' },
          { name: 'npx', what: 'Runs a command that a package provides, such as semver.' },
          { name: 'semver', what: 'A small real dependency, used to explore version ranges.' },
          { name: '@types/semver', what: 'Its TypeScript types, from the DefinitelyTyped project.' },
        ]}
      />

      <h2>What a module is</h2>
      <div className="prose">
        <p>
          A <strong>module</strong> is one file with its own scope. Variables and functions declared in it are private
          unless the file <strong>exports</strong> them, and another file can only use what it <strong>imports</strong>.
          That gives you three properties that make large programs manageable:
        </p>
        <ul>
          <li><strong>No accidental globals.</strong> Two files can both have a function called <code>parse</code> without clashing.</li>
          <li><strong>Explicit dependencies.</strong> The import lines at the top of a file tell you everything it relies on.</li>
          <li>
            <strong>Evaluated once.</strong> However many files import a module, its top-level code runs the first time
            only. The result is cached, so a module that creates a database pool or a logger naturally shares one
            instance across the whole program.
          </li>
        </ul>
      </div>

      <h2>Two module systems</h2>
      <div className="prose">
        <p>
          Node was born before JavaScript had modules, so it invented its own: <strong>CommonJS</strong>, with{' '}
          <code>require()</code> and <code>module.exports</code>. JavaScript later standardised{' '}
          <strong>ES modules</strong> (ESM), with <code>import</code> and <code>export</code>, which browsers, Deno, Bun
          and Node all support. New code uses ESM. You still need to read CommonJS, because many npm packages and config
          files use it.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th></th><th>ES modules</th><th>CommonJS</th></tr>
        </thead>
        <tbody>
          <tr><td>Syntax</td><td><code>import</code> / <code>export</code></td><td><code>require()</code> / <code>module.exports</code></td></tr>
          <tr><td>Loading</td><td>The whole import graph is found, parsed and linked before any code runs</td><td><code>require()</code> loads and runs the file at the moment it is called, synchronously</td></tr>
          <tr><td>What you import</td><td>Live bindings: you always see the exporter's current value</td><td>A value: whatever <code>module.exports</code> held when you read it</td></tr>
          <tr><td>Top-level <code>await</code></td><td>Yes</td><td>No</td></tr>
          <tr><td>Current file</td><td><code>import.meta.filename</code>, <code>import.meta.dirname</code></td><td><code>__filename</code>, <code>__dirname</code></td></tr>
          <tr><td>Strict mode</td><td>Always</td><td>Only with <code>'use strict'</code></td></tr>
          <tr><td>Using the other</td><td>Can <code>import</code> CommonJS</td><td>Can <code>require()</code> ESM on Node 24, unless it uses top-level await</td></tr>
        </tbody>
      </TableWrap>

      <h2>How Node decides which one a file is</h2>
      <TableWrap>
        <thead>
          <tr><th>File</th><th>Treated as</th></tr>
        </thead>
        <tbody>
          <tr><td><code>.mjs</code>, <code>.mts</code></td><td>Always ES module</td></tr>
          <tr><td><code>.cjs</code>, <code>.cts</code></td><td>Always CommonJS</td></tr>
          <tr><td><code>.js</code>, <code>.ts</code></td><td>Whatever the <code>"type"</code> field of the nearest <code>package.json</code> says: <code>"module"</code> or <code>"commonjs"</code></td></tr>
          <tr><td><code>.js</code>, <code>.ts</code> with no <code>"type"</code></td><td>CommonJS, unless the file contains <code>import</code> or <code>export</code>, in which case Node parses it a second time as ESM and warns</td></tr>
        </tbody>
      </TableWrap>
      <Box kind="warn" label="The warning that means you forgot the type field">
        <Output caption="Running a file with import syntax in a package without &quot;type&quot;">{`
[MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file://…/c.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to …/package.json.`}</Output>
        <p>The code still runs, but every file is parsed twice. Set <code>"type": "module"</code>, as chapter 03 did.</p>
      </Box>

      <Step n={1}>Set up the project</Step>
      <div className="prose">
        <p>
          Create <code>projects/02-modules-lab</code> as in chapter 03: copy <code>tsconfig.json</code>,{' '}
          <code>.gitignore</code> and <code>.node-version</code> from <code>01-hello-node</code>, then:
        </p>
      </div>
      <Terminal>{`
cd ~/Developer/StudyGuide/github-portfolio/NodeJS/projects
mkdir 02-modules-lab && cd 02-modules-lab
npm init -y
npm pkg set type=module
npm pkg delete main description keywords author license scripts.test
npm pkg set private=true --json
npm pkg set engines.node=">=24" scripts.typecheck=tsc
npm install --save-dev typescript @types/node@24
mkdir -p src/lib`}</Terminal>
      <div className="prose">
        <p>
          <code>npm pkg</code> edits <code>package.json</code> from the command line; <code>--json</code> stores{' '}
          <code>true</code> as a boolean rather than the text <code>"true"</code>. Editing the file by hand is equally
          fine. The full file appears in step 6.
        </p>
      </div>

      <Step n={2}>Export and import</Step>
      <div className="prose">
        <p>
          Start with three small library modules. <code>math.ts</code> uses <strong>named exports</strong>: any number
          of them, each imported by its exact name. Its <code>round2</code> helper is not exported, so nothing outside
          can call it.
        </p>
      </div>
      <CodeFile path="02-modules-lab/src/lib/math.ts" />
      <div className="prose">
        <p>
          <code>format.ts</code> uses a <strong>default export</strong>: one per module, and the importer chooses the
          name. Default exports are convenient but make renaming and searching harder, so many teams prefer named
          exports everywhere.
        </p>
      </div>
      <CodeFile path="02-modules-lab/src/lib/format.ts" />
      <div className="prose">
        <p><code>counter.ts</code> prints a line when it is evaluated and exports a <code>let</code> that changes.</p>
      </div>
      <CodeFile path="02-modules-lab/src/lib/counter.ts" />
      <div className="prose">
        <p>
          A <strong>barrel</strong> file re-exports a folder's modules, so callers can import from one place.{' '}
          <code>export *</code> forwards every named export; <code>export {'{ default as … }'}</code> gives a default
          export a name.
        </p>
      </div>
      <CodeFile path="02-modules-lab/src/lib/index.ts" />
      <div className="prose">
        <p>Now use every import form in one script.</p>
      </div>
      <CodeFile path="02-modules-lab/src/01-esm.ts" />
      <Terminal>{`node src/01-esm.ts`}</Terminal>
      <Output>{`
  (counter.ts is being evaluated)
add(2, 3) = 5
times(4, 5) = 20
math.PI = 3.14159 | exports: PI, add, circleArea, multiply
circleArea(2) = 12.57
formatPrice(1234.5) = €1,234.50
count before: 0
count after two increments: 2`}</Output>
      <div className="prose">
        <p>Three things in that output are worth stopping on:</p>
        <ul>
          <li>
            <strong>The evaluation line comes first</strong>, before any line of <code>01-esm.ts</code>. ES modules load
            the whole graph and run dependencies before the importing file's body.
          </li>
          <li>
            <strong>It appears once</strong>, although <code>counter.ts</code> is imported directly and again through
            the barrel. Modules are cached by their resolved file URL.
          </li>
          <li>
            <strong><code>count</code> went from 0 to 2</strong> in the importing file. An ESM import is a{' '}
            <em>live binding</em>, a read-only view of the exporter's variable, not a copy.
          </li>
        </ul>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Form</th><th>Example</th><th>Gives you</th></tr>
        </thead>
        <tbody>
          <tr><td>Named</td><td><code>import {'{ add }'} from './math.ts'</code></td><td>One export, by its exact name</td></tr>
          <tr><td>Renamed</td><td><code>import {'{ multiply as times }'} from …</code></td><td>The same export under a local name</td></tr>
          <tr><td>Default</td><td><code>import formatPrice from './format.ts'</code></td><td>The default export, under any name</td></tr>
          <tr><td>Namespace</td><td><code>import * as math from './math.ts'</code></td><td>An object holding every named export</td></tr>
          <tr><td>Type only</td><td><code>import type {'{ Task }'} from './types.ts'</code></td><td>Types; removed completely before the code runs</td></tr>
          <tr><td>Side effect</td><td><code>import './setup.ts'</code></td><td>Nothing; only runs the module</td></tr>
          <tr><td>Re-export</td><td><code>export * from './math.ts'</code></td><td>Forwards exports without using them</td></tr>
        </tbody>
      </TableWrap>
      <Box kind="try" label="Try it: imports are read-only">
        <p>Uncomment the last line of <code>01-esm.ts</code> (<code>count = 10;</code>), then run the script and the type check.</p>
        <Output panes={[
          { tag: 'node src/01-esm.ts', text: 'count = 10;\n      ^\n\nTypeError: Assignment to constant variable.' },
          { tag: 'npm run typecheck', text: "src/01-esm.ts(19,1): error TS2632: Cannot assign\n  to 'count' because it is an import." },
        ]} />
        <p>Only the module that owns a variable may change it. Here that means calling <code>increment()</code>. Comment the line out again.</p>
      </Box>

      <Step n={3}>JSON, import.meta, top-level await and import()</Step>
      <CodeFile path="02-modules-lab/src/config.json" />
      <CodeFile path="02-modules-lab/src/02-meta.ts" />
      <Terminal>{`
node src/02-meta.ts
node src/02-meta.ts --price`}</Terminal>
      <Output>{`
config.appName: Modules Lab | maxItems: 3
import.meta.url:      file://~/…/projects/02-modules-lab/src/02-meta.ts
import.meta.filename: ~/…/projects/02-modules-lab/src/02-meta.ts
import.meta.dirname:  ~/…/projects/02-modules-lab/src
import.meta.resolve:  file://~/…/projects/02-modules-lab/src/lib/math.ts
config.json on disk is 48 bytes
run with --price to load format.ts on demand

… (same lines) …
loaded format.ts on demand: US$99.00`}</Output>
      <TableWrap>
        <thead>
          <tr><th>Feature</th><th>What it is for</th></tr>
        </thead>
        <tbody>
          <tr><td><code>with {'{ type: \'json\' }'}</code></td><td>An <em>import attribute</em>. It tells Node to parse the file as JSON and never run it as code, so a file that turns out to be JavaScript cannot execute. TypeScript infers the type from the JSON.</td></tr>
          <tr><td><code>import.meta.url</code></td><td>This module's address as a <code>file://</code> URL. Use it with <code>new URL('./x.txt', import.meta.url)</code>.</td></tr>
          <tr><td><code>import.meta.filename</code>, <code>.dirname</code></td><td>The same as a plain path and folder. Use them with <code>node:path</code> to find files next to your code, whatever folder you run from.</td></tr>
          <tr><td><code>import.meta.resolve()</code></td><td>Where an import specifier would resolve to, without loading it.</td></tr>
          <tr><td>Top-level <code>await</code></td><td>Await at the top of a module, outside any function. Modules that import this one wait until it finishes.</td></tr>
          <tr><td><code>await import()</code></td><td>Loads a module at run time and returns its namespace object. Use it for optional features, plugins, or heavy code you only sometimes need.</td></tr>
        </tbody>
      </TableWrap>
      <Box kind="warn" label="Forgot the attribute?">
        <Output panes={[
          { tag: 'node', text: 'TypeError [ERR_IMPORT_ATTRIBUTE_MISSING]: Module\n"file://…/src/config.json" needs an import\nattribute of "type: json"' },
          { tag: 'tsc', text: "error TS1543: Importing a JSON file into an\nECMAScript module requires a 'type: \"json\"'\nimport attribute when 'module' is set to 'NodeNext'." },
        ]} />
      </Box>

      <Step n={4}>CommonJS, and crossing between the systems</Step>
      <div className="prose">
        <p>
          Here is a CommonJS module, as you would find it in an older package. It is plain JavaScript in a{' '}
          <code>.cjs</code> file, which is always CommonJS whatever <code>package.json</code> says.
        </p>
      </div>
      <CodeFile path="02-modules-lab/src/legacy.cjs" />
      <div className="prose">
        <p>
          TypeScript cannot see types in a JavaScript file unless you describe them. A <strong>declaration file</strong>{' '}
          next to it does that. <code>legacy.d.cts</code> pairs with <code>legacy.cjs</code> the way{' '}
          <code>legacy.d.ts</code> would pair with <code>legacy.js</code>. It contains only types, never code.
        </p>
      </div>
      <CodeFile path="02-modules-lab/src/legacy.d.cts" />
      <CodeFile path="02-modules-lab/src/03-commonjs.ts" />
      <Terminal>{`node src/03-commonjs.ts`}</Terminal>
      <Output>{`
HELLO FROM COMMONJS!
AGAIN!
legacy.fileName: legacy.cjs
legacy.calls (a copy): 0
legacy.getCalls() (reads the variable): 2
require() returns the same cached object: true`}</Output>
      <div className="prose">
        <ul>
          <li>
            <strong>Importing CommonJS from ESM</strong>: the default import is <code>module.exports</code>. Named
            imports such as <code>{'{ shout }'}</code> also work when Node can spot the export names by scanning the
            file, which it can for the common <code>module.exports = {'{ … }'}</code> and{' '}
            <code>exports.name = …</code> shapes. If a named import fails, fall back to the default import.
          </li>
          <li>
            <strong>Copies, not bindings</strong>: <code>calls: calls</code> copied the number 0 into the exports
            object. The variable kept changing; the copy did not. To share changing state from CommonJS, export a
            function such as <code>getCalls()</code>.
          </li>
          <li>
            <strong><code>createRequire()</code></strong> builds a <code>require</code> function for an ES module. Both
            systems share one cache, so it returned the very same object. You rarely need it; the classic use is loading
            something only <code>require</code> can find.
          </li>
        </ul>
        <p>The other direction: CommonJS calling an ES module.</p>
      </div>
      <CodeFile path="02-modules-lab/src/lib/tla.ts" />
      <CodeFile path="02-modules-lab/src/04-require-esm.cjs" />
      <Terminal>{`node src/04-require-esm.cjs`}</Terminal>
      <Output>{`
require(esm) works: 3
require() of a module with top-level await fails: ERR_REQUIRE_ASYNC_MODULE`}</Output>
      <div className="prose">
        <p>
          For years CommonJS could not load ES modules at all, which caused the "ESM-only package" pain you will read
          about online (<code>ERR_REQUIRE_ESM</code>). Node 22.12 and Node 24 allow <code>require()</code> of an ES module
          as long as its graph has no top-level <code>await</code>, because <code>require()</code> must return
          immediately and cannot wait.
        </p>
      </div>
      <Box kind="try" label="Try it: CommonJS names do not exist in ES modules">
        <p>In any <code>.ts</code> file of this project, try <code>console.log(__dirname)</code>, then <code>require('node:fs')</code>.</p>
        <Output>{`
ReferenceError: __dirname is not defined in ES module scope
ReferenceError: require is not defined in ES module scope, you can use import instead`}</Output>
        <p>
          <code>tsc</code> does not catch these, because <code>@types/node</code> declares both names globally for
          CommonJS code. Use <code>import.meta.dirname</code> and <code>import</code>.
        </p>
      </Box>

      <Step n={5}>Package paths: "imports" and "exports"</Step>
      <div className="prose">
        <p>
          Deep relative imports such as <code>'../../../lib/math.ts'</code> break whenever a file moves.{' '}
          <strong>Subpath imports</strong> fix that with a map in <code>package.json</code>. Their names must start
          with <code>#</code>, and they work only inside this package. Add two fields:
        </p>
      </div>
      <Code title="02-modules-lab/package.json (add after engines)" lang="json">{`
"imports": {
  "#lib/*": "./src/lib/*"
},
"exports": {
  ".": "./src/lib/index.ts"
},`}</Code>
      <CodeFile path="02-modules-lab/src/05-package-paths.ts" />
      <Terminal>{`node src/05-package-paths.ts`}</Terminal>
      <Output>{`
  (counter.ts is being evaluated)
#lib/math.ts       -> add(10, 5) = 15
'02-modules-lab'   -> circleArea(1) = 3.14
#lib/math.ts lives at file://~/…/projects/02-modules-lab/src/lib/math.ts`}</Output>
      <div className="prose">
        <p>
          <code>"exports"</code> is the public face of a package: the only paths other code may import from it. A
          package can always import itself by its own name, which is how <code>'02-modules-lab'</code> worked here.
          Anything not listed is private, even if the file exists.
        </p>
      </div>
      <Box kind="try" label="Try it: reach past the exports">
        <p>Import <code>'02-modules-lab/src/lib/counter.ts'</code> from a new file and run it.</p>
        <Output panes={[
          { tag: 'node', text: "Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath\n'./src/lib/counter.ts' is not defined by \"exports\"\nin …/package.json" },
          { tag: 'tsc', text: "error TS2307: Cannot find module\n'02-modules-lab/src/lib/counter.ts' or its\ncorresponding type declarations." },
        ]} />
        <p>This is how library authors keep internal files internal and change them freely.</p>
      </Box>
      <div className="prose">
        <p>
          Published libraries use <strong>conditional exports</strong> to point each kind of consumer at the right file.
          Conditions are checked in order and the first match wins, so <code>"types"</code> goes first and{' '}
          <code>"default"</code> last.
        </p>
      </div>
      <Code title="Example: a published library's package.json" lang="json">{`
{
  "name": "tiny-lib",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "default": "./dist/index.js"
    },
    "./utils": "./dist/utils.js",
    "./package.json": "./package.json"
  }
}`}</Code>
      <Box kind="warn" label="TypeScript in node_modules">
        <p>
          Node refuses to strip types from files inside <code>node_modules</code>. Packages you publish must ship
          JavaScript plus <code>.d.ts</code> files, which means compiling them. Applications, like every project in this
          course, can run their own <code>.ts</code> files directly.
        </p>
      </Box>

      <Step n={6}>Add a real dependency</Step>
      <div className="prose">
        <p>
          <code>semver</code> is the library npm itself uses to compare versions, so it is the perfect tool for learning
          version ranges. It is written in CommonJS, which lets you see interop with a real package. Its types live in a
          separate package from <strong>DefinitelyTyped</strong>, the community project behind every{' '}
          <code>@types/*</code> package.
        </p>
      </div>
      <Terminal>{`
npm install semver
npm install --save-dev @types/semver`}</Terminal>
      <Output>{`
added 1 package, and audited 6 packages in 220ms

found 0 vulnerabilities

added 1 package, and audited 7 packages in 225ms

found 0 vulnerabilities`}</Output>
      <CodeFile path="02-modules-lab/package.json" change="updated" />
      <TableWrap>
        <thead>
          <tr><th>Section</th><th>Holds</th><th>Installed by <code>npm install</code> in a project that depends on yours?</th></tr>
        </thead>
        <tbody>
          <tr><td><code>dependencies</code></td><td>Packages your code imports at run time, like <code>semver</code>, <code>express</code></td><td>Yes</td></tr>
          <tr><td><code>devDependencies</code></td><td>Tools for building, testing and type checking: <code>typescript</code>, <code>@types/*</code>, linters</td><td>No</td></tr>
          <tr><td><code>peerDependencies</code></td><td>Packages a plugin expects the host project to provide, such as a React component library needing <code>react</code></td><td>npm 7+ installs them automatically; a conflicting version stops the install with <code>ERESOLVE</code></td></tr>
          <tr><td><code>optionalDependencies</code></td><td>Nice to have; installation continues if they fail. TypeScript 7 uses these for its per-platform binaries</td><td>Yes, if possible</td></tr>
        </tbody>
      </TableWrap>

      <h3>Semantic versioning</h3>
      <div className="prose">
        <p>
          Versions are <code>MAJOR.MINOR.PATCH</code>. A <strong>patch</strong> fixes bugs, a <strong>minor</strong>{' '}
          adds features without breaking anything, and a <strong>major</strong> may break existing code. The prefix in{' '}
          <code>package.json</code> is a <strong>range</strong>: which future versions you accept.
        </p>
      </div>
      <CodeFile path="02-modules-lab/src/06-semver.ts" />
      <Terminal>{`node src/06-semver.ts`}</Terminal>
      <Output>{`
1.2.3           accepts 1.2.3
~1.2.3          accepts 1.2.3, 1.2.9
^1.2.3          accepts 1.2.3, 1.2.9, 1.3.0, 1.9.0
>=1.3.0 <2.0.0  accepts 1.3.0, 1.9.0
*               accepts 1.2.3, 1.2.9, 1.3.0, 1.9.0, 2.0.0
^0.2.3          accepts 0.2.3, 0.2.9

newest 1.x: 1.9.0
2.0.0 > 1.9.0: true
1.9.0 + minor: 1.10.0`}</Output>
      <TableWrap>
        <thead>
          <tr><th>Range</th><th>Means</th><th>Use it when</th></tr>
        </thead>
        <tbody>
          <tr><td><code>1.2.3</code></td><td>Exactly this version</td><td>You must control every upgrade by hand</td></tr>
          <tr><td><code>~1.2.3</code></td><td>Patches only: <code>&gt;=1.2.3 &lt;1.3.0</code></td><td>You want bug fixes but no new features</td></tr>
          <tr><td><code>^1.2.3</code></td><td>Anything up to the next major: <code>&gt;=1.2.3 &lt;2.0.0</code></td><td>The default <code>npm install</code> writes; trusts the author to follow semver</td></tr>
          <tr><td><code>^0.2.3</code></td><td>Below 1.0.0, <code>^</code> only allows patches: <code>&gt;=0.2.3 &lt;0.3.0</code></td><td>Automatic: 0.x versions may break on any minor</td></tr>
          <tr><td><code>*</code> or <code>latest</code></td><td>Anything</td><td>Never in a real project</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          <code>1.9.0 + minor</code> is <code>1.10.0</code>, not <code>2.0.0</code>: each part is a separate number.
          That is why version strings must never be compared as text (<code>'1.10.0' &lt; '1.9.0'</code> is true for
          strings).
        </p>
      </div>

      <h3>The lockfile</h3>
      <div className="prose">
        <p>
          A range allows many versions, so two developers running <code>npm install</code> a month apart could get
          different code. <code>package-lock.json</code> prevents that: it records the exact version, download URL and
          a cryptographic hash of every package in the tree. Here is the entry for semver:
        </p>
      </div>
      <Code title="02-modules-lab/package-lock.json (excerpt)" lang="json">{`
"node_modules/semver": {
  "version": "7.8.5",
  "resolved": "https://registry.npmjs.org/semver/-/semver-7.8.5.tgz",
  "integrity": "sha512-Y7/KDsb8LjooZpwaqGyulO6DQlksgCncchHGk+sZIY4SBvUocMBEFH5Ur1fI4dV+Jvl0w6cjvucaIi40puRioA==",
  "license": "ISC",
  …`}</Code>
      <TableWrap>
        <thead>
          <tr><th></th><th><code>npm install</code></th><th><code>npm ci</code></th></tr>
        </thead>
        <tbody>
          <tr><td>Reads</td><td><code>package.json</code>, uses the lockfile as a guide</td><td>The lockfile only</td></tr>
          <tr><td>May change the lockfile</td><td>Yes</td><td>Never; fails if it disagrees with <code>package.json</code></td></tr>
          <tr><td><code>node_modules</code></td><td>Updates what is there</td><td>Deletes it and installs from scratch</td></tr>
          <tr><td>Use it</td><td>While developing, to add or change packages</td><td>In CI, Docker builds and fresh clones: reproducible installs</td></tr>
        </tbody>
      </TableWrap>
      <Terminal>{`
rm -rf node_modules
npm ci`}</Terminal>
      <Output>{`
added 6 packages, and audited 7 packages in 299ms

found 0 vulnerabilities`}</Output>

      <h3>npm commands you will use</h3>
      <TableWrap>
        <thead>
          <tr><th>Command</th><th>Does</th></tr>
        </thead>
        <tbody>
          <tr><td><code>npm install</code></td><td>Installs everything in <code>package.json</code></td></tr>
          <tr><td><code>npm install name</code> / <code>-D name</code></td><td>Adds a dependency / dev dependency</td></tr>
          <tr><td><code>npm install name@4</code></td><td>Adds a specific major (or exact) version</td></tr>
          <tr><td><code>npm uninstall name</code></td><td>Removes it from <code>node_modules</code> and <code>package.json</code></td></tr>
          <tr><td><code>npm ci</code></td><td>Clean, exact install from the lockfile</td></tr>
          <tr><td><code>npm ls</code> / <code>npm ls --all</code></td><td>Shows your direct dependencies / the whole tree</td></tr>
          <tr><td><code>npm outdated</code></td><td>Lists packages with newer versions</td></tr>
          <tr><td><code>npm update</code></td><td>Upgrades within your ranges and updates the lockfile</td></tr>
          <tr><td><code>npm view name</code></td><td>Shows a package's details from the registry without installing it</td></tr>
          <tr><td><code>npm audit</code></td><td>Checks installed versions against known vulnerabilities</td></tr>
          <tr><td><code>npm run name</code></td><td>Runs a script; <code>npm run</code> alone lists them</td></tr>
          <tr><td><code>npx cmd</code> / <code>npm exec cmd</code></td><td>Runs a package's command from <code>node_modules/.bin</code>, or downloads it temporarily</td></tr>
        </tbody>
      </TableWrap>
      <Terminal>{`
npm ls
npm outdated
npx semver --range "^1.2.3" 1.2.9 1.9.0 2.0.0`}</Terminal>
      <Output>{`
02-modules-lab@1.0.0 ~/…/projects/02-modules-lab
├── @types/node@24.19.2
├── @types/semver@7.8.0
├── semver@7.8.5
└── typescript@7.0.2

Package      Current   Wanted  Latest  Location                  Depended by
@types/node  24.19.2  24.19.2  26.6.5  node_modules/@types/node  02-modules-lab

1.2.9
1.9.0`}</Output>
      <div className="prose">
        <p>
          Read <code>npm outdated</code> column by column. <strong>Wanted</strong> is the newest version your range
          allows; <strong>Latest</strong> is the newest published. <code>@types/node</code> 26 is out, but you run Node
          24, so staying on 24.x is correct. Not every "outdated" line is a problem. (<code>npm outdated</code> exits
          with code 1 when it lists anything, which matters in scripts.)
        </p>
      </div>

      <Box kind="key" label="Supply-chain safety">
        <p>Every package you install runs with your permissions, and so do its dependencies. Habits that keep you safe:</p>
        <ol>
          <li><strong>Check before you install.</strong> <code>npm view name</code> shows the repository, maintainers and versions. Prefer maintained packages with a real repository and many users.</li>
          <li><strong>Watch for typosquats</strong>, names one letter away from popular packages, such as <code>expresss</code>.</li>
          <li><strong>Commit the lockfile and use <code>npm ci</code></strong> in CI, so nobody silently installs a new version.</li>
          <li><strong>Run <code>npm audit</code></strong> regularly, and read the advice rather than running <code>npm audit fix --force</code> blindly; it can install breaking majors.</li>
          <li><strong>Be wary of install scripts.</strong> Packages can run code during installation. <code>npm install --ignore-scripts</code> skips them.</li>
          <li><strong>Prefer fewer dependencies.</strong> If Node has it built in (<code>fetch</code>, <code>crypto.randomUUID()</code>, <code>util.parseArgs</code>, <code>node:test</code>), use that.</li>
        </ol>
      </Box>

      <Exercises
        items={[
          {
            task: <>Add <code>src/lib/strings.ts</code> with named exports <code>capitalize</code> and <code>slugify</code>, re-export it from the barrel, and use both through <code>'#lib/index.ts'</code> in a new <code>src/07-practice.ts</code>.</>,
            hint: <>One new line in <code>index.ts</code>: <code>export * from './strings.ts';</code>. For <code>slugify</code>, lower-case, then replace runs of anything that is not <code>a-z0-9</code> with a hyphen.</>,
            solution: (
              <>
                <CodeFile path="02-modules-lab.practice/src/lib/strings.ts" />
                <CodeFile path="02-modules-lab.practice/src/lib/index.ts" />
                <CodeFile path="02-modules-lab.practice/src/07-practice.ts" />
                <Output>{`
  (counter.ts is being evaluated)
Node.js | hello-node-js-world
02-modules-lab/math -> multiply(6, 7) = 42
Modules Lab shows at most 3 items`}</Output>
              </>
            ),
          },
          {
            task: <>Make <code>import {'{ multiply }'} from '02-modules-lab/math'</code> work, while <code>'02-modules-lab/src/lib/counter.ts'</code> still fails.</>,
            hint: <>Add a second key to <code>"exports"</code>. Keys are the public subpaths; values are the real files.</>,
            solution: <CodeFile path="02-modules-lab.practice/package.json" />,
          },
          {
            task: <>Write <code>src/old-config.cjs</code>, a CommonJS module that loads <code>config.json</code> and exports a <code>describe()</code> function. Import it, with types, from <code>07-practice.ts</code>.</>,
            hint: <>CommonJS can <code>require('./config.json')</code> directly, with no attribute. TypeScript needs an <code>old-config.d.cts</code> beside it.</>,
            solution: (
              <>
                <CodeFile path="02-modules-lab.practice/src/old-config.cjs" />
                <CodeFile path="02-modules-lab.practice/src/old-config.d.cts" />
              </>
            ),
          },
        ]}
      />

      <Checkpoint question={<>Module <code>a</code> exports <code>let total = 0</code> and a function that adds to it. Module <code>b</code> imports <code>total</code>, calls the function three times, then logs <code>total</code>. What does it log with ES modules, and what would a CommonJS version doing <code>const {'{ total }'} = require('./a')</code> log?</>}>
        <p>
          ES modules log the updated value, because the import is a live binding to <code>a</code>'s variable.
          CommonJS logs <code>0</code>: destructuring copied the number out of <code>module.exports</code> when{' '}
          <code>require()</code> ran, and later changes to the variable inside <code>a</code> do not reach the copy.
        </p>
      </Checkpoint>
      <Checkpoint question={<>Your <code>package.json</code> says <code>"left-pad": "^0.4.1"</code>. Versions 0.4.9, 0.5.0 and 1.0.0 exist. Which does a fresh <code>npm install</code> without a lockfile pick, and what changes if a lockfile pinned 0.4.1?</>}>
        <p>
          It picks <code>0.4.9</code>. Below 1.0.0 the caret allows only patch updates, so 0.5.0 and 1.0.0 are out.
          With a lockfile pinning 0.4.1, <code>npm ci</code> installs exactly 0.4.1, and so does <code>npm install</code>{' '}
          as long as 0.4.1 still satisfies the range. You move to 0.4.9 deliberately, with <code>npm update</code>.
        </p>
      </Checkpoint>

      <Recap>
        <ul>
          <li>Each file is a module with its own scope; it runs once and is cached, so modules are natural singletons.</li>
          <li>ES module imports are hoisted, read-only live bindings. CommonJS hands you values copied from <code>module.exports</code>.</li>
          <li>File extension and the <code>"type"</code> field decide the module system. <code>.cjs</code>/<code>.mjs</code> always win.</li>
          <li>Node 24 lets ESM import CommonJS and CommonJS <code>require()</code> ESM, except ESM with top-level await.</li>
          <li><code>"imports"</code> (<code>#lib/*</code>) shortens internal paths; <code>"exports"</code> defines a package's public API.</li>
          <li><code>^</code> accepts minors and patches (only patches below 1.0); the lockfile pins exact versions; use <code>npm ci</code> for reproducible installs.</li>
        </ul>
      </Recap>
    </>
  );
}
