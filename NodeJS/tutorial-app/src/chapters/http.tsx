import { Code, CodeFile, Terminal } from '../components/Code';
import { Box, ChapterIntro, Checkpoint, Exercises, Output, Recap, Step, TableWrap } from '../components/Content';
import { Diagram } from '../diagrams/Diagram';
import { httpFlow } from '../diagrams/specs/io';

export function Http() {
  return (
    <>
      <ChapterIntro
        time="90–120 minutes"
        project="08-raw-http-api"
        learn={[
          'What an HTTP request and response look like on the wire',
          'How node:http hands you a request stream and a response stream',
          'Routing by method and path, with correct 404 and 405 responses',
          'Reading a JSON body safely: content type, size limit, invalid JSON',
          'Choosing status codes and headers, and handling every error in one place',
          'Calling an API with the built-in fetch, and shutting a server down cleanly',
        ]}
        tools={[
          { name: 'node:http', what: 'createServer, IncomingMessage (the request) and ServerResponse.' },
          { name: 'URL', what: 'Parses paths and query strings. A global, as in browsers.' },
          { name: 'fetch', what: 'The standard HTTP client, built into Node.' },
          { name: 'curl', what: 'Command-line HTTP client, preinstalled on macOS, Linux and Windows 10+ (type curl.exe in PowerShell).' },
        ]}
      />

      <div className="prose">
        <p>
          Express, Fastify and every other Node web framework are built on <code>node:http</code>. In this chapter you
          build a small JSON API with nothing else, so that in chapter 11 you know exactly which problems Express solves
          and which ones are still yours.
        </p>
      </div>

      <h2>HTTP is text with a shape</h2>
      <div className="prose">
        <p>
          A client opens a TCP connection and sends a <strong>request</strong>: a start line, some headers, a blank
          line, and an optional body. The server replies with a <strong>response</strong> of the same shape, starting
          with a status line. This is the exact request you will send to create a bookmark, and the server's reply.
        </p>
      </div>
      <Code title="Request" lang="http">{`
POST /bookmarks HTTP/1.1
Host: localhost:3000
Content-Type: application/json
Content-Length: 79

{"url":"https://nodejs.org/api/","title":"Node.js docs","tags":["node","docs"]}`}</Code>
      <Code title="Response" lang="http">{`
HTTP/1.1 201 Created
Content-Type: application/json; charset=utf-8
Content-Length: 162
Location: /bookmarks/ca19fd97-6755-4728-bb0e-1eebe7c61e5d
Date: Mon, 12 Oct 2026 07:05:06 GMT
Connection: keep-alive
Keep-Alive: timeout=5

{"id":"ca19fd97-…","url":"https://nodejs.org/api/","title":"Node.js docs","tags":["node","docs"],"createdAt":"…"}`}</Code>
      <TableWrap>
        <thead>
          <tr><th>Part</th><th>Request</th><th>Response</th></tr>
        </thead>
        <tbody>
          <tr><td>Start line</td><td>Method, path with query string, version</td><td>Version, status code, reason phrase</td></tr>
          <tr><td>Headers</td><td>Metadata: <code>Host</code>, <code>Content-Type</code>, <code>Authorization</code>…</td><td>Metadata: <code>Content-Type</code>, <code>Location</code>, <code>Cache-Control</code>…</td></tr>
          <tr><td>Blank line</td><td colSpan={2}>Marks the end of the headers</td></tr>
          <tr><td>Body</td><td>Optional; its size is <code>Content-Length</code> bytes, or sent in chunks</td><td>Optional; a 204 response must not have one</td></tr>
        </tbody>
      </TableWrap>

      <h2>Methods and status codes</h2>
      <TableWrap>
        <thead>
          <tr><th>Method</th><th>Meaning</th><th>Safe</th><th>Idempotent</th></tr>
        </thead>
        <tbody>
          <tr><td><code>GET</code></td><td>Read a resource</td><td>Yes</td><td>Yes</td></tr>
          <tr><td><code>POST</code></td><td>Create something, or run an action</td><td>No</td><td>No</td></tr>
          <tr><td><code>PUT</code></td><td>Replace a resource entirely</td><td>No</td><td>Yes</td></tr>
          <tr><td><code>PATCH</code></td><td>Change part of a resource</td><td>No</td><td>Not necessarily</td></tr>
          <tr><td><code>DELETE</code></td><td>Remove a resource</td><td>No</td><td>Yes</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          <strong>Safe</strong> means the request changes nothing on the server. <strong>Idempotent</strong> means
          sending it twice has the same effect as sending it once, so a client may retry it after a network error.
          Retrying a <code>POST</code> can create a duplicate, which is why payment APIs ask for an idempotency key.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Status</th><th>Use it when</th></tr>
        </thead>
        <tbody>
          <tr><td><code>200 OK</code></td><td>Success with a body</td></tr>
          <tr><td><code>201 Created</code></td><td>Something was created. Add a <code>Location</code> header with its URL</td></tr>
          <tr><td><code>204 No Content</code></td><td>Success with nothing to send back, for example after a delete</td></tr>
          <tr><td><code>400 Bad Request</code></td><td>The request is malformed: broken JSON, an unreadable URL, a bad query parameter</td></tr>
          <tr><td><code>401</code> / <code>403</code></td><td>Not logged in / logged in but not allowed (chapter 15)</td></tr>
          <tr><td><code>404 Not Found</code></td><td>No such route, or no such resource</td></tr>
          <tr><td><code>405 Method Not Allowed</code></td><td>The path exists but not with this method. Must include an <code>Allow</code> header</td></tr>
          <tr><td><code>409 Conflict</code></td><td>The request clashes with current state, such as a duplicate email</td></tr>
          <tr><td><code>413 Payload Too Large</code></td><td>The body is bigger than you accept</td></tr>
          <tr><td><code>415 Unsupported Media Type</code></td><td>The body is in a format you do not accept</td></tr>
          <tr><td><code>422 Unprocessable Entity</code></td><td>Well-formed JSON whose values are wrong, such as a missing title</td></tr>
          <tr><td><code>500 Internal Server Error</code></td><td>A bug. Never put internal details in the body</td></tr>
          <tr><td><code>503 Service Unavailable</code></td><td>Temporarily unable to serve, for example while shutting down</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>The names are the ones Node prints; the current HTTP standard (RFC 9110) calls 413 "Content Too Large" and 422 "Unprocessable Content". Some teams use 400 for validation errors too. This project separates "I could not read it" (400) from "I read it and the values are wrong" (422), and either choice is fine as long as you are consistent.</p>
      </div>

      <h2>How node:http works</h2>
      <div className="prose">
        <p>
          <code>http.createServer(listener)</code> returns a server, which is an <code>EventEmitter</code>. Your
          listener is attached to its <code>'request'</code> event and runs once per request with two objects. The
          request is a <strong>Readable stream</strong>: the headers have arrived, but the body is still flowing in.
          The response is a <strong>Writable stream</strong>: you set the status and headers, write the body, and must
          call <code>end()</code>.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Request (<code>IncomingMessage</code>)</th><th>Response (<code>ServerResponse</code>)</th></tr>
        </thead>
        <tbody>
          <tr><td><code>req.method</code>: <code>'GET'</code>, <code>'POST'</code>…</td><td><code>res.writeHead(status, headers)</code>: status line and headers at once</td></tr>
          <tr><td><code>req.url</code>: path and query only, such as <code>'/bookmarks?tag=node'</code></td><td><code>res.statusCode</code>, <code>res.setHeader(name, value)</code>: set them separately</td></tr>
          <tr><td><code>req.headers</code>: an object with <strong>lower-case</strong> names</td><td><code>res.write(chunk)</code>: send part of the body</td></tr>
          <tr><td><code>for await (const chunk of req)</code>: the body, as Buffers</td><td><code>res.end(lastChunk?)</code>: finish. Without it the client waits for ever</td></tr>
          <tr><td><code>req.socket.remoteAddress</code>: the client's IP</td><td><code>res.headersSent</code>: true once headers have gone; you can no longer change the status</td></tr>
        </tbody>
      </TableWrap>
      <Diagram spec={httpFlow} caption="The request path through the project you are about to build. Every error, from a wrong URL to a bug, ends up in sendError." />

      <Step n={1}>Set up the project</Step>
      <div className="prose">
        <p>Create <code>projects/08-raw-http-api</code> from the chapter 03 template with this <code>package.json</code>, then <code>npm install</code>. There are no runtime dependencies at all.</p>
      </div>
      <CodeFile path="08-raw-http-api/package.json" />

      <Step n={2}>An error that knows its status, and two helpers</Step>
      <div className="prose">
        <p>
          Handlers will <code>throw</code> when something is wrong, and one function will turn the error into a
          response. For that to work, the error must carry its status code. Note that the class assigns its fields in
          the constructor body: constructor parameter properties (<code>constructor(readonly status: number)</code>) generate
          code, so <code>erasableSyntaxOnly</code> forbids them.
        </p>
      </div>
      <CodeFile path="08-raw-http-api/src/http-error.ts" />
      <CodeFile path="08-raw-http-api/src/http-utils.ts" />
      <TableWrap>
        <thead>
          <tr><th>Detail</th><th>Why</th></tr>
        </thead>
        <tbody>
          <tr><td><code>Buffer.byteLength(json)</code></td><td><code>Content-Length</code> counts bytes. <code>json.length</code> counts characters and is wrong as soon as a title contains é or an emoji.</td></tr>
          <tr><td><code>for await (const chunk of req)</code></td><td>The body arrives in chunks over time. The request is a Readable stream, so you iterate it like the streams in chapter 09.</td></tr>
          <tr><td>The size limit</td><td>Without one, a client can send gigabytes and your server will try to hold them all in memory. Check the header to fail fast, and count the bytes because the header is optional.</td></tr>
          <tr><td>The <code>Content-Type</code> check</td><td>Refuses form posts and plain text with 415 instead of a confusing JSON error.</td></tr>
          <tr><td><code>JSON.parse</code> in <code>try</code></td><td>Invalid JSON is the client's mistake: answer 400, not 500.</td></tr>
        </tbody>
      </TableWrap>

      <Step n={3}>The store</Step>
      <div className="prose">
        <p>A small class keeps bookmarks in a <code>Map</code>. Wrapping it in a class means the server receives its storage instead of reaching for a global, which chapter 13 relies on to test with a fresh store each time.</p>
      </div>
      <CodeFile path="08-raw-http-api/src/store.ts" />

      <Step n={4}>Validate the body by hand</Step>
      <div className="prose">
        <p>
          <code>JSON.parse</code> returns <code>unknown</code> data from a stranger. TypeScript types vanish at run time,
          so annotating the result as <code>NewBookmark</code> would prove nothing. Real code has to check every field.
        </p>
      </div>
      <CodeFile path="08-raw-http-api/src/validate.ts" />
      <div className="prose">
        <p>
          It works, and it reports every problem at once instead of only the first. It is also thirty lines for three
          fields, and the type and the checks can drift apart. Chapter 11 replaces it with a Zod schema that is both the
          check and the type.
        </p>
      </div>

      <Step n={5}>Routing and one place for errors</Step>
      <CodeFile path="08-raw-http-api/src/app.ts" />
      <TableWrap>
        <thead>
          <tr><th>Piece</th><th>What it does</th></tr>
        </thead>
        <tbody>
          <tr><td><code>routes</code></td><td>A table of method, path pattern and handler. Adding an endpoint means adding a row.</td></tr>
          <tr><td><code>matchPath</code></td><td>Compares path segments and collects <code>:params</code>. <code>decodeURIComponent</code> turns <code>%20</code> back into a space, and throws on a malformed escape, which becomes a 400.</td></tr>
          <tr><td><code>new URL(req.url, 'http://localhost')</code></td><td><code>req.url</code> has no host, so <code>URL</code> needs a base. The base is never used for anything else.</td></tr>
          <tr><td>404 versus 405</td><td>If no route matches the path, 404. If routes match the path but not the method, 405 with an <code>Allow</code> header listing the methods that would work.</td></tr>
          <tr><td><code>sendError</code></td><td>An <code>HttpError</code> becomes its status and message. Anything else is a bug: log it in full, answer a bare 500, and destroy the connection if the headers already went out.</td></tr>
          <tr><td><code>.catch(...)</code> in <code>createApp</code></td><td>The request listener is not async-aware: nothing awaits <code>dispatch</code>. Without this <code>catch</code>, a rejected promise would be unhandled and crash the whole server.</td></tr>
          <tr><td><code>res.on('finish')</code></td><td>Logs every request once its response has been handed to the operating system.</td></tr>
        </tbody>
      </TableWrap>

      <Step n={6}>The entry point</Step>
      <CodeFile path="08-raw-http-api/src/main.ts" />
      <div className="prose">
        <p>
          Keeping <code>createApp</code> separate from <code>listen</code> means tests can start the same app on a
          random port. The <code>'error'</code> listener is chapter 08's rule in action: a server can emit{' '}
          <code>'error'</code>, for example when the port is taken, and without a listener that would crash with a
          stack trace instead of a clear message.
        </p>
      </div>

      <Step n={7}>Run it and talk to it with curl</Step>
      <Terminal title="Terminal 1">{`npm run dev`}</Terminal>
      <Terminal title="Terminal 2">{`
curl -i localhost:3000/health
curl -i -X POST localhost:3000/bookmarks \\
  -H 'Content-Type: application/json' \\
  -d '{"url":"https://nodejs.org/api/","title":"Node.js docs","tags":["node","docs"]}'
curl localhost:3000/bookmarks`}</Terminal>
      <Output>{`
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Content-Length: 15
Date: Mon, 12 Oct 2026 07:05:06 GMT
Connection: keep-alive
Keep-Alive: timeout=5

{"status":"ok"}

HTTP/1.1 201 Created
Content-Type: application/json; charset=utf-8
Content-Length: 162
Location: /bookmarks/ca19fd97-6755-4728-bb0e-1eebe7c61e5d
Date: Mon, 12 Oct 2026 07:05:06 GMT
Connection: keep-alive
Keep-Alive: timeout=5

{"id":"ca19fd97-6755-4728-bb0e-1eebe7c61e5d","url":"https://nodejs.org/api/","title":"Node.js docs","tags":["node","docs"],"createdAt":"2026-10-12T07:05:06.750Z"}

[{"id":"ca19fd97-6755-4728-bb0e-1eebe7c61e5d","url":"https://nodejs.org/api/","title":"Node.js docs","tags":["node","docs"],"createdAt":"2026-10-12T07:05:06.750Z"}]`}</Output>
      <div className="prose">
        <p>Your ids and dates will differ. <code>-i</code> shows the response headers. Node added <code>Date</code>, <code>Connection</code> and <code>Keep-Alive</code> itself. Now send it everything that should fail:</p>
      </div>
      <Terminal title="Terminal 2">{`
curl -X POST localhost:3000/bookmarks -H 'Content-Type: application/json' -d '{"url": '
curl -X POST localhost:3000/bookmarks -H 'Content-Type: application/json' -d '{"url":"ftp://x","tags":"node"}'
curl -X POST localhost:3000/bookmarks -d 'url=x'
curl -i -X PUT localhost:3000/bookmarks
curl localhost:3000/nope
curl localhost:3000/bookmarks/does-not-exist
curl localhost:3000/bookmarks/%E0%A4%A`}</Terminal>
      <Output>{`
{"error":"Body is not valid JSON"}
{"error":"Invalid bookmark","details":["url must be an http or https URL","title must be a non-empty string","tags must be an array of strings"]}
{"error":"Content-Type must be application/json"}
HTTP/1.1 405 Method Not Allowed
Content-Type: application/json; charset=utf-8
Content-Length: 44
Allow: GET, POST
…

{"error":"PUT is not allowed on /bookmarks"}
{"error":"No route for /nope"}
{"error":"No bookmark with id does-not-exist"}
{"error":"Malformed URL"}`}</Output>
      <Output caption="Terminal 1 (the server log)">{`
Bookmarks API listening on http://localhost:3000
GET /health -> 200 in 2.3 ms
POST /bookmarks -> 201 in 1.2 ms
GET /bookmarks -> 200 in 0.2 ms
POST /bookmarks -> 400 in 0.5 ms
POST /bookmarks -> 422 in 1.2 ms
POST /bookmarks -> 415 in 0.2 ms
PUT /bookmarks -> 405 in 0.2 ms
GET /nope -> 404 in 0.1 ms
GET /bookmarks/does-not-exist -> 404 in 0.2 ms
GET /bookmarks/%E0%A4%A -> 400 in 0.2 ms`}</Output>
      <div className="prose">
        <p>
          The size limit works whether or not the client says how big the body is. A 20 KB title is rejected with{' '}
          <code>413</code> both when curl sends a <code>Content-Length</code> and when it streams the body with{' '}
          <code>Transfer-Encoding: chunked</code>, and the server keeps serving afterwards.
        </p>
      </div>

      <Step n={8}>A client with fetch</Step>
      <div className="prose">
        <p>
          <code>fetch</code> is the same API as in the browser. One behaviour surprises everyone once: it only rejects
          when the request could not be made at all. A 404 or a 500 is a successful <em>fetch</em> that returns a
          response with a bad status, so you must check <code>response.status</code> or <code>response.ok</code>.
        </p>
      </div>
      <CodeFile path="08-raw-http-api/src/client.ts" />
      <Terminal title="Terminal 2 (restart the server first for a clean store)">{`npm run client`}</Terminal>
      <Output>{`
POST /bookmarks -> 201 Created
POST /bookmarks -> 201 Created
GET /bookmarks?tag=node -> 200 OK
  tagged "node": 1
GET /bookmarks/5aad00b3-… -> 200 OK
DELETE /bookmarks/5aad00b3-… -> 204 No Content
GET /bookmarks/5aad00b3-… -> 404 Not Found
POST /bookmarks -> 422 Unprocessable Entity
  {"error":"Invalid bookmark","details":["url must be an http or https URL","title must be a non-empty string"]}
network failure: fetch failed (ECONNREFUSED)`}</Output>
      <div className="prose">
        <p>
          When nothing is listening, <code>fetch</code> rejects with the unhelpful message <code>fetch failed</code>.
          The real reason is in <code>error.cause</code>, here <code>ECONNREFUSED</code>: the connection was refused.
        </p>
      </div>

      <Box kind="try" label="Try it: break the server three ways">
        <ol>
          <li>
            <p>
              Start a second copy with <code>npm start</code> in another terminal. It prints <code>Port 3000 is already
              in use</code> and exits with code 1. Comment out the <code>server.on('error')</code> block and try again to
              see the raw <code>EADDRINUSE</code> crash.
            </p>
          </li>
          <li>
            <p>Add a route whose handler has a bug, such as reading a property of <code>undefined</code>, and request it:</p>
            <Output caption="curl -i, then the server log">{`
HTTP/1.1 500 Internal Server Error
…
{"error":"Internal server error"}

TypeError: Cannot read properties of undefined (reading 'name')
    at Object.handler (file://~/…/projects/08-raw-http-api/src/app.ts:17:24)
    at dispatch (file://~/…/projects/08-raw-http-api/src/app.ts:92:21)
    …
GET /boom -> 500 in 2.3 ms`}</Output>
            <p>The client learns nothing internal, the log has the full stack, and the server keeps running.</p>
          </li>
          <li>
            <p>
              Now replace <code>.catch((error: unknown) =&gt; sendError(res, error))</code> with nothing, and request the
              broken route again. curl reports <code>curl: (52) Empty reply from server</code> and the server process
              is gone: one bad request took the service down for everyone. Put the <code>catch</code> back.
            </p>
          </li>
        </ol>
      </Box>

      <h2>Keep-alive and shutting down</h2>
      <div className="prose">
        <p>
          Opening a TCP connection costs a network round trip, plus one or two more for TLS, so HTTP/1.1 keeps connections open
          between requests: that is what <code>Connection: keep-alive</code> and <code>Keep-Alive: timeout=5</code> in
          the responses mean. Node closes an idle connection after <code>server.keepAliveTimeout</code>, 5 seconds by
          default.
        </p>
        <p>
          <code>server.close()</code> stops accepting new connections, closes idle keep-alive connections straight
          away, lets requests already in progress finish, and then calls its callback. That is why pressing{' '}
          <kbd>Ctrl</kbd>+<kbd>C</kbd> prints <code>shutting down</code> and then <code>server closed</code> almost
          immediately. A client in the middle of a long request would delay it; <code>server.closeAllConnections()</code>{' '}
          cuts everyone off. Chapter 19 builds a full graceful shutdown with a deadline.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Server setting</th><th>Default on Node 24</th><th>Protects against</th></tr>
        </thead>
        <tbody>
          <tr><td><code>keepAliveTimeout</code></td><td>5,000 ms</td><td>Idle connections piling up</td></tr>
          <tr><td><code>headersTimeout</code></td><td>60,000 ms</td><td>Clients that send headers very slowly</td></tr>
          <tr><td><code>requestTimeout</code></td><td>300,000 ms</td><td>Clients that take for ever to send the whole request</td></tr>
        </tbody>
      </TableWrap>

      <h2>What a framework adds</h2>
      <div className="prose">
        <p>You have now written by hand most of what a web framework does. Here is the same list in Express, which chapter 11 introduces.</p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Concern</th><th>In this chapter</th><th>In Express 5</th></tr>
        </thead>
        <tbody>
          <tr><td>Routing and <code>:params</code></td><td><code>routes</code> table and <code>matchPath</code></td><td><code>router.get('/bookmarks/:id', …)</code>, <code>req.params</code></td></tr>
          <tr><td>Query string</td><td><code>url.searchParams</code></td><td><code>req.query</code></td></tr>
          <tr><td>JSON body with a size limit</td><td><code>readJson</code></td><td><code>express.json({'{ limit: \'10kb\' }'})</code></td></tr>
          <tr><td>Sending JSON</td><td><code>sendJson</code></td><td><code>res.status(201).json(body)</code></td></tr>
          <tr><td>Errors from async handlers</td><td><code>.catch</code> plus <code>sendError</code></td><td>Rejected promises go to error-handling middleware automatically</td></tr>
          <tr><td>Logging, security headers, CORS</td><td>A <code>finish</code> listener</td><td>Middleware: small functions you plug into the pipeline</td></tr>
          <tr><td>405 with <code>Allow</code></td><td>Built in</td><td>Not automatic; you add it if you want it</td></tr>
          <tr><td>Validation</td><td><code>validate.ts</code> by hand</td><td>Still yours. Chapter 11 uses Zod</td></tr>
        </tbody>
      </TableWrap>

      <Exercises
        items={[
          {
            task: <>Add <code>PATCH /bookmarks/:id</code> to change the title, URL or tags of a bookmark. Every field is optional, but at least one must be present and valid. Check that <code>PUT</code> on a bookmark now answers 405 with <code>Allow: GET, PATCH, DELETE</code> without any change to the 405 code.</>,
            hint: <>Add an <code>update(id, changes)</code> method to the store, a <code>parseBookmarkPatch</code> function next to <code>parseNewBookmark</code>, and one row in the routes table.</>,
            solution: <><CodeFile path="08-raw-http-api.practice/src/validate.ts" /><CodeFile path="08-raw-http-api.practice/src/store.ts" /><p>The new route and the other two exercises are in <code>app.ts</code> below.</p></>,
          },
          {
            task: <>Paginate the list with <code>?limit=</code> (1–100, default 20) and <code>?offset=</code> (default 0). Answer 400 for values that are not whole numbers in range, and send the total number of matches in an <code>X-Total-Count</code> header.</>,
            hint: <>Write a small <code>readInt(url, name, fallback, min, max)</code> helper that throws an <code>HttpError(400, …)</code>, then <code>slice(offset, offset + limit)</code>.</>,
            solution: <CodeFile path="08-raw-http-api.practice/src/app.ts" />,
          },
          {
            task: <>Give every response an <code>X-Request-Id</code> header with a fresh UUID, and print the first eight characters of it at the start of each log line, so a client's bug report can be matched to a log line.</>,
            hint: <><code>randomUUID()</code> from <code>node:crypto</code>, and <code>res.setHeader()</code> at the top of the request listener. Headers set with <code>setHeader</code> are merged with the ones passed to <code>writeHead</code> later.</>,
            solution: <><p>See <code>createApp</code> in the solution above. Sample log:</p><Output>{`[ffbab016] POST /bookmarks -> 201 in 4.2 ms
[1a76398c] GET /bookmarks?limit=1&offset=1 -> 200 in 0.2 ms
[93bbd285] GET /bookmarks?limit=0 -> 400 in 0.2 ms
[38b40461] PUT /bookmarks/9cfd9a31-… -> 405 in 0.2 ms`}</Output></>,
          },
        ]}
      />

      <Checkpoint question={<>A handler writes part of a response with <code>res.write()</code> and then returns without calling <code>res.end()</code>. What does the client see, and does Node fix it for you?</>}>
        <p>
          The client receives the headers and the partial body and then waits, because as far as HTTP is concerned the
          response is still coming. Node does not end responses for you, and its timeouts cover receiving the request,
          not sending the response. The client hangs until its own timeout gives up (curl with <code>-m 2</code> exits
          with code 28 after two seconds). Every code path in a handler must end the response, which is one more thing
          a framework's error handling helps with.
        </p>
      </Checkpoint>
      <Checkpoint question={<>Why does <code>PUT /bookmarks</code> get a 405 with an <code>Allow</code> header instead of a 404?</>}>
        <p>
          404 says the resource does not exist, but <code>/bookmarks</code> does: it simply does not support{' '}
          <code>PUT</code>. 405 tells the client the path is right and the method is wrong, and HTTP requires the{' '}
          <code>Allow</code> header so the client can see which methods would work.
        </p>
      </Checkpoint>

      <Recap>
        <ul>
          <li>HTTP is a start line, headers, a blank line and a body. Status codes and headers are part of your API, so choose them deliberately.</li>
          <li>In <code>node:http</code> the request is a Readable stream and the response a Writable stream; every response must be ended.</li>
          <li>Never trust a body: check its type, cap its size, catch invalid JSON, and validate every field at run time.</li>
          <li>Throw errors that carry a status, and turn every error into a response in one place. An uncaught rejection in a request listener crashes the server.</li>
          <li><code>fetch</code> rejects only on network failures; check <code>response.ok</code> yourself and look in <code>error.cause</code> for the reason.</li>
        </ul>
      </Recap>
    </>
  );
}
