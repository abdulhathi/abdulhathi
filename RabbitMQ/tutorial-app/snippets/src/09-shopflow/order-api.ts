import { createServer, type IncomingMessage } from 'node:http';
import type { ConfirmChannel } from 'amqplib';
import { runService } from '../lib/service.js';
import { toBuffer } from '../lib/rabbit.js';
import { fakeOrder, type Order } from '../lib/order.js';
import { declareTopology, SHOP } from './topology.js';

const PORT = Number(process.env.PORT ?? 8080);

// The current channel. It is replaced after every reconnect and cleared while we are offline.
let channel: ConfirmChannel | undefined;

const connection = await runService('api', async (model) => {
  const ch = await model.createConfirmChannel();
  await declareTopology(ch);
  channel = ch;
});
connection.on('disconnect', () => (channel = undefined));

// Resolve only once the broker has the order safely, so the API never loses one.
function publishConfirmed(routingKey: string, order: Order) {
  return new Promise<void>((resolve, reject) => {
    if (!channel) return reject(new Error('Not connected to RabbitMQ'));
    channel.publish(
      SHOP,
      routingKey,
      toBuffer(order),
      { persistent: true, contentType: 'application/json', messageId: order.id },
      (err) => (err ? reject(err) : resolve()),
    );
  });
}

async function readJson(req: IncomingMessage): Promise<Partial<Order>> {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/orders') {
    res.writeHead(404).end('Try POST /orders\n');
    return;
  }
  let input: Partial<Order>;
  try {
    input = await readJson(req);
  } catch {
    res.writeHead(400).end('Body must be JSON\n');
    return;
  }
  const order = fakeOrder(input);
  try {
    await publishConfirmed(`order.created.${order.region}`, order);
    console.log(`[api] Accepted ${order.id} (${order.region})`);
    res.writeHead(202, { 'content-type': 'application/json' }).end(JSON.stringify(order) + '\n');
  } catch (err) {
    console.warn(`[api] Rejected order: ${(err as Error).message}`);
    res.writeHead(503).end('Order not accepted, try again\n');
  }
}).listen(PORT, () => console.log(`[api] POST http://localhost:${PORT}/orders`));
