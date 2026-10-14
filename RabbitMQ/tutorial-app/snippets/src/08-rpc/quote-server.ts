import { connect, toBuffer } from '../lib/rabbit.js';

export type QuoteRequest = { region: string; weightKg: number };
export type Quote = QuoteRequest & { price: number; days: number };

const QUEUE = 'rpc.shipping-quotes';
const RATES: Record<string, { perKg: number; days: number }> = {
  us: { perKg: 4.0, days: 2 },
  eu: { perKg: 6.5, days: 4 },
  apac: { perKg: 9.0, days: 6 },
};

const { channel } = await connect();
await channel.assertQueue(QUEUE, { durable: false });
await channel.prefetch(10);
console.log('[quotes] Ready for quote requests');

await channel.consume(QUEUE, (msg) => {
  if (!msg) return;
  const request = JSON.parse(msg.content.toString()) as QuoteRequest;
  const rate = RATES[request.region] ?? { perKg: 12, days: 10 };
  const quote: Quote = { ...request, price: Number((rate.perKg * request.weightKg).toFixed(2)), days: rate.days };

  // Reply to the queue the client named, echoing its correlation id.
  channel.sendToQueue(msg.properties.replyTo, toBuffer(quote), {
    correlationId: msg.properties.correlationId,
    contentType: 'application/json',
  });
  channel.ack(msg);
  console.log(`[quotes] ${request.region} ${request.weightKg}kg -> $${quote.price}`);
});
