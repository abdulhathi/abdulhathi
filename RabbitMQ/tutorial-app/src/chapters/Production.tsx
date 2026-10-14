import { Code, CodeFile, Terminal } from '../components/Code';
import { Box, C, Checkpoint, D, Output, Q, TableWrap, X } from '../components/Content';
import { Diagram } from '../diagrams/Diagram';
import { deadLetters, rpc } from '../diagrams/specs';

export function Reliability() {
  return (
    <>
      <div className="prose">
        <p>A message passes through three handoffs. Each one needs its own safeguard.</p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Handoff</th><th>What can go wrong</th><th>Safeguard</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Producer → broker</td>
            <td>Network drops, broker crashes before storing, no queue matches</td>
            <td><strong>Publisher confirms</strong>, <code>mandatory: true</code> with a return handler</td>
          </tr>
          <tr>
            <td>Inside the broker</td>
            <td>Broker restarts or its disk fails</td>
            <td><strong>Durable queue + persistent message</strong>; quorum queues replicate across nodes (chapter 11)</td>
          </tr>
          <tr>
            <td>Broker → consumer</td>
            <td>Consumer crashes mid-processing</td>
            <td><strong>Manual ack after the work</strong> (chapter 06)</td>
          </tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <h3>Publisher confirms and returns</h3>
        <p>
          On a <strong>confirm channel</strong> the broker answers every publish with an ack (stored safely) or a nack (could
          not store it). With <code>mandatory: true</code>, a message that matches no queue is handed back through a{' '}
          <code>return</code> event instead of being dropped.
        </p>
      </div>
      <CodeFile path="src/06-reliability/confirm-publisher.ts" />
      <Terminal>npx tsx src/06-reliability/confirm-publisher.ts</Terminal>
      <Output>{`
[!] Returned by broker: no queue bound for 'invoice.created.us'
[✓] Broker confirmed ord_e1a6537b
[x] Every publish was answered by the broker`}</Output>
      <div className="prose">
        <p>
          A returned message is still <em>confirmed</em>, because the broker did handle it. Treat the return as the signal
          that something is misconfigured. An alternative is an <strong>alternate exchange</strong> (
          <code>{"assertExchange(name, type, { alternateExchange: 'unrouted' })"}</code>), which routes unmatched messages to a
          catch-all queue instead.
        </p>
        <p>
          Confirms are asynchronous. For throughput, publish a batch and call <code>waitForConfirms()</code> once, rather than
          waiting after every single message.
        </p>
        <h3>At-least-once means duplicates</h3>
        <p>
          Put the safeguards together and RabbitMQ gives you <strong>at-least-once</strong> delivery: nothing is lost, but a
          message can arrive twice. A consumer that finishes the work and crashes before its ack will see the message again. A
          producer that times out waiting for a confirm will publish again. Exactly-once delivery does not exist end to end, so
          make consumers <strong>idempotent</strong>: give each message a <code>messageId</code> and skip ids you have already
          processed. ShopFlow's notification service does this in chapter 14.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Guarantee</th><th>Settings</th><th>Trade-off</th></tr>
        </thead>
        <tbody>
          <tr><td>At-most-once</td><td>Auto-ack, no confirms, transient messages</td><td>Fastest; loses messages on any failure</td></tr>
          <tr><td>At-least-once</td><td>Manual acks, confirms, durable + persistent</td><td>No loss; consumers must handle duplicates</td></tr>
        </tbody>
      </TableWrap>
      <Checkpoint question="Your API publishes an order, gets no confirm within 5 seconds, and publishes it again. Both copies reach the queue. Which component should deal with that, and how?">
        The consumer. Both copies carry the same <code>messageId</code> (the order id), so the consumer records processed ids
        in a store with a unique key and acks duplicates without doing the work again.
      </Checkpoint>
    </>
  );
}

