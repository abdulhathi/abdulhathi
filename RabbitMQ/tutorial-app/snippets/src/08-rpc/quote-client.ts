import { randomUUID } from 'node:crypto';
import { connect, toBuffer } from '../lib/rabbit.js';
import type { Quote, QuoteRequest } from './quote-server.js';

const QUEUE = 'rpc.shipping-quotes';
const { connection, channel } = await connect();

// One private reply queue for this client. Replies are matched by correlation id.
const { queue: replyTo } = await channel.assertQueue('', { exclusive: true });
const pending = new Map<string, (quote: Quote) => void>();

await channel.consume(
  replyTo,
  (msg) => {
    if (!msg) return;
    const resolve = pending.get(msg.properties.correlationId);
    if (!resolve) return; // a late reply for a request we already gave up on
    pending.delete(msg.properties.correlationId);
    resolve(JSON.parse(msg.content.toString()) as Quote);
  },
  { noAck: true },
);

function requestQuote(request: QuoteRequest, timeoutMs = 3000): Promise<Quote> {
  const correlationId = randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(correlationId);
      reject(new Error(`No quote for ${request.region} within ${timeoutMs}ms. Is quote-server running?`));
    }, timeoutMs);
    pending.set(correlationId, (quote) => {
      clearTimeout(timer);
      resolve(quote);
    });
    channel.sendToQueue(QUEUE, toBuffer(request), {
      correlationId,
      replyTo,
      expiration: String(timeoutMs), // drop the request if no server picks it up in time
    });
  });
}

try {
  const quotes = await Promise.all(['us', 'eu', 'apac'].map((region) => requestQuote({ region, weightKg: 2.5 })));
  for (const q of quotes) console.log(`[x] ${q.region.padEnd(5)} $${q.price.toFixed(2).padStart(6)}  ${q.days} days`);
} catch (err) {
  console.error(`[!] ${(err as Error).message}`);
} finally {
  await connection.close();
}
