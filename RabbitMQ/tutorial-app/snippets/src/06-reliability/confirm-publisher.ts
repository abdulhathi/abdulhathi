import { connectWithConfirms, toBuffer } from '../lib/rabbit.js';
import { fakeOrder } from '../lib/order.js';

const EXCHANGE = 'order.events';
const { connection, channel } = await connectWithConfirms();

// With mandatory: true, the broker hands back any message that matched no queue.
channel.on('return', (msg) => {
  console.warn(`[!] Returned by broker: no queue bound for '${msg.fields.routingKey}'`);
});

await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
await channel.assertQueue('orders.audit', { durable: true });
await channel.bindQueue('orders.audit', EXCHANGE, 'order.#');

// 1. Routable: lands in orders.audit, then the broker confirms it.
const order = fakeOrder();
channel.publish(
  EXCHANGE,
  `order.created.${order.region}`,
  toBuffer(order),
  { persistent: true, mandatory: true, contentType: 'application/json' },
  (err) => console.log(err ? `[✗] Broker nacked ${order.id}` : `[✓] Broker confirmed ${order.id}`),
);

// 2. Unroutable: nothing is bound to invoice.*, so the broker returns it.
channel.publish(EXCHANGE, 'invoice.created.us', toBuffer({ invoice: 'inv_42' }), {
  persistent: true,
  mandatory: true,
});

await channel.waitForConfirms(); // resolves once the broker has answered every publish
console.log('[x] Every publish was answered by the broker');

await channel.close();
await connection.close();
