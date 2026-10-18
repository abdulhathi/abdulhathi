import express from 'express';
import { WebhookVerifier } from './receiver.ts';

const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }); // throws on invalid UTF-8; keeps a BOM, which JSON.parse refuses

type Options = { secrets: string[]; now?: () => number };

export function createApp({ secrets, now = Date.now }: Options) {
  const verifier = new WebhookVerifier(secrets, now);
  const received: Record<string, unknown>[] = []; // a real receiver puts events on a queue and answers at once
  const app = express();

  // No app.use(express.json()) in front of this route: it would parse the body, and the signed bytes would be gone.
  // express.raw() leaves req.body as a Buffer holding exactly what was sent. type: () => true reads it whatever the
  // Content-Type; type: '*/*' would skip a request that has no Content-Type and leave req.body undefined.
  app.post('/webhooks/orders', express.raw({ type: () => true }), (req, res) => {
    const body: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const rejection = verifier.verify(req.get('webhook-signature'), body);
    if (rejection) return res.status(rejection.status).json({ error: rejection.error });

    // Only now, with a genuine body, parse it. Bytes that are not UTF-8 are refused, as in Python and .NET.
    let event: unknown;
    try {
      event = JSON.parse(utf8.decode(body));
    } catch {
      event = null;
    }
    if (typeof event !== 'object' || event === null || Array.isArray(event))
      return res.status(400).json({ error: 'Body is not a JSON object.' });
    const order = event as Record<string, unknown>;
    received.push(order);
    res.json({ received: true, type: order.type ?? null });
  });

  return { app, received };
}
