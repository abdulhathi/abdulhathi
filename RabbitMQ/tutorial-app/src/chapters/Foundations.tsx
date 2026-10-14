import { CodeFile, Terminal } from '../components/Code';
import { Box, Checkpoint, K, Kbd, Output, P, Q, TableWrap, X, C } from '../components/Content';
import { Diagram } from '../diagrams/Diagram';
import { concepts, shopflow } from '../diagrams/specs';

const LEGEND = [
  ['producer', 'Producer'],
  ['exchange', 'Exchange'],
  ['queue', 'Queue'],
  ['consumer', 'Consumer'],
  ['dead', 'Dead letters'],
] as const;

export function Build() {
  return (
    <>
      <div className="prose">
        <p>
          The order API never calls the fulfilment or email services directly. It publishes an <em>order created</em> event
          and returns. The fulfilment service packs the order and publishes <em>order shipped</em>. The notification service
          emails the customer for both events. If a service is slow, restarting, or scaled to five copies, the API does not
          notice. That decoupling is the reason message brokers exist.
        </p>
      </div>
      <Diagram
        spec={shopflow}
        caption={<>The finished ShopFlow app (chapter 14). Both work queues dead-letter failed messages to <X>shop.dlx</X>.</>}
      />
      <ul className="legend" aria-label="Diagram legend">
        {LEGEND.map(([kind, label]) => (
          <li key={kind}>
            <span className="swatch" style={{ background: `var(--${kind}-tint)`, borderColor: `var(--${kind})` }} />
            {label}
          </li>
        ))}
        <li>
          <K>order.created.*</K> Routing key or binding pattern
        </li>
      </ul>
      <div className="prose">
        <h3>The route through the concepts</h3>
        <p>Every chapter builds one small piece in its own folder, so you can rerun any step later. The same colours mark names in the text and boxes in the diagrams.</p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Ch.</th><th>Concept</th><th>You build</th><th>Folder</th></tr>
        </thead>
        <tbody>
          <tr><td>05</td><td>Queues, default exchange, auto-ack</td><td>Send and receive one message</td><td><code>src/01-hello</code></td></tr>
          <tr><td>06</td><td>Competing consumers, manual acks, prefetch, durability</td><td>Order packing workers</td><td><code>src/02-work-queues</code></td></tr>
          <tr><td>07</td><td>Fanout exchange, bindings, exclusive queues</td><td>Email, analytics and live feed</td><td><code>src/03-fanout</code></td></tr>
          <tr><td>08</td><td>Direct exchange, routing keys</td><td>Regional warehouses</td><td><code>src/04-direct</code></td></tr>
          <tr><td>09</td><td>Topic exchange, wildcards</td><td>Event listeners by pattern</td><td><code>src/05-topic</code></td></tr>
          <tr><td>10</td><td>Publisher confirms, mandatory, at-least-once</td><td>A publisher that knows its messages arrived</td><td><code>src/06-reliability</code></td></tr>
          <tr><td>12</td><td>Dead-letter exchanges, TTL, delayed retries, delivery limit</td><td>A payment worker that survives failures</td><td><code>src/07-dead-letters</code></td></tr>
          <tr><td>13</td><td>replyTo, correlationId</td><td>A shipping-quote service</td><td><code>src/08-rpc</code></td></tr>
          <tr><td>14</td><td>Topology as code, reconnection, idempotency</td><td>The full ShopFlow app</td><td><code>src/09-shopflow</code></td></tr>
        </tbody>
      </TableWrap>
      <Box kind="key" label="How to work through it">
        <ol>
          <li><strong>Read the concept</strong> before the code. Each chapter opens with one idea.</li>
          <li><strong>Type the code</strong> rather than pasting it. You will remember the API far better.</li>
          <li><strong>Run it</strong> with several terminal tabs open, and keep the management UI visible.</li>
          <li><strong>Do the experiments.</strong> Breaking things on purpose is where the learning happens.</li>
          <li><strong>Answer the checkpoint</strong> before opening the answer, then tick the chapter off.</li>
        </ol>
      </Box>
    </>
  );
}

