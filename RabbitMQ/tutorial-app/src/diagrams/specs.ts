import type { DiagramSpec, EdgeSpec, NodeKind, NodeSpec } from './geometry';

const n = (id: string, kind: NodeKind, x: number, y: number, label: string, sub?: string): NodeSpec => ({ id, kind, x, y, label, sub });
const e = (a: string, b: string, more: Omit<EdgeSpec, 'a' | 'b'> = {}): EdgeSpec => ({ a, b, ...more });

export const shopflow: DiagramSpec = {
  width: 1000, height: 400,
  title: 'ShopFlow architecture: the order API publishes to the shop topic exchange, which routes to fulfilment and notification queues; fulfilment publishes shipped events back; failed messages go to shop.dead.',
  nodes: [
    n('api', 'producer', 90, 120, 'order-api.ts', 'HTTP → PRODUCER'),
    n('shop', 'exchange', 345, 120, 'shop', 'TOPIC EXCHANGE'),
    n('fq', 'queue', 640, 120, 'shop.fulfilment', 'QUORUM QUEUE'),
    n('nq', 'queue', 640, 250, 'shop.notifications', 'QUORUM QUEUE'),
    n('ful', 'consumer', 900, 120, 'fulfilment-service', 'CONSUMER + PRODUCER'),
    n('not', 'consumer', 900, 250, 'notification-service'),
    n('dlx', 'exchange', 640, 350, 'shop.dlx', 'FANOUT EXCHANGE'),
    n('dead', 'dead', 900, 350, 'shop.dead'),
  ],
  edges: [
    e('api', 'shop', { label: 'order.created.eu' }),
    e('shop', 'fq', { label: 'order.created.*' }),
    e('shop', 'nq', { label: 'order.created.*', oa: 4, ob: -14, lpos: [488, 229] }),
    e('shop', 'nq', { label: 'order.shipped.*', oa: 22, ob: 14, lpos: [488, 259] }),
    e('fq', 'ful'),
    e('nq', 'not'),
    e('ful', 'shop', { label: 'order.shipped.eu', sa: 't', sb: 't', pts: [[900, 40], [345, 40]] }),
    e('nq', 'dlx', { kind: 'dead', label: 'dead letters', sa: 'b', sb: 't' }),
    e('dlx', 'dead', { kind: 'dead' }),
  ],
};

export const concepts: DiagramSpec = {
  width: 940, height: 230,
  title: 'A producer publishes to an exchange, bindings route copies to queues, consumers receive from queues and acknowledge.',
  nodes: [
    n('p', 'producer', 90, 115, 'producer'),
    n('x', 'exchange', 340, 115, 'exchange', 'ROUTES BY TYPE + KEY'),
    n('q1', 'queue', 600, 55, 'queue A'),
    n('q2', 'queue', 600, 175, 'queue B'),
    n('c1', 'consumer', 850, 55, 'consumer'),
    n('c2', 'consumer', 850, 175, 'consumer'),
  ],
  edges: [
    e('p', 'x', { label: 'publish + key' }),
    e('x', 'q1', { label: 'binding' }),
    e('x', 'q2', { label: 'binding' }),
    e('q1', 'c1', { label: 'deliver · ack' }),
    e('q2', 'c2', { label: 'deliver · ack' }),
  ],
};

export const hello: DiagramSpec = {
  width: 860, height: 110,
  title: 'send.ts publishes through the default exchange into the hello queue; receive.ts consumes it.',
  nodes: [
    n('p', 'producer', 85, 55, 'send.ts'),
    n('x', 'exchange', 300, 55, '(default)', 'DEFAULT EXCHANGE'),
    n('q', 'queue', 530, 55, 'hello'),
    n('c', 'consumer', 765, 55, 'receive.ts'),
  ],
  edges: [e('p', 'x', { label: 'key: hello' }), e('x', 'q'), e('q', 'c', { label: 'noAck' })],
};

export const work: DiagramSpec = {
  width: 760, height: 200,
  title: 'new-order.ts fills the orders.fulfilment queue; two workers compete for orders, one at a time.',
  nodes: [
    n('p', 'producer', 95, 100, 'new-order.ts'),
    n('q', 'queue', 360, 100, 'orders.fulfilment', 'DURABLE QUEUE'),
    n('c1', 'consumer', 640, 45, 'worker alice'),
    n('c2', 'consumer', 640, 155, 'worker bob'),
  ],
  edges: [
    e('p', 'q', { label: 'persistent' }),
    e('q', 'c1', { label: 'prefetch 1' }),
    e('q', 'c2', { label: 'prefetch 1' }),
  ],
};

