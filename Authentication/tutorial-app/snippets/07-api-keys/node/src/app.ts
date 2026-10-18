import express from 'express';
import { apiKeyAuth } from './auth.ts';
import { DEFAULT_TTL_DAYS, KeyStore, SCOPES, type ApiKey } from './keys.ts';
import { FixedWindowLimiter } from './limiter.ts';

type Options = { now?: () => number; perMinute?: number };

const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const NO_SUCH_KEY = { error: 'No such key.' };
const REPORTS = [{ month: '2026-09', orders: 1520 }, { month: '2026-10', orders: 1710 }];

// The one response that ever contains the key.
const shown = (record: ApiKey, key: string) => ({
  id: record.id, key, name: record.name, scopes: record.scopes, expiresAt: iso(record.expiresAt),
  note: 'Copy this key now: it is shown only once.',
});

export function createApp({ now = Date.now, perMinute = 60 }: Options = {}) {
  const store = new KeyStore(now);
  const requireScope = apiKeyAuth(store, new FixedWindowLimiter(perMinute, 60_000, now));
  const app = express();
  app.use(express.json());

  // What a client application calls with its key.
  app.get('/reports', requireScope('reports:read'), (_req, res) => {
    const key = res.locals.apiKey as ApiKey;
    res.json({ client: key.name, reports: REPORTS });
  });

  // Everything under /keys is for admins: one middleware protects the whole group.
  const keys = express.Router();
  keys.use(requireScope('keys:manage'));

  keys.post('/', (req, res) => {
    const { name, scopes, expiresInDays = DEFAULT_TTL_DAYS } = req.body ?? {};
    if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 100)
      return res.status(400).json({ error: 'Give the key a name of 1 to 100 characters.' });
    if (!Array.isArray(scopes) || scopes.length === 0 || !scopes.every((s) => SCOPES.includes(s)))
      return res.status(400).json({ error: `Scopes must be a non-empty list from: ${SCOPES.join(', ')}.` });
    if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 365)
      return res.status(400).json({ error: 'expiresInDays must be a whole number from 1 to 365.' });
    const { record, key } = store.issue(name.trim(), [...new Set<string>(scopes)], expiresInDays);
    res.status(201).json(shown(record, key));
  });

  keys.post('/:id/revoke', (req, res) => {
    const record = store.revoke(req.params.id);
    if (!record) return res.status(404).json(NO_SUCH_KEY);
    res.json({ id: record.id, revoked: true });
  });

  // Rotation: a new key now, and the old one keeps working for 24 hours while the client switches over.
  keys.post('/:id/rotate', (req, res) => {
    const old = store.get(req.params.id);
    if (!old) return res.status(404).json(NO_SUCH_KEY);
    if (old.revokedAt !== null) return res.status(409).json({ error: 'That key is revoked. Create a new key instead.' });
    const { record, key } = store.rotate(old);
    res.status(201).json({ ...shown(record, key), oldKeyExpiresAt: iso(old.expiresAt) });
  });

  app.use('/keys', keys);

  return { app, store };
}
