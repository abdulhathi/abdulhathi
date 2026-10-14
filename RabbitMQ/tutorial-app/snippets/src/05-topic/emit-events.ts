import { connect, toBuffer } from '../lib/rabbit.js';
import { fakeOrder, pick } from '../lib/order.js';

const EXCHANGE = 'order.events';
const EVENTS = ['created', 'paid', 'shipped', 'cancelled'];
const count = Number(process.argv[2] ?? 8);

const { connection, channel } = await connect();
await channel.assertExchange(EXCHANGE, 'topic', { durable: true });

for (let i = 0; i < count; i++) {
  const order = fakeOrder();
  // Topic routing keys are dot-separated words: order.<event>.<region>
  const routingKey = `order.${pick(EVENTS)}.${order.region}`;
  channel.publish(EXCHANGE, routingKey, toBuffer(order), { contentType: 'application/json' });
  console.log(`[x] ${routingKey.padEnd(22)} ${order.id}`);
}

await channel.close();
await connection.close();
