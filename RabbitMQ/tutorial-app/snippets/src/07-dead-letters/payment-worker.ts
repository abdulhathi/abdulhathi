import { setTimeout as sleep } from 'node:timers/promises';
import { connect } from '../lib/rabbit.js';
import { PAYMENTS, RETRY, setupPayments, type Payment } from './topology.js';

const MAX_RETRIES = 3;

class CardDeclined extends Error {} // permanent: retrying will never help
class GatewayTimeout extends Error {} // transient: worth another try later

// Pretend payment gateway. "flaky" succeeds on the third attempt.
async function charge(payment: Payment, attempt: number) {
  await sleep(300);
  if (payment.scenario === 'declined') throw new CardDeclined('card declined');
  if (payment.scenario === 'gateway-down') throw new GatewayTimeout('gateway timeout');
  if (payment.scenario === 'flaky' && attempt < 2) throw new GatewayTimeout('gateway timeout');
}

const { channel } = await connect();
await setupPayments(channel);
await channel.prefetch(1);
console.log('[payments] Waiting for payments...');

await channel.consume(PAYMENTS, async (msg) => {
  if (!msg) return;
  const payment = JSON.parse(msg.content.toString()) as Payment;
  const retries = Number(msg.properties.headers?.['retry-count'] ?? 0);

  try {
    await charge(payment, retries);
    console.log(`[✓] ${payment.orderId} charged $${payment.amount}`);
    channel.ack(msg);
  } catch (err) {
    if (err instanceof GatewayTimeout && retries < MAX_RETRIES) {
      console.log(`[~] ${payment.orderId} ${err.message}, retry ${retries + 1}/${MAX_RETRIES} in 5s`);
      // Park a copy in the wait room with a higher count, then ack the original.
      channel.sendToQueue(RETRY, msg.content, {
        persistent: true,
        contentType: 'application/json',
        headers: { 'retry-count': retries + 1 },
      });
      channel.ack(msg);
    } else {
      console.log(`[✗] ${payment.orderId} ${(err as Error).message}, giving up: dead-lettered`);
      channel.nack(msg, false, false); // reject without requeue: the queue dead-letters it
    }
  }
});
