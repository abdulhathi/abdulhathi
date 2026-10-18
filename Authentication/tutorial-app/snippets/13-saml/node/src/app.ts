import express from 'express';
import { ExpiringIds } from './ids.ts';
import { authnRequest, metadata, newId, redirectUrl, type Settings } from './saml.ts';
import { CLOCK_SKEW_MS, SamlError, validateResponse } from './validate.ts';

export type User = { nameId: string; email: string; name: string; groups: string[] };
type Options = { settings: Settings; now?: () => number };

const REQUEST_LIFETIME_MS = 10 * 60 * 1000; // how long we wait for the IdP to answer an AuthnRequest

export function createApp({ settings, now = Date.now }: Options) {
  const pending = new ExpiringIds(now); // AuthnRequest IDs we sent and have not had an answer to
  const used = new ExpiringIds(now); // assertion IDs we already accepted: the replay cache
  const users = new Map<string, User>(); // keyed by IdP + NameID; a real app uses a database table
  const app = express();
  app.use(express.urlencoded({ extended: false }));

  app.get('/saml/metadata', (_req, res) => {
    res.type('application/samlmetadata+xml').send(metadata(settings));
  });

  // SP-initiated sign-in: remember the request's ID, then send the browser to the IdP with the request in the URL.
  app.get('/saml/login', (_req, res) => {
    const id = newId();
    pending.add(id, now() + REQUEST_LIFETIME_MS);
    res.redirect(302, redirectUrl(settings, authnRequest(settings, id, now())));
  });

  // The Assertion Consumer Service: the IdP's page makes the browser POST the signed response here.
  app.post('/saml/acs', (req, res) => {
    const samlResponse = req.body?.SAMLResponse;
    if (typeof samlResponse !== 'string' || samlResponse === '') return res.status(400).json({ error: 'Missing SAMLResponse.' });
    try {
      const login = validateResponse(samlResponse, settings, now());
      // One-time use: a stolen or replayed response is refused even while it is still within its time window.
      if (used.has(login.assertionId)) throw new SamlError(401, 'This assertion was already used.');
      // It must answer a request we sent (and only once). This also refuses IdP-initiated, unsolicited responses.
      if (!pending.take(login.inResponseTo)) throw new SamlError(401, 'InResponseTo does not match a pending request.');
      used.add(login.assertionId, login.notOnOrAfter + CLOCK_SKEW_MS);

      // Map the assertion to a local user. Key it by issuer + NameID, not by email: emails change and get reused.
      const user: User = {
        nameId: login.nameId,
        email: login.attributes.email?.[0] ?? login.nameId,
        name: login.attributes.name?.[0] ?? '',
        groups: login.attributes.groups ?? [],
      };
      users.set(`${settings.idpEntityId} ${login.nameId}`, user);
      // A real app now starts a session (chapter 05) and redirects; this one shows who signed in.
      res.json(user);
    } catch (err) {
      if (err instanceof SamlError) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  });

  return { app, users };
}
