import { connect } from '../lib/rabbit.js';

const EXCHANGE = 'order.events';
const [name, ...patterns] = process.argv.slice(2);
if (!name || patterns.length === 0) {
  console.error('Usage: npx tsx src/05-topic/listener.ts <name> <pattern> [pattern...]');
  process.exit(1);
}

const queue = `events.${name}`;
const { channel } = await connect();

await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
await channel.assertQueue(queue, { durable: true });
for (const pattern of patterns) {
  // * matches exactly one word, # matches zero or more words
  await channel.bindQueue(queue, EXCHANGE, pattern);
}

console.log(`[${name}] Bound with ${patterns.join('  ')}`);
await channel.consume(queue, (msg) => {
  if (!msg) return;
  console.log(`[${name}] ${msg.fields.routingKey}`);
  channel.ack(msg);
});
