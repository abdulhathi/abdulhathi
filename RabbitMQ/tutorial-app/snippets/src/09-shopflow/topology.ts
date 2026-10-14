import type { Channel } from 'amqplib';

export const SHOP = 'shop';
const DLX = 'shop.dlx';

// Every exchange, queue and binding ShopFlow uses, declared in one place.
// Declarations are idempotent, so each service runs this at startup.
export async function declareTopology(channel: Channel) {
  await channel.assertExchange(SHOP, 'topic', { durable: true });

  await channel.assertExchange(DLX, 'fanout', { durable: true });
  await channel.assertQueue('shop.dead', { durable: true });
  await channel.bindQueue('shop.dead', DLX, '');

  await workQueue(channel, 'shop.fulfilment', ['order.created.*']);
  await workQueue(channel, 'shop.notifications', ['order.created.*', 'order.shipped.*']);
}

async function workQueue(channel: Channel, name: string, patterns: string[]) {
  await channel.assertQueue(name, {
    durable: true,
    deadLetterExchange: DLX,
    arguments: { 'x-queue-type': 'quorum', 'x-delivery-limit': 5 },
  });
  for (const pattern of patterns) await channel.bindQueue(name, SHOP, pattern);
}
