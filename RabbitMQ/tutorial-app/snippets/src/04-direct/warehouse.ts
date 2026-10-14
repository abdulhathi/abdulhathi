import { connect } from '../lib/rabbit.js';
import type { Order } from '../lib/order.js';

const EXCHANGE = 'orders.by-region';
const regions = process.argv.slice(2);
if (regions.length === 0) {
  console.error('Usage: npx tsx src/04-direct/warehouse.ts <region> [region...]');
  process.exit(1);
}

const queue = `warehouse.${regions.join('-')}`;
const { channel } = await connect();

await channel.assertExchange(EXCHANGE, 'direct', { durable: true });
await channel.assertQueue(queue, { durable: true });
for (const region of regions) {
  await channel.bindQueue(queue, EXCHANGE, region); // one binding per routing key
}

console.log(`[${queue}] Shipping orders for: ${regions.join(', ')}`);
await channel.consume(queue, (msg) => {
  if (!msg) return;
  const order = JSON.parse(msg.content.toString()) as Order;
  console.log(`[${queue}] ${order.id} (${msg.fields.routingKey})`);
  channel.ack(msg);
});
