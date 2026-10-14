import { CodeFile, Terminal } from '../components/Code';
import { Box, Checkpoint, K, Kbd, Output, P, Q, TableWrap, X } from '../components/Content';
import { Diagram } from '../diagrams/Diagram';
import { direct, fanout, hello, topic, work } from '../diagrams/specs';

export function Hello() {
  return (
    <>
      <Diagram
        spec={hello}
        caption={<><P>send.ts</P> publishes with routing key <K>hello</K>; the default exchange delivers it to the queue of the same name.</>}
      />
      <CodeFile path="src/01-hello/send.ts" />
      <CodeFile path="src/01-hello/receive.ts" />
      <div className="prose"><h3>Run it</h3></div>
      <Terminal title="Terminal 1">npx tsx src/01-hello/receive.ts</Terminal>
      <Terminal title="Terminal 2">npx tsx src/01-hello/send.ts</Terminal>
      <Output
        panes={[
          { tag: 'Terminal 1', text: "[*] Waiting for messages in 'hello'. Press Ctrl+C to exit.\n[x] Received 'Hello, RabbitMQ!'" },
          { tag: 'Terminal 2', text: "[x] Sent 'Hello, RabbitMQ!'" },
        ]}
      />
      <div className="prose">
        <h3>What just happened</h3>
        <ul>
          <li>
            <strong><code>assertQueue</code></strong> creates the queue if it is missing and does nothing if it already exists
            with the same settings. Both sides call it, so start order does not matter.
          </li>
          <li>
            <strong><code>sendToQueue</code></strong> publishes to the default exchange, which has an implicit binding to every
            queue by name. The routing key <K>hello</K> lands in queue <Q>hello</Q>.
          </li>
          <li>
            <strong><code>noAck: true</code></strong> means the broker deletes the message the moment it sends it. Simple, but a
            crash mid-processing loses the message. Chapter 06 fixes this.
          </li>
          <li>
            <strong><code>durable: false</code></strong> means the queue disappears if the broker restarts. Fine for a hello
            world, wrong for orders.
          </li>
        </ul>
      </div>
      <Box kind="try" label="Try this">
        <ol>
          <li>Stop the receiver. Run <code>send.ts</code> three times.</li>
          <li>Open <strong>Queues and Streams</strong>: <Q>hello</Q> shows <strong>Ready 3</strong>. The queue buffers messages until someone wants them.</li>
          <li>Start the receiver again. All three arrive at once.</li>
        </ol>
      </Box>
      <Checkpoint question="Why does the receiver declare the queue even though the sender already does?">
        Because you cannot know which process starts first. If the receiver tried to consume from a queue that does not
        exist, the broker would close the channel with a <code>NOT_FOUND</code> error. Declaring is idempotent, so both sides
        do it safely.
      </Checkpoint>
    </>
  );
}

