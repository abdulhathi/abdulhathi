import { connect } from '../lib/rabbit.js';
import type { Order } from '../lib/order.js';

const EXCHANGE = 'orders.placed';
const { channel } = await connect();
await channel.assertExchange(EXCHANGE, 'fanout', { durable: true });

// An empty name asks the broker for a unique queue. Exclusive means it is deleted
// when this connection closes: perfect for a live view that only cares about "now".
const { queue } = await channel.assertQueue('', { exclusive: true });
await channel.bindQueue(queue, EXCHANGE, '');

console.log(`[live] Watching orders through temporary queue ${queue}`);
await channel.consume(
  queue,
  (msg) => {
    if (!msg) return;
    const order = JSON.parse(msg.content.toString()) as Order;
    console.log(`[live] ${order.id}  ${order.region}  $${order.total}`);
  },
  { noAck: true },
);
