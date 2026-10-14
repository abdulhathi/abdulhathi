import type { ReactNode } from 'react';
import { Code, CodeFile, Terminal } from '../components/Code';
import { Box, K, Kbd, Output, TableWrap } from '../components/Content';
import { Diagram } from '../diagrams/Diagram';
import { shopflow } from '../diagrams/specs';

export function ShopFlow() {
  return (
    <>
      <Diagram spec={shopflow} caption="Three processes, one topic exchange, two quorum queues and a parking lot." />
      <div className="prose">
        <h3>Topology as code</h3>
        <p>
          Every exchange, queue and binding is declared in one file. Each service calls it on startup, so the broker always
          matches the code, whichever service starts first.
        </p>
      </div>
      <CodeFile path="src/09-shopflow/topology.ts" />
      <div className="prose">
        <h3>A service runner that reconnects</h3>
        <p>
          Until now, a broker restart killed every script. amqplib 2 can reconnect for you: pass <code>recovery</code> options
          and a <code>setup</code> function. After every successful connect, including reconnects, <code>setup</code> runs again
          and re-creates the channel, the queues and the consumer.
        </p>
      </div>
      <CodeFile path="src/lib/service.ts" />
      <div className="prose">
        <h3>The order API</h3>
        <p>
          A plain Node HTTP server. It answers <strong>202 Accepted</strong> only after the broker confirms the order, and{' '}
          <strong>503</strong> if it is offline, so a client never believes an order was taken when it was not.
        </p>
      </div>
      <CodeFile path="src/09-shopflow/order-api.ts" />
      <div className="prose">
        <h3>The two consumers</h3>
        <p>
          Fulfilment packs orders and publishes <K>order.shipped.&lt;region&gt;</K> back to the same exchange, so it is a
          consumer and a producer. Notifications remembers what it already sent, which makes it idempotent.
        </p>
      </div>
      <CodeFile path="src/09-shopflow/fulfilment-service.ts" />
      <CodeFile path="src/09-shopflow/notification-service.ts" />
      <div className="prose"><h3>Run it</h3></div>
      <Terminal title="Terminals 1, 2 and 3">{`
npx tsx src/09-shopflow/fulfilment-service.ts
npx tsx src/09-shopflow/notification-service.ts
npx tsx src/09-shopflow/order-api.ts`}</Terminal>
      <Terminal title="Terminal 4">{`
curl -X POST localhost:8080/orders -d '{"region":"eu","customer":"ada@example.com"}'
curl -X POST localhost:8080/orders`}</Terminal>
      <Output
        panes={[
          {
            tag: 'fulfilment',
            text: `[fulfilment] Connected
[fulfilment] Packing ord_a8373616 for eu
[fulfilment] Packing ord_a2173c67 for apac
[fulfilment] Shipped ord_a2173c67
[fulfilment] Shipped ord_a8373616`,
          },
          {
            tag: 'notifications',
            text: `[notifications] Connected
[email] To ada@example.com: your order ord_a8373616 was created
[email] To linus@example.com: your order ord_a2173c67 was created
[email] To linus@example.com: your order ord_a2173c67 was shipped
[email] To ada@example.com: your order ord_a8373616 was shipped`,
          },
        ]}
      />
      <Box kind="try" label="The resilience drill">
        <ol>
          <li>With all three services running, stop the broker: <code>docker compose stop rabbitmq</code>.</li>
          <li>
            Every service logs <code>Connection lost</code> and starts reconnecting with growing delays. A <code>curl</code> now
            returns <code>Order not accepted, try again</code> (HTTP 503).
          </li>
          <li>
            Start it again: <code>docker compose start rabbitmq</code>. Within a few seconds each service logs{' '}
            <code>Connected</code>, and new orders flow end to end.
          </li>
          <li>Start a second <code>fulfilment-service</code> in another terminal and post five orders. Two competing consumers now share the packing.</li>
        </ol>
      </Box>
      <Output caption="The drill, from the API's log">{`
[api] Accepted ord_34c406b2 (eu)
[api] Connection lost: Connection closed: 320 (CONNECTION-FORCED) with message "CONNECTION_FORCED - broker forced connection closure with reason 'shutdown'"
[api] Reconnect attempt 1 in 527ms
[api] Reconnect attempt 2 in 970ms
[api] Reconnect attempt 3 in 1839ms
[api] Rejected order: Not connected to RabbitMQ
[api] Reconnect attempt 4 in 4176ms
[api] Connected
[api] Accepted ord_a698c27f (apac)`}</Output>
      <div className="prose">
        <h3>What ShopFlow demonstrates</h3>
        <ul>
          <li><strong>Topic routing</strong> so new consumers can subscribe without touching producers.</li>
          <li><strong>Publisher confirms at the edge</strong>: the API never acknowledges an order the broker does not have.</li>
          <li><strong>Quorum queues with a delivery limit and a dead-letter exchange</strong> for failure handling.</li>
          <li><strong>Automatic recovery</strong>, with topology re-declared after every reconnect.</li>
          <li><strong>Idempotent consumers</strong>, because at-least-once delivery means duplicates.</li>
          <li><strong>Graceful shutdown</strong>: on <Kbd>Ctrl</Kbd>+<Kbd>C</Kbd> the connection closes and unacked messages return to their queues.</li>
        </ul>
      </div>
    </>
  );
}