export function Vocabulary() {
  return (
    <>
      <Diagram spec={concepts} caption="The core path every message takes: producer → exchange → binding → queue → consumer." />
      <Box kind="key" label="The one idea to keep">
        <p>
          Producers never publish straight into a queue. They publish to an <strong>exchange</strong> with a{' '}
          <strong>routing key</strong>. The exchange looks at its type and its <strong>bindings</strong> and decides which
          queues get a copy. Even <code>sendToQueue()</code> goes through an exchange: the nameless default exchange.
        </p>
      </Box>
      <TableWrap>
        <thead>
          <tr><th>Term</th><th>What it is</th></tr>
        </thead>
        <tbody>
          <tr><td>Broker</td><td>The RabbitMQ server. It stores and routes messages.</td></tr>
          <tr><td>Connection</td><td>One TCP connection from your process to the broker. Expensive to open, so keep one per process.</td></tr>
          <tr><td>Channel</td><td>A lightweight virtual connection inside a connection. Almost every operation happens on a channel.</td></tr>
          <tr><td><P>Producer</P></td><td>Code that publishes messages.</td></tr>
          <tr><td><X>Exchange</X></td><td>Receives messages and routes them to queues. Its type (direct, fanout, topic, headers) sets the routing rule.</td></tr>
          <tr><td><K>Routing key</K></td><td>A string the producer attaches to each message, such as <K>order.created.eu</K>.</td></tr>
          <tr><td>Binding</td><td>A rule that links an exchange to a queue, optionally with a key or pattern.</td></tr>
          <tr><td><Q>Queue</Q></td><td>An ordered buffer that holds messages until a consumer takes them.</td></tr>
          <tr><td><C>Consumer</C></td><td>Code that subscribes to a queue and processes its messages.</td></tr>
          <tr><td>Ack</td><td>The consumer telling the broker "done, delete it". Without an ack, the broker keeps the message and can redeliver it.</td></tr>
          <tr><td>Virtual host</td><td>A namespace for exchanges, queues and permissions. We use the default <code>/</code>.</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <h3>What a message carries</h3>
        <p>RabbitMQ treats the body as bytes. Everything else travels as properties or delivery information.</p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Part</th><th>Examples</th><th>Set by</th></tr>
        </thead>
        <tbody>
          <tr><td>Body</td><td>JSON order, bytes of any format</td><td>Producer</td></tr>
          <tr>
            <td>Properties</td>
            <td><code>contentType</code>, <code>persistent</code>, <code>messageId</code>, <code>correlationId</code>, <code>replyTo</code>, <code>expiration</code>, <code>headers</code></td>
            <td>Producer</td>
          </tr>
          <tr><td>Delivery info</td><td><code>exchange</code>, <code>routingKey</code>, <code>redelivered</code>, <code>deliveryTag</code></td><td>Broker, on delivery</td></tr>
        </tbody>
      </TableWrap>
      <Checkpoint question={<>A producer calls <code>channel.publish('shop', 'order.created.eu', body)</code>, but no queue is bound to <X>shop</X>. Where does the message go?</>}>
        Nowhere. The exchange finds no matching binding and drops the message. Chapter 10 shows how to get it back with the <code>mandatory</code> flag.
      </Checkpoint>
    </>
  );
}

