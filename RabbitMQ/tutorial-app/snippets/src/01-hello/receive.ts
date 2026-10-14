import { connect } from '../lib/rabbit.js';

const QUEUE = 'hello';
const { channel } = await connect();

// Declare here too, so it works no matter which side starts first.
await channel.assertQueue(QUEUE, { durable: false });
console.log(`[*] Waiting for messages in '${QUEUE}'. Press Ctrl+C to exit.`);

await channel.consume(
  QUEUE,
  (msg) => {
    if (!msg) return; // null means the broker cancelled this consumer
    console.log(`[x] Received '${msg.content.toString()}'`);
  },
  { noAck: true }, // auto-ack: the broker forgets the message as soon as it is sent
);
