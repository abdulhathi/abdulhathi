import express from 'express';
import { generateKeyPair, type GenerateKeyPairResult } from 'jose';
import { authorizationServer } from './authorization-server.ts';
import { requireScope } from './resource-server.ts';

type Options = { issuer?: string; now?: () => number; keys?: GenerateKeyPairResult };

// Two roles in one process so the lab runs with one command: the authorization server (/authorize, /token) and the
// resource server (/api/...). In production they are separate services that share only the token format and key.
export async function createApp({ issuer = 'http://localhost:3000', now = Date.now, keys }: Options = {}) {
  // The authorization server's signing key, made at start-up (the tests may pass their own). A real one lives in a key
  // vault and is rotated.
  const { privateKey, publicKey } = keys ?? (await generateKeyPair('RS256'));
  const revoked = new Set<string>(); // jti values of revoked access tokens
  const app = express();
  app.use(authorizationServer({ issuer, signingKey: privateKey, now, revoked }));

  const rs = { issuer, verifyKey: publicKey, now, revoked };
  app.get('/api/photos', requireScope('photos.read', rs), (_req, res) => {
    res.json({ owner: res.locals.token.sub, photos: ['beach.jpg', 'hills.jpg'] });
  });
  app.get('/api/reports', requireScope('reports.read', rs), (_req, res) => {
    res.json({ client: res.locals.token.client_id, reports: ['daily-sales.csv'] });
  });
  return { app };
}
