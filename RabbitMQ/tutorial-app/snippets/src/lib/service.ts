import * as amqp from 'amqplib';
import { RABBIT_URL } from './rabbit.js';

// Runs a long-lived service. amqplib 2 reconnects with backoff when the connection
// drops and calls setup after every (re)connect, so the service re-creates its
// channel, re-declares its queues and re-subscribes each time.
export async function runService(name: string, setup: (model: amqp.ChannelModel) => Promise<void>) {
  const connection = await amqp.connect(RABBIT_URL, {
    recovery: {
      initialDelay: 500,
      maxDelay: 10_000,
      async setup(model: amqp.ChannelModel) {
        await setup(model);
        console.log(`[${name}] Connected`);
      },
    },
  });

  connection.on('disconnect', (err) => console.warn(`[${name}] Connection lost: ${err.message}`));
  connection.on('reconnect-scheduled', ({ attempt, delay }) =>
    console.warn(`[${name}] Reconnect attempt ${attempt} in ${Math.round(delay)}ms`),
  );

  // Ctrl+C: close cleanly. Unacked messages go back to their queues for another consumer.
  process.once('SIGINT', async () => {
    console.log(`[${name}] Shutting down`);
    await connection.close();
    process.exit(0);
  });

  return connection;
}