export function QueueTypes() {
  return (
    <>
      <div className="prose">
        <p>
          So far every queue has been a <strong>classic</strong> queue, the default type. RabbitMQ 4 offers two more, chosen
          with the <code>x-queue-type</code> argument when you declare the queue. Classic mirrored queues were removed in
          RabbitMQ 4.0; quorum queues replace them.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th></th><th>Classic</th><th>Quorum</th><th>Stream</th></tr>
        </thead>
        <tbody>
          <tr><td>Declare with</td><td>(default)</td><td><code>'x-queue-type': 'quorum'</code></td><td><code>'x-queue-type': 'stream'</code></td></tr>
          <tr><td>Replication</td><td>None, lives on one node</td><td>Raft consensus across 3, 5 or 7 nodes</td><td>Replicated append-only log</td></tr>
          <tr><td>After consuming</td><td>Message deleted on ack</td><td>Message deleted on ack</td><td>Kept; consumers read from an offset and can replay</td></tr>
          <tr><td>Poison messages</td><td>No built-in limit</td><td><code>x-delivery-limit</code> (default 20 in 4.x)</td><td>Not applicable</td></tr>
          <tr><td>Exclusive, non-durable</td><td>Supported</td><td>Not supported: always durable</td><td>Not supported</td></tr>
          <tr><td>Use it for</td><td>Temporary, exclusive and reply queues</td><td>Orders, payments, anything you cannot lose</td><td>Event history, many consumers reading the same data, replay</td></tr>
        </tbody>
      </TableWrap>
      <Box kind="key" label="Rule of thumb">
        <p>
          Quorum for anything important, classic for temporary and exclusive queues, stream when consumers need history. On a
          single node, as in this tutorial, a quorum queue cannot replicate, but you still get the delivery limit, and moving
          to a 3-node cluster later needs no code change.
        </p>
      </Box>
      <div className="prose">
        <p>Chapters 12 and 14 declare their important queues like this:</p>
      </div>
      <Code title="Declaring a quorum queue">{`
await channel.assertQueue('payments', {
  durable: true, // required for quorum queues
  deadLetterExchange: 'payments.dlx',
  arguments: { 'x-queue-type': 'quorum', 'x-delivery-limit': 5 },
});`}</Code>
      <Box kind="warn" label="Gotcha">
        <p>
          A queue's type cannot change after it is created. Declaring an existing classic queue as quorum fails with{' '}
          <code>PRECONDITION_FAILED - inequivalent arg 'x-queue-type'</code>. Delete the queue and declare it again, or migrate
          to a new name.
        </p>
      </Box>
    </>
  );
}

export function DeadLetters() {
  return (
    <>
      <div className="prose">
        <p>
          Charging a card can fail in two very different ways. A <strong>declined card</strong> will never succeed, so retrying
          is pointless. A <strong>gateway timeout</strong> might succeed in a few seconds. The payment worker treats them
          differently, using three queues:
        </p>
        <ul>
          <li><Q>payments</Q>: the main work queue. Rejected messages are <strong>dead-lettered</strong> to <X>payments.dlx</X>.</li>
          <li><Q>payments.retry</Q>: a waiting room with a 5-second <strong>TTL</strong> and no consumer. Expired messages dead-letter straight back into <Q>payments</Q>.</li>
          <li><D>payments.dead</D>: the parking lot, where a human looks at what failed.</li>
        </ul>
      </div>
      <Diagram spec={deadLetters} caption="Dashed teal is the delayed retry loop. Dashed red is the path to the parking lot." />
      <CodeFile path="src/07-dead-letters/topology.ts" />
      <CodeFile path="src/07-dead-letters/publish-payments.ts" />
      <CodeFile path="src/07-dead-letters/payment-worker.ts" />
      <CodeFile path="src/07-dead-letters/inspect-dead.ts" />
      <div className="prose"><h3>Run it</h3></div>
      <Terminal title="Terminal 1">npx tsx src/07-dead-letters/payment-worker.ts</Terminal>
      <Terminal title="Terminal 2: publish, wait about 20 seconds, then inspect">{`
npx tsx src/07-dead-letters/publish-payments.ts
npx tsx src/07-dead-letters/inspect-dead.ts`}</Terminal>
      <Output
        panes={[
          {
            tag: 'payment-worker',
            text: `[payments] Waiting for payments...
[✓] ord_ok charged $49
[✗] ord_declined card declined, giving up: dead-lettered
[~] ord_flaky gateway timeout, retry 1/3 in 5s
[~] ord_down gateway timeout, retry 1/3 in 5s
[~] ord_flaky gateway timeout, retry 2/3 in 5s
[~] ord_down gateway timeout, retry 2/3 in 5s
[✓] ord_flaky charged $75.5
[~] ord_down gateway timeout, retry 3/3 in 5s
[✗] ord_down gateway timeout, giving up: dead-lettered`,
          },
          {
            tag: 'inspect-dead',
            text: `ord_declined   rejected in payments x1
ord_down       rejected in payments x1, expired in payments.retry x1
[x] 2 message(s) in payments.dead`,
          },
        ]}
      />
      <div className="prose">
        <h3>How dead-lettering works</h3>
        <p>A queue with a <code>deadLetterExchange</code> republishes a message to that exchange, instead of dropping it, when one of these happens:</p>
      </div>
      <TableWrap>
        <thead>
          <tr><th><code>x-death</code> reason</th><th>Cause</th><th>Seen in this chapter</th></tr>
        </thead>
        <tbody>
          <tr><td><code>rejected</code></td><td>Consumer called <code>nack</code> or <code>reject</code> with <code>requeue: false</code></td><td>Declined card, retries used up</td></tr>
          <tr><td><code>expired</code></td><td>Message TTL or per-message <code>expiration</code> ran out</td><td>Every pass through <Q>payments.retry</Q></td></tr>
          <tr><td><code>delivery_limit</code></td><td>A quorum queue redelivered it more than <code>x-delivery-limit</code> times</td><td>The poison message experiment below</td></tr>
          <tr><td><code>maxlen</code></td><td>The queue hit its length limit with overflow set to drop the oldest</td><td>Not used here</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          The broker adds an <code>x-death</code> header recording each death: reason, queue and count. <code>ord_down</code>{' '}
          shows <code>expired … x1</code> rather than <code>x3</code> because each retry publishes a fresh copy with a new{' '}
          <code>retry-count</code> header, so the broker's history restarts each time. Your own header carries the real attempt count.
        </p>
        <p>
          <code>inspect-dead.ts</code> reads with <code>channel.get</code> and never acks. Closing the channel returns every
          unacked message to the queue, so the parking lot stays intact no matter how often you inspect it.
        </p>
      </div>
      <Box kind="try" label="Try this: a poison message">
        <ol>
          <li>In <C>payment-worker.ts</C>, change the last branch to <code>channel.nack(msg, false, true)</code>, which requeues instead of rejecting.</li>
          <li>
            Publish the payments again. <code>ord_declined</code> is now redelivered immediately, over and over. Log{' '}
            <code>{"msg.properties.headers?.['x-delivery-count']"}</code> to watch it climb.
          </li>
          <li>After the 6th delivery (1 + 5 redeliveries), the quorum queue gives up and dead-letters it. <code>inspect-dead.ts</code> shows <code>delivery_limit in payments x1</code>.</li>
          <li>Change the line back. Purge <D>payments.dead</D> from its page in the UI.</li>
        </ol>
        <p>
          This is why immediate requeue is dangerous: a message that always fails becomes a hot loop that burns CPU and blocks
          the queue. The delivery limit is the safety net; the delayed retry queue is the proper fix.
        </p>
      </Box>
      <Checkpoint question={<>Why does the worker publish a copy to <Q>payments.retry</Q> and ack the original, instead of nacking it?</>}>
        A nack with requeue retries immediately, with no delay, which gives the gateway no time to recover. A nack without
        requeue sends the message to the parking lot. Publishing a copy with a higher <code>retry-count</code> to a TTL queue
        gives a delayed retry and lets the worker count attempts.
      </Checkpoint>
    </>
  );
}