export function WorkQueues() {
  return (
    <>
      <div className="prose">
        <p>
          Packing an order takes time: one second per line item in our simulation. One worker cannot keep up, so you run
          several. They <strong>compete</strong> for messages on the same queue, and each order goes to exactly one of them.
        </p>
      </div>
      <Diagram spec={work} caption="Two workers on one durable queue. Each takes one order, packs it, acks, then takes the next." />
      <CodeFile path="src/02-work-queues/new-order.ts" />
      <CodeFile path="src/02-work-queues/worker.ts" />
      <div className="prose"><h3>Run it</h3></div>
      <Terminal title="Terminal 1 and 2">{`
npx tsx src/02-work-queues/worker.ts alice
npx tsx src/02-work-queues/worker.ts bob`}</Terminal>
      <Terminal title="Terminal 3">npx tsx src/02-work-queues/new-order.ts 6</Terminal>
      <Output
        caption="What you should see (ids and sizes vary)"
        panes={[
          {
            tag: 'alice',
            text: `[alice] Packing ord_bc6aa84c (1s)
[alice] Done ord_bc6aa84c
[alice] Packing ord_dd3a8231 (1s)
[alice] Done ord_dd3a8231
[alice] Packing ord_d111c5c4 (3s)
[alice] Done ord_d111c5c4`,
          },
          {
            tag: 'bob',
            text: `[bob] Packing ord_9800c0b1 (1s)
[bob] Done ord_9800c0b1
[bob] Packing ord_cb01f26c (4s)
[bob] Done ord_cb01f26c
[bob] Packing ord_ce2e7ce6 (4s)
[bob] Done ord_ce2e7ce6`,
          },
        ]}
      />
      <div className="prose">
        <h3>The four ideas in this chapter</h3>
        <h4>Competing consumers</h4>
        <p>Several consumers on one queue share the work. Add a worker to go faster; remove one and the rest carry on. This is how you scale a consumer horizontally.</p>
        <h4>Manual acknowledgements</h4>
        <p>
          With <code>noAck: false</code>, the broker keeps each message until the worker calls <code>channel.ack(msg)</code>. If
          the worker's channel or connection closes first, the broker puts the message back in the queue and delivers it to
          another worker, with <code>msg.fields.redelivered</code> set to <code>true</code>. Always ack <em>after</em> the work is done.
        </p>
        <h4>Prefetch</h4>
        <p>
          Without a limit, the broker pushes messages to consumers as fast as it can, round-robin, regardless of how busy they
          are. <code>channel.prefetch(1)</code> says "at most one unacked message for me", so a worker stuck on a 4-second order
          does not hoard the queue. Higher values (10 to 50) give more throughput for fast jobs.
        </p>
        <h4>Durability takes two settings</h4>
        <p>
          A <strong>durable queue</strong> survives a broker restart. A <strong>persistent message</strong> is written to disk.
          You need both: a persistent message in a non-durable queue is lost with the queue, and a durable queue full of
          transient messages comes back empty.
        </p>
      </div>
      <Box kind="try" label="Try this">
        <ol>
          <li>
            <strong>Crash a worker.</strong> Run only <code>alice</code>, queue 6 orders, and press <Kbd>Ctrl</Kbd>+<Kbd>C</Kbd>{' '}
            while she is packing. Start <code>bob</code>: he receives the order alice never acked. Log{' '}
            <code>msg.fields.redelivered</code> to see <code>true</code>.
          </li>
          <li>
            <strong>Forget the ack.</strong> Comment out <code>channel.ack(msg)</code>. In the UI, <strong>Unacked</strong> climbs
            and never falls. Stop the worker and watch them move back to <strong>Ready</strong>.
          </li>
          <li>
            <strong>Survive a restart.</strong> Stop all workers, queue 6 orders, then run <code>docker compose restart rabbitmq</code>. The orders are still there.
          </li>
        </ol>
      </Box>
      <Box kind="warn" label="Gotcha">
        <p>
          You cannot change <code>durable</code> (or any other setting) on a queue that already exists. The broker closes the
          channel with <code>PRECONDITION_FAILED - inequivalent arg 'durable'</code>. Delete the queue in the UI first, or use a new name.
        </p>
      </Box>
      <Checkpoint question="Two workers with prefetch 1. The first order takes 10 seconds and the next five take 1 second each. Who packs what?">
        The worker on the long order receives nothing else until it acks. The other worker packs all five short orders in
        about 5 seconds. Without prefetch, the broker would have pushed three orders to each worker up front, and two short
        orders would wait behind the long one.
      </Checkpoint>
    </>
  );
}

export function Fanout() {
  return (
    <>
      <div className="prose">
        <p>
          A work queue gives each message to <em>one</em> consumer. Now you want the opposite: the email service, the analytics
          service and a live dashboard should <em>all</em> see every order. Each gets its own queue, and a{' '}
          <strong>fanout exchange</strong> copies every message to every bound queue.
        </p>
      </div>
      <Diagram spec={fanout} caption={<>One publish, three copies. The publisher only knows the exchange <X>orders.placed</X>.</>} />
      <CodeFile path="src/03-fanout/place-order.ts" />
      <CodeFile path="src/03-fanout/subscriber.ts" />
      <CodeFile path="src/03-fanout/live-feed.ts" />
      <div className="prose"><h3>Run it</h3></div>
      <Terminal title="Terminals 1, 2 and 3">{`
npx tsx src/03-fanout/subscriber.ts email
npx tsx src/03-fanout/subscriber.ts analytics
npx tsx src/03-fanout/live-feed.ts`}</Terminal>
      <Terminal title="Terminal 4">npx tsx src/03-fanout/place-order.ts 3</Terminal>
      <Output
        panes={[
          {
            tag: 'email',
            text: `[email] Listening on orders.placed.email
[email] Got ord_bc6aa870 ($49)
[email] Got ord_e55ebf36 ($98)
[email] Got ord_ed71192d ($147)`,
          },
          {
            tag: 'live feed',
            text: `[live] Watching orders through temporary queue amq.gen-N7KdKTR0RsT1Et88u2Ai-Q
[live] ord_bc6aa870  eu  $49
[live] ord_e55ebf36  apac  $98
[live] ord_ed71192d  us  $147`,
          },
        ]}
      />
      <div className="prose">
        <h3>Two kinds of subscriber queue</h3>
        <ul>
          <li>
            <strong>Named and durable</strong> (<Q>orders.placed.email</Q>): owned by a service. Messages wait there while the
            service is down, so it never misses an order.
          </li>
          <li>
            <strong>Server-named and exclusive</strong> (<Q>amq.gen-…</Q>): the broker picks the name and deletes the queue when
            the connection closes. Right for a live view that only cares about now.
          </li>
        </ul>
        <p>
          The <strong>binding</strong> (<code>bindQueue</code>) is what connects a queue to an exchange. A fanout exchange
          ignores routing keys, which is why every call passes an empty string.
        </p>
      </div>
      <Box kind="try" label="Try this">
        <ol>
          <li>Stop the email subscriber and place 3 orders. In the UI, <Q>orders.placed.email</Q> shows <strong>Ready 3</strong>. Restart it and the backlog arrives.</li>
          <li>Stop the live feed. Its <Q>amq.gen-…</Q> queue vanishes from the Queues tab. Orders placed now are never seen by it.</li>
          <li>Open <strong>Exchanges → orders.placed</strong> and look at the bindings list.</li>
        </ol>
      </Box>
      <Checkpoint question={<>Next month you add a fraud-check service. What changes in <P>place-order.ts</P>?</>}>
        Nothing. The fraud service declares its own queue and binds it to <X>orders.placed</X>. Producers and consumers only
        share the exchange name, which is the decoupling you are after.
      </Checkpoint>
    </>
  );
}

