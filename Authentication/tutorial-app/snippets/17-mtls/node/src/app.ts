import { createHash } from 'node:crypto';
import type { TLSSocket } from 'node:tls';
import express from 'express';

/** Registered clients: the certificate's subject common name, and what that client may do. */
export const KNOWN_CLIENTS = new Map([['billing-service', ['invoices:read']]]);

type Caller = { client: string; scopes: string[]; fingerprint: string };

export function createApp(clients: Map<string, string[]> = KNOWN_CLIENTS) {
  const app = express();

  // Who is calling was settled in the TLS handshake, before any HTTP arrived. Here we only map it to a client.
  app.use((req, res, next) => {
    const socket = req.socket as TLSSocket;
    // rejectUnauthorized already refused missing and untrusted certificates. Checking again costs nothing and
    // still protects the app if someone turns that option off.
    if (!socket.authorized) return res.status(401).json({ error: 'A valid client certificate is required.' });
    const cert = socket.getPeerCertificate();
    const cn = cert.subject?.CN;
    const name = typeof cn === 'string' ? cn : ''; // a certificate with several CNs is ambiguous: treat it as unknown
    const scopes = clients.get(name);
    // Signed by our CA but not registered: we know it is genuine, we just have not agreed to serve it.
    if (!scopes) return res.status(403).json({ error: 'Unknown client certificate.' });
    // The SHA-256 fingerprint of the certificate (its DER bytes) names this exact certificate; RFC 8705 binds tokens to it.
    res.locals.caller = { client: name, scopes, fingerprint: createHash('sha256').update(cert.raw).digest('hex') } satisfies Caller;
    next();
  });

  app.get('/whoami', (_req, res) => {
    res.json(res.locals.caller);
  });

  return app;
}
