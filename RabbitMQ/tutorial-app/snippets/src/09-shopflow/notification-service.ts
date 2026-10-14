import { runService } from '../lib/service.js';
import type { Order } from '../lib/order.js';
import { declareTopology } from './topology.js';

// Remember what we already sent, so a redelivered event never emails twice.
// In production this lives in Redis or a database table with a unique key.
const sent = new Set<string>();

await runService('notifications', async (model) => {
  const channel = await model.createChannel();
  await declareTopology(channel);

  await channel.consume('shop.notifications', (msg) => {
    if (!msg) return;
    const order = JSON.parse(msg.content.toString()) as Order;
    const event = msg.fields.routingKey.split('.')[1]; // order.<event>.<region>
    const key = `${order.id}:${event}`;

    if (!sent.has(key)) {
      sent.add(key);
      console.log(`[email] To ${order.customer}: your order ${order.id} was ${event}`);
    }
    channel.ack(msg);
  });
});