export const fanout: DiagramSpec = {
  width: 960, height: 270,
  title: 'place-order.ts publishes to the orders.placed fanout exchange, which copies every order to the email, analytics and live-feed queues.',
  nodes: [
    n('p', 'producer', 95, 135, 'place-order.ts'),
    n('x', 'exchange', 320, 135, 'orders.placed', 'FANOUT EXCHANGE'),
    n('q1', 'queue', 590, 50, 'orders.placed.email', 'DURABLE QUEUE'),
    n('q2', 'queue', 590, 135, 'orders.placed.analytics', 'DURABLE QUEUE'),
    n('q3', 'queue', 590, 220, 'amq.gen-N7Kd…', 'EXCLUSIVE QUEUE'),
    n('c1', 'consumer', 860, 50, 'subscriber email'),
    n('c2', 'consumer', 860, 135, 'subscriber analytics'),
    n('c3', 'consumer', 860, 220, 'live-feed.ts'),
  ],
  edges: [
    e('p', 'x', { label: 'key ignored' }),
    e('x', 'q1'), e('x', 'q2'), e('x', 'q3'),
    e('q1', 'c1'), e('q2', 'c2'), e('q3', 'c3'),
  ],
};

export const direct: DiagramSpec = {
  width: 960, height: 220,
  title: 'route-orders.ts publishes with the region as routing key; the direct exchange sends us orders to warehouse.us and eu and apac orders to warehouse.eu-apac.',
  nodes: [
    n('p', 'producer', 95, 110, 'route-orders.ts'),
    n('x', 'exchange', 320, 110, 'orders.by-region', 'DIRECT EXCHANGE'),
    n('q1', 'queue', 600, 45, 'warehouse.us'),
    n('q2', 'queue', 600, 170, 'warehouse.eu-apac'),
    n('c1', 'consumer', 865, 45, 'warehouse.ts us'),
    n('c2', 'consumer', 865, 170, 'warehouse.ts eu apac'),
  ],
  edges: [
    e('p', 'x', { label: 'key = region' }),
    e('x', 'q1', { label: 'us' }),
    e('x', 'q2', { label: 'eu', ob: -14 }),
    e('x', 'q2', { label: 'apac', oa: 24, ob: 14 }),
    e('q1', 'c1'), e('q2', 'c2'),
  ],
};

export const topic: DiagramSpec = {
  width: 1000, height: 270,
  title: 'emit-events.ts publishes order.event.region keys to the order.events topic exchange; three listener queues bind with wildcard patterns.',
  nodes: [
    n('p', 'producer', 95, 135, 'emit-events.ts'),
    n('x', 'exchange', 320, 135, 'order.events', 'TOPIC EXCHANGE'),
    n('q1', 'queue', 650, 50, 'events.audit'),
    n('q2', 'queue', 650, 135, 'events.eu-support'),
    n('q3', 'queue', 650, 220, 'events.cancellations'),
    n('c1', 'consumer', 900, 50, 'listener audit'),
    n('c2', 'consumer', 900, 135, 'listener eu-support'),
    n('c3', 'consumer', 900, 220, 'listener cancellations'),
  ],
  edges: [
    e('p', 'x', { label: 'order.paid.us' }),
    e('x', 'q1', { label: 'order.#' }),
    e('x', 'q2', { label: 'order.*.eu' }),
    e('x', 'q3', { label: 'order.cancelled.*' }),
    e('q1', 'c1'), e('q2', 'c2'), e('q3', 'c3'),
  ],
};

export const deadLetters: DiagramSpec = {
  width: 820, height: 360,
  title: 'Payments flow: the worker sends transient failures to payments.retry, which expires them back into payments after 5 seconds; permanent failures and messages over the delivery limit are dead-lettered through payments.dlx into payments.dead.',
  nodes: [
    n('p', 'producer', 100, 70, 'publish-payments.ts'),
    n('q', 'queue', 380, 70, 'payments', 'QUORUM · LIMIT 5'),
    n('c', 'consumer', 660, 70, 'payment-worker.ts'),
    n('r', 'queue', 660, 200, 'payments.retry', 'TTL 5s · NO CONSUMER'),
    n('x', 'exchange', 380, 310, 'payments.dlx', 'FANOUT EXCHANGE'),
    n('d', 'dead', 660, 310, 'payments.dead'),
  ],
  edges: [
    e('p', 'q'),
    e('q', 'c'),
    e('c', 'r', { kind: 'retry', label: 'timeout: copy + ack', sa: 'b', sb: 't' }),
    e('r', 'q', { kind: 'retry', label: 'expires after 5s', sa: 'l', sb: 'b', ob: 40, pts: [[420, 200]] }),
    e('q', 'x', { kind: 'dead', label: 'nack · delivery limit', sa: 'b', sb: 't', oa: -50, ob: -50 }),
    e('x', 'd', { kind: 'dead', label: 'x-death added' }),
  ],
};

export const rpc: DiagramSpec = {
  width: 920, height: 250,
  title: "quote-client.ts sends requests with replyTo and correlationId to rpc.shipping-quotes; quote-server.ts replies to the client's exclusive reply queue.",
  nodes: [
    n('cl', 'producer', 110, 125, 'quote-client.ts', 'CLIENT'),
    n('q', 'queue', 460, 50, 'rpc.shipping-quotes'),
    n('s', 'consumer', 800, 125, 'quote-server.ts', 'SERVER'),
    n('rq', 'queue', 460, 200, 'amq.gen-…', 'EXCLUSIVE REPLY QUEUE'),
  ],
  edges: [
    e('cl', 'q', { label: 'replyTo + correlationId' }),
    e('q', 's'),
    e('s', 'rq', { kind: 'reply', label: 'same correlationId' }),
    e('rq', 'cl', { kind: 'reply' }),
  ],
};
