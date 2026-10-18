import { Box, ChapterIntro, Checkpoint, Output, Step, TableWrap } from '../components/Content';
import { Code, Terminal } from '../components/Code';
import { StackTerminal } from '../components/Stacks';

export function Setup() {
  return (
    <>
      <ChapterIntro
        time="30–45 minutes"
        learn={[
          'Installing Node.js, Python and the .NET SDK, and checking the versions',
          'Installing the lab’s shared packages once for all chapters',
          'Running one chapter’s tests in each stack, and every chapter’s tests at once',
          'Calling an API from the terminal with curl, and from VS Code',
        ]}
        tools={[
          { name: 'Node.js 24 or later', what: 'Runs TypeScript files directly (type stripping), so there is no build step.' },
          { name: 'Python 3.12 or later', what: 'With a virtual environment for the lab’s packages.' },
          { name: '.NET 9 SDK', what: 'For the ASP.NET Core projects; Visual Studio Code with the C# Dev Kit, or Rider, or Visual Studio.' },
        ]}
      />

      <div className="prose">
        <p>
          You only need the stack you plan to learn. Install all three if you want to compare them side by side. Every
          command here runs from the lab folder, <code>Authentication/tutorial-app</code>.
        </p>
      </div>

      <Step n={1}>Install the toolchains</Step>
      <StackTerminal
        title="Install and check (macOS with Homebrew; use the official installers on Windows and Linux)"
        node={`brew install node\nnode --version     # v24 or later`}
        python={`brew install python\npython3 --version  # 3.12 or later`}
        dotnet={`brew install --cask dotnet-sdk\ndotnet --list-sdks # 9.0.x`}
      />

      <Step n={2}>Install the lab’s packages, once</Step>
      <div className="prose">
        <p>
          All the snippet projects of one stack share one install, so you download each package once. Node.js uses npm
          workspaces, Python uses one virtual environment, and .NET pins every package version in one file
          (<code>Directory.Packages.props</code>, called central package management).
        </p>
      </div>
      <StackTerminal
        title="From Authentication/tutorial-app"
        node={`cd snippets\nnpm install`}
        python={`cd snippets\npython3 -m venv .venv\n.venv/bin/pip install -r requirements.txt`}
        dotnet={`cd snippets/04-passwords/dotnet\ndotnet restore   # the first restore downloads the packages for every chapter`}
      />

      <Step n={3}>Run a chapter’s tests</Step>
      <StackTerminal
        title="The passwords chapter, in each stack"
        node={`cd snippets/04-passwords/node\nnpm test`}
        python={`cd snippets/04-passwords/python\n../../.venv/bin/python -m pytest -q`}
        dotnet={`cd snippets/04-passwords/dotnet\ndotnet test`}
      />
      <div className="prose">
        <p>To check every chapter in every stack at once (this is how the lab verifies itself):</p>
      </div>
      <Terminal>{`node scripts/verify.mjs                  # everything
node scripts/verify.mjs 08-jwt           # one topic, all stacks
node scripts/verify.mjs --stack python   # one stack, all topics`}</Terminal>
      <Output>{`
✓ 04-passwords/node                0.3s
✓ 04-passwords/python              0.7s
✓ 04-passwords/dotnet              4.2s
`}</Output>

      <Step n={4}>Call an API from the terminal</Step>
      <div className="prose">
        <p>
          Each chapter starts its server on port 3000 and shows a curl session. The flags you will see most:
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Flag</th><th>What it does</th></tr>
        </thead>
        <tbody>
          <tr><td><code>-s</code></td><td>Silent: no progress bar</td></tr>
          <tr><td><code>-i</code></td><td>Show the status line and response headers</td></tr>
          <tr><td><code>-X POST</code></td><td>The HTTP method</td></tr>
          <tr><td><code>-H "Name: value"</code></td><td>A request header, such as <code>Authorization: Bearer …</code></td></tr>
          <tr><td><code>-d '{"{"}…{"}"}'</code></td><td>A request body (with <code>-H "Content-Type: application/json"</code>)</td></tr>
          <tr><td><code>-c jar.txt</code> / <code>-b jar.txt</code></td><td>Save cookies to a file, and send them back: how you test session cookies</td></tr>
          <tr><td><code>-u user:pass</code></td><td>HTTP Basic authentication</td></tr>
          <tr><td><code>--cert</code> / <code>--key</code> / <code>--cacert</code></td><td>Client certificate, its key, and the CA to trust: for mutual TLS</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          If you prefer an editor, the REST Client extension for VS Code (or the HTTP client built into JetBrains IDEs)
          runs requests written in a <code>.http</code> file:
        </p>
      </div>
      <Code title="requests.http" lang="http">{`
POST http://localhost:3000/login
Content-Type: application/json

{"email": "ada@example.com", "password": "correct horse battery"}
`}</Code>

      <Box kind="tip" label="HTTPS on your machine">
        <p>
          Cookies marked <code>Secure</code> and some browser features, such as passkeys, need HTTPS (browsers treat
          <code> http://localhost</code> as secure for most of them). For real certificates on localhost, run{' '}
          <code>dotnet dev-certs https --trust</code> for .NET, or use <code>mkcert</code> for any stack. The mutual TLS
          chapter generates its own certificates.
        </p>
      </Box>

      <Box kind="warn" label="Port 3000 already in use?">
        <p>
          Start the server on another port: <code>PORT=3001 npm start</code>, <code>uvicorn app:app --port 3001</code>,
          or <code>dotnet run --project Api --urls http://localhost:3001</code>. To find what holds a port, run{' '}
          <code>lsof -i :3000</code> and stop that process by its PID.
        </p>
      </Box>

      <Checkpoint question="Why do the snippet projects share one install instead of each having its own node_modules, virtual environment or package versions?">
        <p>
          Fourteen topics times three stacks would mean dozens of separate installs of the same packages. One shared
          install per stack is faster, uses less disk, and guarantees every chapter runs against the same versions. Each
          project still lists what it uses (its own <code>package.json</code>, <code>requirements.txt</code> or package
          references), so you can copy a folder out and install it on its own.
        </p>
      </Checkpoint>
    </>
  );
}
