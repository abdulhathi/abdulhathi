import type { DiagramSpec } from '../geometry';
import { e, n } from './helpers';

export const webhookSignature: DiagramSpec = {
  width: 900, height: 320,
  title: 'The sender serializes the event once, computes HMAC-SHA256 with the shared secret over the timestamp, a dot and the body, and POSTs the body with a Webhook-Signature header holding t and v1. The secret itself never travels. Your receiver reads the raw body bytes, checks the timestamp is within 5 minutes (else 400), recomputes the HMAC with each active secret and compares in constant time (else 400), and looks up a digest of the timestamp and body in a cache of recent deliveries, kept until t plus 5 minutes (a repeat is a replay: 409). Only then does it parse the JSON and handle the event.',
  legend: { os: 'Sender (their server)', app: 'Your receiver', store: 'Replay cache' },
  nodes: [
    n('sender', 'os', 95, 60, 'webhook sender', { sub: 'SECRET NEVER SENT', shape: 'pill' }),
    n('sign', 'os', 375, 60, 'sign', { sub: 'HMAC-SHA256(SECRET, T.BODY)' }),
    n('raw', 'app', 700, 60, 'POST /webhooks/orders', { sub: 'READ THE RAW BYTES' }),
    n('time', 'app', 760, 180, 'check timestamp', { sub: 'WITHIN 5 MIN · ELSE 400' }),
    n('hmac', 'app', 520, 180, 'compare HMAC', { sub: 'EACH SECRET · CONSTANT TIME' }),
    n('replay', 'app', 290, 180, 'replay check', { sub: 'SEEN BEFORE · ELSE 409' }),
    n('handle', 'app', 90, 180, 'parse + handle', { sub: 'ONLY NOW PARSE JSON' }),
    n('cache', 'store', 290, 280, 'seen deliveries', { sub: 'KEPT UNTIL T + 5 MIN' }),
  ],
  edges: [
    e('sender', 'sign', { label: 'event JSON' }),
    e('sign', 'raw', { label: 'body + signature' }),
    e('raw', 'time', { sa: 'b', sb: 't' }),
    e('time', 'hmac'),
    e('hmac', 'replay'),
    e('replay', 'cache', { sa: 'b', sb: 't', label: 'remember digest' }),
    e('replay', 'handle'),
  ],
};
