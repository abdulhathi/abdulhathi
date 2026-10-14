import { connect } from '../lib/rabbit.js';
import type { Order } from '../lib/order.js';

const EXCHANGE = 'orders.placed';
const service = process.argv[2];
if (!service) {
  console.error('Usage: npx tsx src/03-fanout/subscriber.ts <service-name>');
  process.exit(1);
}

// Each service owns a named, durable queue, so it never misses an order while it is down.
const queue = `orders.placed.${service}`;
const { channel } = await connect();

await channel.assertExchange(EXCHANGE, 'fanout', { durable: true });
await channel.assertQueue(queue, { durable: true });
await channel.bindQueue(queue, EXCHANGE, ''); // the binding connects exchange to queue

console.log(`[${service}] Listening on ${queue}`);
await channel.consume(queue, (msg) => {
  if (!msg) return;
  const order = JSON.parse(msg.content.toString()) as Order;
  console.log(`[${service}] Got ${order.id} ($${order.total})`);
  channel.ack(msg);
});
