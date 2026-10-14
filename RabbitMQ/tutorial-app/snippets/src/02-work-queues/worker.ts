import { setTimeout as sleep } from 'node:timers/promises';
import { connect } from '../lib/rabbit.js';
import type { Order } from '../lib/order.js';

const QUEUE = 'orders.fulfilment';
const name = process.argv[2] ?? `worker-${process.pid}`;

const { channel } = await connect();
await channel.assertQueue(QUEUE, { durable: true });

// Fair dispatch: never give this worker more than one unacknowledged order.
await channel.prefetch(1);
console.log(`[${name}] Waiting for orders...`);

await channel.consume(
  QUEUE,
  async (msg) => {
    if (!msg) return;
    const order = JSON.parse(msg.content.toString()) as Order;
    const seconds = order.items.length; // one second per line item to pack

    console.log(`[${name}] Packing ${order.id} (${seconds}s)`);
    await sleep(seconds * 1000);

    channel.ack(msg); // only now does the broker delete the message
    console.log(`[${name}] Done ${order.id}`);
  },
  { noAck: false }, // manual acks: an unacked order is redelivered if this worker dies
);
