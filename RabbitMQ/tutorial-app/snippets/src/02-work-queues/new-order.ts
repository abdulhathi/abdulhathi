import { connect, toBuffer } from '../lib/rabbit.js';
import { fakeOrder } from '../lib/order.js';

const QUEUE = 'orders.fulfilment';
const count = Number(process.argv[2] ?? 6);

const { connection, channel } = await connect();
await channel.assertQueue(QUEUE, { durable: true }); // the queue survives a broker restart

for (let i = 0; i < count; i++) {
  const order = fakeOrder();
  channel.sendToQueue(QUEUE, toBuffer(order), {
    persistent: true, // the message is written to disk, not only kept in memory
    contentType: 'application/json',
    messageId: order.id,
  });
  console.log(`[x] Queued ${order.id} (${order.items.length} line items)`);
}

await channel.close();
await connection.close();
