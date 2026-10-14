import { connect } from '../lib/rabbit.js';
import { DEAD, setupPayments, type Payment } from './topology.js';

const { connection, channel } = await connect();
await setupPayments(channel);

// channel.get pulls one message at a time (handy for tools; use consume in services).
let count = 0;
for (let msg = await channel.get(DEAD); msg; msg = await channel.get(DEAD)) {
  const payment = JSON.parse(msg.content.toString()) as Payment;
  // The broker records every time this message died: why, in which queue, how often.
  const deaths: { reason: string; queue: string; count: number }[] = msg.properties.headers?.['x-death'] ?? [];
  const history = deaths.map((d) => `${d.reason} in ${d.queue} x${d.count}`).join(', ');
  console.log(`${payment.orderId.padEnd(14)} ${history}`);
  count++;
}
console.log(`[x] ${count} message(s) in ${DEAD}`);

// We never acked them, so closing the channel puts them all back in the queue.
await channel.close();
await connection.close();