export function Rpc() {
  return (
    <>
      <div className="prose">
        <p>
          Checkout needs a shipping quote before the customer pays. The quote service sits behind a queue, so you can run
          several copies of it. The client sends a request with two properties:
        </p>
        <ul>
          <li><code>replyTo</code>: the queue the answer should go to, here the client's private exclusive queue.</li>
          <li><code>correlationId</code>: a unique id the server copies into the reply, so the client can match answers to questions.</li>
        </ul>
      </div>
      <Diagram spec={rpc} caption="Requests travel through a shared queue; replies come back on the client's own queue." />
      <CodeFile path="src/08-rpc/quote-server.ts" />
      <CodeFile path="src/08-rpc/quote-client.ts" />
      <div className="prose">
        <h3>Run it</h3>
        <p>First run the client alone to see the timeout, then start the server and run the client again.</p>
      </div>
      <Terminal title="Terminal 1, then Terminal 2">{`
npx tsx src/08-rpc/quote-client.ts
npx tsx src/08-rpc/quote-server.ts`}</Terminal>
      <Terminal title="Terminal 1 again">npx tsx src/08-rpc/quote-client.ts</Terminal>
      <Output
        panes={[
          { tag: 'client, no server running', text: '[!] No quote for us within 3000ms. Is quote-server running?' },
          {
            tag: 'client, server running',
            text: `[x] us    $ 10.00  2 days
[x] eu    $ 16.25  4 days
[x] apac  $ 22.50  6 days`,
          },
        ]}
      />
      <div className="prose">
        <ul>
          <li>
            <strong>Always time out.</strong> If no server is running, the request waits in the queue. The client gives up after
            3 seconds, and <code>expiration</code> makes the broker drop the stale request so no server wastes time on it later.
          </li>
          <li><strong>Requests run in parallel.</strong> Three quotes go out at once; the correlation ids sort out the replies.</li>
          <li>
            <strong>Direct reply-to.</strong> RabbitMQ also offers the pseudo-queue <code>amq.rabbitmq.reply-to</code>, which
            skips declaring a reply queue. Try it as an extension.
          </li>
        </ul>
      </div>
      <Box kind="key" label="When to use it">
        <p>
          RPC over a broker adds latency and couples the caller to an answer. Use it when you want load-balanced workers
          behind a request, such as quotes, pricing or image processing. For workflows like "order placed → pack → ship",
          publish events and let services react, as ShopFlow does.
        </p>
      </Box>
    </>
  );
}