export function Direct() {
  return (
    <>
      <div className="prose">
        <p>
          A <strong>direct exchange</strong> compares the message's routing key with each binding key and delivers on an exact
          match. The order's region becomes the routing key. One queue can have several bindings, so a single warehouse can
          serve two regions.
        </p>
      </div>
      <Diagram spec={direct} caption={<><Q>warehouse.eu-apac</Q> has two bindings, <K>eu</K> and <K>apac</K>.</>} />
      <CodeFile path="src/04-direct/route-orders.ts" />
      <CodeFile path="src/04-direct/warehouse.ts" />
      <div className="prose"><h3>Run it</h3></div>
      <Terminal title="Terminals 1 and 2">{`
npx tsx src/04-direct/warehouse.ts us
npx tsx src/04-direct/warehouse.ts eu apac`}</Terminal>
      <Terminal title="Terminal 3">npx tsx src/04-direct/route-orders.ts 6</Terminal>
      <Output
        panes={[
          { tag: 'warehouse.us', text: `[warehouse.us] Shipping orders for: us\n[warehouse.us] ord_b5b03498 (us)` },
          {
            tag: 'warehouse.eu-apac',
            text: `[warehouse.eu-apac] Shipping orders for: eu, apac
[warehouse.eu-apac] ord_c27cf733 (eu)
[warehouse.eu-apac] ord_d37482f7 (eu)
[warehouse.eu-apac] ord_854be5ad (eu)
[warehouse.eu-apac] ord_15220e7e (apac)
[warehouse.eu-apac] ord_31e38205 (apac)`,
          },
        ]}
      />
      <div className="prose">
        <ul>
          <li><strong>Exact match only.</strong> <K>us</K> matches <K>us</K>, never <K>US</K> or <K>us-west</K>.</li>
          <li><strong>The same key on two queues</strong> gives both a copy, so a direct exchange can fan out per key.</li>
          <li><strong>No match means the message is dropped</strong>, silently. The producer is not told.</li>
        </ul>
      </div>
      <Box kind="try" label="Try this">
        <ol>
          <li>Start a third warehouse with <code>warehouse.ts us eu</code>. Route 6 orders: <K>eu</K> orders now reach two queues.</li>
          <li>
            Stop all warehouses. In the UI, delete the queues <Q>warehouse.eu-apac</Q> and <Q>warehouse.us-eu</Q>. Route 6
            orders. Only <Q>warehouse.us</Q> grows; every <K>eu</K> and <K>apac</K> order is gone. Remember this for chapter 10.
          </li>
        </ol>
      </Box>
    </>
  );
}

const MATCHES: [string, boolean, boolean, boolean][] = [
  ['order.created.us', true, false, false],
  ['order.shipped.eu', true, true, false],
  ['order.cancelled.eu', true, true, true],
  ['order.cancelled.apac', true, false, true],
  ['order.eu', true, false, false],
  ['invoice.created.us', false, false, false],
];

