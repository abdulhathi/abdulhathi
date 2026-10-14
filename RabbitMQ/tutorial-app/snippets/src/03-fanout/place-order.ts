import { connect, toBuffer } from '../lib/rabbit.js';
import { fakeOrder } from '../lib/order.js';

const EXCHANGE = 'orders.placed';
const count = Number(process.argv[2] ?? 3);

const { connection, channel } = await connect();
await channel.assertExchange(EXCHANGE, 'fanout', { durable: true });

for (let i = 0; i < count; i++) {
  const order = fakeOrder();
  // A fanout exchange ignores the routing key, so we pass an empty string.
  channel.publish(EXCHANGE, '', toBuffer(order), { persistent: true, contentType: 'application/json' });
  console.log(`[x] Order placed ${order.id} by ${order.customer}`);
}

await channel.close();
await connection.close();
