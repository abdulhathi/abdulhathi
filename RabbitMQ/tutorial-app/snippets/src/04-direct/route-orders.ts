import { connect, toBuffer } from '../lib/rabbit.js';
import { fakeOrder } from '../lib/order.js';

const EXCHANGE = 'orders.by-region';
const count = Number(process.argv[2] ?? 6);

const { connection, channel } = await connect();
await channel.assertExchange(EXCHANGE, 'direct', { durable: true });

for (let i = 0; i < count; i++) {
  const order = fakeOrder();
  // The routing key is the region. A direct exchange matches it exactly against bindings.
  channel.publish(EXCHANGE, order.region, toBuffer(order), { persistent: true, contentType: 'application/json' });
  console.log(`[x] ${order.id} -> ${order.region}`);
}

await channel.close();
await connection.close();