const MERMAID = `
\`\`\`mermaid
flowchart LR
  api[order-api] -->|order.created.*| shop{{shop: topic}}
  shop -->|order.created.*| fq[(shop.fulfilment)]
  shop -->|order.created.* and order.shipped.*| nq[(shop.notifications)]
  fq --> ful[fulfilment-service]
  ful -->|order.shipped.*| shop
  nq --> notif[notification-service]
  fq -. dead letters .-> dlx{{shop.dlx}} --> dead[(shop.dead)]
  nq -.-> dlx
\`\`\``;

const CI = `
name: ci
on: [push, pull_request]

jobs:
  check:
    runs-on: ubuntu-latest
    services:
      rabbitmq:
        image: rabbitmq:4-management
        ports: ["5672:5672"]
        env:
          RABBITMQ_DEFAULT_USER: shopflow
          RABBITMQ_DEFAULT_PASS: shopflow
        options: >-
          --health-cmd "rabbitmq-diagnostics -q ping"
          --health-interval 5s --health-timeout 10s --health-retries 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run typecheck
      - run: npx tsx src/06-reliability/confirm-publisher.ts # smoke test against a real broker`;

export function Ship() {
  return (
    <>
      <div className="prose">
        <h3>1. Add scripts and a .gitignore</h3>
        <p>Merge these scripts into <code>package.json</code> so reviewers can run everything without reading the source.</p>
      </div>
      <Code title="package.json (scripts)" lang="json">{`
"scripts": {
  "broker": "docker compose up -d",
  "api": "tsx src/09-shopflow/order-api.ts",
  "fulfilment": "tsx src/09-shopflow/fulfilment-service.ts",
  "notifications": "tsx src/09-shopflow/notification-service.ts",
  "typecheck": "tsc -p ."
}`}</Code>
      <Terminal>{`
printf "node_modules/\\n.env\\n" > .gitignore
git init -b main
git add .
git commit -m "ShopFlow: RabbitMQ order pipeline in TypeScript"
gh repo create rabbitmq-shopflow --public --source . --push`}</Terminal>
      <div className="prose">
        <h3>2. Write a README that shows the design</h3>
        <p>Cover what it is, an architecture diagram, how to run it, and the decisions you made. GitHub renders Mermaid, so the diagram can live in the README as text:</p>
      </div>
      <Code title="README.md (diagram section)" lang="markdown">{MERMAID}</Code>
      <div className="prose">
        <p>
          Then add a <strong>Design decisions</strong> section with one short paragraph each: why a topic exchange, why quorum
          queues, why confirms in the API, how retries work, and how duplicates are handled. This is the part interviewers read.
        </p>
        <h3>3. Add CI with a real broker</h3>
        <p>A starting workflow that type-checks the code and runs the confirm publisher against RabbitMQ as a service container:</p>
      </div>
      <Code title=".github/workflows/ci.yml" lang="yaml">{CI}</Code>
      <div className="prose">
        <h3>4. Feature it on your profile</h3>
        <p>
          Add topics (<code>rabbitmq</code>, <code>amqp</code>, <code>typescript</code>, <code>event-driven</code>,{' '}
          <code>microservices</code>), pin the repo, and add a row to the Featured projects table in your profile README:
        </p>
      </div>
      <Code title="Profile README row" lang="markdown">{`
| [**rabbitmq-shopflow**](https://github.com/abdulhathi/rabbitmq-shopflow) | Order pipeline on RabbitMQ: topic routing, publisher confirms, quorum queues, dead letters with delayed retries, RPC, auto-reconnect | TypeScript · RabbitMQ · Docker |`}</Code>
      <div className="prose">
        <h3>Where to go next</h3>
        <ul>
          <li><strong>Streams:</strong> an analytics consumer on a stream queue that can replay every order from offset <code>first</code>.</li>
          <li><strong>A 3-node cluster</strong> in Docker Compose. Stop one node and watch a quorum queue keep serving.</li>
          <li><strong>Metrics:</strong> the image already serves Prometheus metrics on port <code>15692</code>. Add Prometheus and a Grafana dashboard.</li>
          <li><strong>Integration tests</strong> with Testcontainers, so each test gets a fresh broker.</li>
          <li><strong>Tracing:</strong> carry an OpenTelemetry trace id in message headers from the API through both services.</li>
        </ul>
      </div>
      <Terminal title="When you are finished: stop and delete the broker and its data">docker compose down -v</Terminal>
    </>
  );
}

