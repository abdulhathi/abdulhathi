import type { Channel } from 'amqplib';

export type Payment = {
  orderId: string;
  amount: number;
  scenario: 'ok' | 'declined' | 'flaky' | 'gateway-down'; // lets you trigger each path on purpose
};

export const PAYMENTS = 'payments';
export const RETRY = 'payments.retry';
export const DEAD = 'payments.dead';
const DLX = 'payments.dlx';

export async function setupPayments(channel: Channel) {
  // Parking lot: messages we gave up on wait here for a human to look at.
  await channel.assertExchange(DLX, 'fanout', { durable: true });
  await channel.assertQueue(DEAD, { durable: true });
  await channel.bindQueue(DEAD, DLX, '');

  // Main queue. Rejected messages are dead-lettered to the parking lot.
  // x-delivery-limit guards against poison messages that crash consumers over and over.
  await channel.assertQueue(PAYMENTS, {
    durable: true,
    deadLetterExchange: DLX,
    arguments: { 'x-queue-type': 'quorum', 'x-delivery-limit': 5 },
  });

  // Wait room. Nobody consumes it: after 5 seconds each message expires and is
  // dead-lettered through the default exchange straight back into "payments".
  await channel.assertQueue(RETRY, {
    durable: true,
    messageTtl: 5000,
    deadLetterExchange: '',
    deadLetterRoutingKey: PAYMENTS,
    arguments: { 'x-queue-type': 'quorum' },
  });
}
