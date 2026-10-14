import { connect } from '../lib/rabbit.js';

const QUEUE = 'hello';
const { connection, channel } = await connect();

// Declaring is idempotent: it creates the queue only if it does not exist yet.
await channel.assertQueue(QUEUE, { durable: false });

// sendToQueue publishes through the default exchange, using the queue name as routing key.
channel.sendToQueue(QUEUE, Buffer.from('Hello, RabbitMQ!'));
console.log("[x] Sent 'Hello, RabbitMQ!'");

await channel.close();
await connection.close();