export function Topic() {
  return (
    <>
      <div className="prose">
        <p>
          Order events now carry structured keys: <K>order.&lt;event&gt;.&lt;region&gt;</K>, for example <K>order.cancelled.eu</K>.
          A <strong>topic exchange</strong> splits keys on dots and matches them against binding patterns with two wildcards:
        </p>
        <ul>
          <li><K>*</K> matches exactly one word.</li>
          <li><K>#</K> matches zero or more words.</li>
        </ul>
      </div>
      <Diagram spec={topic} caption="Three listeners, three patterns, one exchange." />
      <TableWrap className="t matrix">
        <thead>
          <tr><th>Routing key</th><th><K>order.#</K></th><th><K>order.*.eu</K></th><th><K>order.cancelled.*</K></th></tr>
        </thead>
        <tbody>
          {MATCHES.map(([key, ...hits]) => (
            <tr key={key}>
              <td><K>{key}</K></td>
              {hits.map((hit, i) => (
                <td key={i} className={hit ? 'yes' : 'no'} aria-label={hit ? 'matches' : 'no match'}>{hit ? '✓' : '–'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </TableWrap>
      <CodeFile path="src/05-topic/emit-events.ts" />
      <CodeFile path="src/05-topic/listener.ts" />
      <div className="prose"><h3>Run it</h3></div>
      <Terminal title="Terminals 1, 2 and 3">{`
npx tsx src/05-topic/listener.ts audit 'order.#'
npx tsx src/05-topic/listener.ts eu-support 'order.*.eu'
npx tsx src/05-topic/listener.ts cancellations 'order.cancelled.*'`}</Terminal>
      <Terminal title="Terminal 4">npx tsx src/05-topic/emit-events.ts 8</Terminal>
      <Output
        caption="What you should see (events are random)"
        panes={[
          {
            tag: 'emit-events',
            text: `[x] order.shipped.eu       ord_9c3224e7
[x] order.cancelled.apac   ord_5c35f2db
[x] order.created.us       ord_0c01112e
[x] order.shipped.us       ord_5de660b9
[x] order.cancelled.us     ord_f4d9f462
[x] order.cancelled.us     ord_cffdff3e
[x] order.shipped.us       ord_9a1a71be
[x] order.created.apac     ord_4dab43ce`,
          },
          {
            tag: 'eu-support and cancellations',
            text: `[eu-support] Bound with order.*.eu
[eu-support] order.shipped.eu

[cancellations] Bound with order.cancelled.*
[cancellations] order.cancelled.apac
[cancellations] order.cancelled.us
[cancellations] order.cancelled.us`,
          },
        ]}
      />
      <div className="prose">
        <p>Quote the patterns in your shell. Otherwise zsh or bash may try to expand <code>*</code> as a file glob.</p>
      </div>
      <Box kind="warn" label="Gotcha">
        <p>
          Bindings belong to the broker, not to your process. They stay after the listener stops, and running{' '}
          <code>listener.ts audit 'order.paid.*'</code> later <em>adds</em> a binding to <Q>events.audit</Q> instead of replacing{' '}
          <K>order.#</K>. Remove old ones in <strong>Exchanges → order.events → Bindings → Unbind</strong>, or call{' '}
          <code>channel.unbindQueue()</code>.
        </p>
      </Box>
      <div className="prose">
        <h3>All exchange types side by side</h3>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Type</th><th>Routes by</th><th>Typical use</th></tr>
        </thead>
        <tbody>
          <tr><td>Default</td><td>Routing key = queue name</td><td>Simple point-to-point, <code>sendToQueue</code></td></tr>
          <tr><td>Direct</td><td>Exact key match</td><td>Commands to a specific worker group</td></tr>
          <tr><td>Fanout</td><td>Nothing: every bound queue</td><td>Broadcast events, cache invalidation</td></tr>
          <tr><td>Topic</td><td>Dot-separated patterns with <code>*</code> and <code>#</code></td><td>Domain events consumed selectively</td></tr>
          <tr><td>Headers</td><td>Message header values (<code>x-match: all</code> or <code>any</code>)</td><td>Routing on several attributes; rarely needed</td></tr>
        </tbody>
      </TableWrap>
      <Checkpoint question={<>What does a topic binding of <K>#</K> alone behave like? And a pattern with no wildcards?</>}>
        <K>#</K> matches every key, so the queue behaves like it is bound to a fanout exchange. A pattern with no wildcards
        matches only that exact key, like a direct binding. Topic exchanges cover both cases, which is why many systems use
        them by default.
      </Checkpoint>
    </>
  );
}
