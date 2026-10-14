import { connect, toBuffer } from '../lib/rabbit.js';
import { PAYMENTS, setupPayments, type Payment } from './topology.js';

const { connection, channel } = await connect();
await setupPayments(channel);

const payments: Payment[] = [
  { orderId: 'ord_ok', amount: 49.0, scenario: 'ok' },
  { orderId: 'ord_declined', amount: 120.0, scenario: 'declined' },
  { orderId: 'ord_flaky', amount: 75.5, scenario: 'flaky' },
  { orderId: 'ord_down', amount: 18.25, scenario: 'gateway-down' },
];

for (const payment of payments) {
  channel.sendToQueue(PAYMENTS, toBuffer(payment), { persistent: true, contentType: 'application/json' });
  console.log(`[x] Payment for ${payment.orderId} (${payment.scenario})`);
}

await channel.close();
await connection.close();
