import * as amqp from 'amqplib';

// Every script connects the same way. Set RABBIT_URL to point at another broker.
export const RABBIT_URL = process.env.RABBIT_URL ?? 'amqp://shopflow:shopflow@localhost:5672';

export async function connect() {
  const connection = await amqp.connect(RABBIT_URL);
  const channel = await connection.createChannel();
  return { connection, channel };
}

// A confirm channel makes the broker acknowledge every publish (chapter 8).
export async function connectWithConfirms() {
  const connection = await amqp.connect(RABBIT_URL);
  const channel = await connection.createConfirmChannel();
  return { connection, channel };
}

// RabbitMQ only moves bytes. We agree on JSON for every message body.
export function toBuffer(value: unknown) {
  return Buffer.from(JSON.stringify(value));
}