export function Troubleshooting() {
  const rows: [ReactNode, ReactNode, ReactNode][] = [
    [<code>ECONNREFUSED 127.0.0.1:5672</code>, 'Broker not running or still starting', <><code>docker compose ps</code>, then wait for "Server startup complete" in the logs</>],
    [<code>ACCESS_REFUSED - Login was refused</code>, 'Wrong user or password. The default user is created only on the very first start, so editing the compose file later changes nothing', <>Check <code>RABBIT_URL</code>, or reset with <code>docker compose down -v</code></>],
    [<code>PRECONDITION_FAILED - inequivalent arg</code>, 'The queue or exchange already exists with different settings (durable, type, TTL, DLX)', 'Delete it in the UI and run again'],
    [<code>NOT_FOUND - no queue</code>, 'Consuming from or binding a queue nobody declared', <>Call <code>assertQueue</code> on both sides</>],
    ['Messages stuck in Unacked', <>The consumer never calls <code>ack</code>, or its handler threw before acking</>, 'Ack on every path, including errors. They return to Ready when the channel closes'],
    ['Consumer receives nothing', 'Missing or wrong binding, or the producer uses another exchange or key', 'Open the exchange in the UI and compare bindings with the routing key'],
    ['Messages vanish', 'Unroutable (no binding), non-durable queue after a restart, or auto-ack with a crashing consumer', <><code>mandatory: true</code>, durable + persistent, manual acks</>],
    ['A topic listener gets extra events', 'Old bindings from earlier runs are still on its queue', <>Unbind them in the UI or with <code>unbindQueue</code></>],
    [<code>Cannot find name 'process'</code>, <>TypeScript 7 does not load <code>@types/node</code> by itself</>, <>Add <code>"types": ["node"]</code> to <code>tsconfig.json</code></>],
    [<>Image pull: <code>authentication required</code></>, 'Stale Docker Hub credentials', <><code>docker logout</code>, then pull again</>],
    [<>Crash: <code>.erlang.cookie: eacces</code></>, 'File permissions in some Docker Desktop setups', <>Add <code>user: "999:999"</code> to the service</>],
  ];
  return (
    <TableWrap>
      <thead>
        <tr><th>Symptom</th><th>Cause</th><th>Fix</th></tr>
      </thead>
      <tbody>
        {rows.map(([symptom, cause, fix], i) => (
          <tr key={i}><td>{symptom}</td><td>{cause}</td><td>{fix}</td></tr>
        ))}
      </tbody>
    </TableWrap>
  );
}

export function CheatSheet() {
  const rows: [string, ReactNode, string][] = [
    ['amqp.connect(url, opts?)', <>Open a connection; pass <code>{'{ recovery }'}</code> to reconnect automatically</>, '04, 14'],
    ['createChannel() / createConfirmChannel()', 'Open a channel, optionally with publisher confirms', '04, 10'],
    ['assertQueue(name, opts)', <>Declare a queue: <code>durable</code>, <code>exclusive</code>, <code>messageTtl</code>, <code>deadLetterExchange</code>, <code>arguments</code></>, '05'],
    ['assertExchange(name, type, opts)', 'Declare a direct, fanout, topic or headers exchange', '07'],
    ['bindQueue(queue, exchange, key)', 'Route messages from an exchange to a queue', '07'],
    ['sendToQueue(queue, buf, props)', 'Publish through the default exchange', '05'],
    ['publish(exchange, key, buf, props, cb?)', 'Publish to an exchange; the callback fires on confirm', '07, 10'],
    ['consume(queue, handler, { noAck })', 'Subscribe to a queue', '05'],
    ['ack(msg) / nack(msg, all, requeue)', 'Confirm processing, or reject with or without requeue', '06, 12'],
    ['prefetch(n)', 'Limit unacked messages per consumer', '06'],
    ['get(queue)', <>Pull one message, or <code>false</code> when empty</>, '12'],
    ['waitForConfirms()', 'Resolve once every publish on a confirm channel is answered', '10'],
    ["channel.on('return', fn)", <>Receive unroutable messages published with <code>mandatory: true</code></>, '10'],
  ];
  return (
    <>
      <TableWrap>
        <thead>
          <tr><th>Call</th><th>What it does</th><th>Chapter</th></tr>
        </thead>
        <tbody>
          {rows.map(([call, what, ch]) => (
            <tr key={call}><td><code>{call}</code></td><td>{what}</td><td>{ch}</td></tr>
          ))}
        </tbody>
      </TableWrap>
      <p className="end">
        Every command and output in this tutorial was run against RabbitMQ 4.2.0 with amqplib 2.2.0, tsx 4 and TypeScript 7.
        IDs and timings in the outputs will differ on your machine.
      </p>
    </>
  );
}