export function RunRabbit() {
  return (
    <>
      <div className="prose">
        <p>Create the project folder and save this file in it as <code>docker-compose.yml</code>.</p>
      </div>
      <CodeFile path="docker-compose.yml" />
      <Terminal>{`
mkdir rabbitmq-shopflow && cd rabbitmq-shopflow
# save docker-compose.yml here, then:
docker compose up -d
docker compose logs -f rabbitmq`}</Terminal>
      <div className="prose">
        <p>
          Wait for <code>Server startup complete; 4 plugins started.</code> in the log, then press <Kbd>Ctrl</Kbd>+<Kbd>C</Kbd> to
          stop following it. The broker keeps running.
        </p>
        <p>Port <code>5672</code> speaks AMQP 0-9-1, the protocol your code uses. Port <code>15672</code> serves the management UI.</p>
        <h3>Tour the management UI</h3>
        <p>
          Open <a href="http://localhost:15672" target="_blank" rel="noreferrer">http://localhost:15672</a> and sign in as{' '}
          <code>shopflow</code> / <code>shopflow</code>.
        </p>
        <ul>
          <li><strong>Overview</strong>: message rates and node health. Watch the graphs move while scripts run.</li>
          <li><strong>Connections</strong> and <strong>Channels</strong>: every running script appears here. Close one from the UI to see how your code reacts.</li>
          <li><strong>Exchanges</strong>: the built-in <code>amq.*</code> exchanges and the default exchange, shown as <code>(AMQP default)</code>. Click one to see its bindings.</li>
          <li>
            <strong>Queues and Streams</strong>: the most useful tab. <strong>Ready</strong> means waiting for a consumer;{' '}
            <strong>Unacked</strong> means delivered but not yet acknowledged. A queue's page lets you publish, get, purge or delete messages.
          </li>
          <li><strong>Admin</strong>: users, virtual hosts and policies.</li>
        </ul>
        <h3>The same information from the command line</h3>
      </div>
      <Terminal>{`
docker compose exec rabbitmq rabbitmqctl list_queues name type messages_ready messages_unacknowledged consumers
docker compose exec rabbitmq rabbitmqctl list_exchanges name type
docker compose exec rabbitmq rabbitmqctl list_bindings source_name destination_name routing_key`}</Terminal>
      <Box kind="warn" label="If it does not start">
        <p>
          Two problems came up while testing this tutorial on Docker Desktop.{' '}
          <strong>"authentication required - incorrect username or password"</strong> when pulling the image means Docker
          holds a stale Docker Hub login: run <code>docker logout</code> (or sign in again in Docker Desktop) and retry. A
          crash mentioning <strong><code>.erlang.cookie: eacces</code></strong> is fixed by adding <code>user: "999:999"</code>{' '}
          under the <code>rabbitmq</code> service, which runs it as the image's own <code>rabbitmq</code> user.
        </p>
      </Box>
    </>
  );
}

export function Setup() {
  return (
    <>
      <Terminal>{`
npm init -y
npm pkg set type=module
npm install amqplib
npm install -D tsx typescript @types/node`}</Terminal>
      <div className="prose">
        <p>
          <code>amqplib</code> is the Node client for RabbitMQ. Version 2 ships its own TypeScript types and can reconnect by
          itself (chapter 14). <code>tsx</code> runs TypeScript files directly, so there is no build step: every script runs
          with <code>npx tsx path/to/file.ts</code>.
        </p>
        <p>Add a <code>tsconfig.json</code> so your editor and <code>npx tsc</code> can type-check the project.</p>
      </div>
      <CodeFile path="tsconfig.json" />
      <Box kind="warn" label="TypeScript 7">
        <p>
          TypeScript 7 no longer loads <code>@types/node</code> on its own. Without <code>"types": ["node"]</code>, the checker
          reports <code>Cannot find name 'process'</code> and <code>'Buffer'</code>.
        </p>
      </Box>
      <div className="prose">
        <h3>Where everything will live</h3>
      </div>
      <Output caption="Project layout when you finish">{`
rabbitmq-shopflow/
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── src/
    ├── lib/
    │   ├── rabbit.ts          connect helpers (this chapter)
    │   ├── order.ts           fake order generator (this chapter)
    │   └── service.ts         reconnecting service runner (chapter 14)
    ├── 01-hello/              chapter 05
    ├── 02-work-queues/        chapter 06
    ├── 03-fanout/             chapter 07
    ├── 04-direct/             chapter 08
    ├── 05-topic/              chapter 09
    ├── 06-reliability/        chapter 10
    ├── 07-dead-letters/       chapter 12
    ├── 08-rpc/                chapter 13
    └── 09-shopflow/           chapter 14`}</Output>
      <div className="prose">
        <h3>The connection helper</h3>
        <p>Every script opens one connection and one channel the same way.</p>
      </div>
      <CodeFile path="src/lib/rabbit.ts" />
      <Box kind="key" label="Connections and channels">
        <p>
          A connection is a TCP socket with a handshake, authentication and heartbeats. A channel is a cheap virtual
          connection multiplexed inside it. Open <strong>one connection per process</strong> and channels as needed. Opening a
          connection for every message is the most common RabbitMQ performance mistake.
        </p>
      </Box>
      <div className="prose">
        <h3>The order generator</h3>
        <p>Realistic fake orders, so the later chapters have something to route.</p>
      </div>
      <CodeFile path="src/lib/order.ts" />
    </>
  );
}
