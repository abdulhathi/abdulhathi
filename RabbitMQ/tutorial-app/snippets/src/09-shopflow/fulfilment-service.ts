import { setTimeout as sleep } from 'node:timers/promises';
import { runService } from '../lib/service.js';
import { toBuffer } from '../lib/rabbit.js';
import type { Order } from '../lib/order.js';
import { declareTopology, SHOP } from './topology.js';

await runService('fulfilment', async (model) => {
  const channel = await model.createChannel();
  await declareTopology(channel);
  await channel.prefetch(5);

  await channel.consume('shop.fulfilment', async (msg) => {
    if (!msg) return;
    const order = JSON.parse(msg.content.toString()) as Order;
    console.log(`[fulfilment] Packing ${order.id} for ${order.region}`);
    await sleep(1000 * order.items.length);

    // Announce the next step, then ack. If we crash in between, the order is
    // redelivered and "shipped" is published twice, so consumers must be idempotent.
    channel.publish(SHOP, `order.shipped.${order.region}`, toBuffer(order), {
      persistent: true,
      contentType: 'application/json',
      messageId: order.id,
    });
    channel.ack(msg);
    console.log(`[fulfilment] Shipped ${order.id}`);
  });
});
