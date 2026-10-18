import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import express from 'express';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { Challenges, Store, type User } from './store.ts';

type Options = { rpId?: string; rpName?: string; origin?: string; now?: () => number };

// EdDSA, ES256 and RS256 as COSE algorithm numbers: between them, every authenticator in use today.
const ALGORITHMS = [-8, -7, -257];
const TIMEOUT_MS = 5 * 60 * 1000;
const EXPIRED = { error: 'Unknown or expired challenge.' };
const FAILED = { error: 'Passkey sign-in failed.' };

/** The challenge the browser wrote into clientDataJSON: it tells us which ceremony this response answers. */
function challengeOf(clientDataJSON: unknown): string {
  try {
    return String(JSON.parse(Buffer.from(String(clientDataJSON), 'base64url').toString('utf8')).challenge ?? '');
  } catch {
    return '';
  }
}

export function createApp({ rpId = 'localhost', rpName = 'Auth Lab', origin = 'http://localhost:3000', now = Date.now }: Options = {}) {
  const store = new Store();
  const challenges = new Challenges(now);
  const app = express();
  app.use(express.json());
  app.use(express.static(fileURLToPath(new URL('../public', import.meta.url)))); // the demo page at /

  // Ceremony 1, registration: create a new account with a passkey.
  app.post('/webauthn/register/options', async (req, res) => {
    const username = String(req.body?.username ?? '').trim().toLowerCase();
    if (!username) return res.status(400).json({ error: 'Enter a username.' });
    if (store.findUserByName(username)) return res.status(409).json({ error: 'That username is already registered.' });
    const user: User = { id: randomBytes(16).toString('base64url'), username }; // saved only once registration succeeds
    const options = await generateRegistrationOptions({
      rpName,
      rpID: rpId,
      userName: username,
      userDisplayName: username,
      userID: Buffer.from(user.id, 'base64url'),
      timeout: TIMEOUT_MS,
      attestationType: 'none',
      // A passkey: a discoverable credential (stored on the authenticator) unlocked by biometrics or a PIN.
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      supportedAlgorithmIDs: ALGORITHMS,
    });
    challenges.remember(options.challenge, 'registration', user);
    res.json(options);
  });

  app.post('/webauthn/register/verify', async (req, res) => {
    const body = req.body as RegistrationResponseJSON;
    const challenge = challengeOf(body?.response?.clientDataJSON);
    const user = challenges.take(challenge, 'registration')?.user;
    if (!user) return res.status(400).json(EXPIRED);
    try {
      // Checks the type, challenge, origin, RP ID hash, user presence and verification flags, and the key algorithm.
      const { verified, registrationInfo: info } = await verifyRegistrationResponse({
        response: body,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpId,
        requireUserVerification: true,
        supportedAlgorithmIDs: ALGORITHMS,
      });
      if (!verified || store.credentials.has(info.credential.id)) throw new Error('not verified');
      if (store.findUserByName(user.username)) return res.status(409).json({ error: 'That username is already registered.' });
      store.users.set(user.id, user);
      store.credentials.set(info.credential.id, {
        id: info.credential.id,
        userId: user.id,
        publicKey: info.credential.publicKey,
        counter: info.credential.counter,
        transports: info.credential.transports ?? [],
        deviceType: info.credentialDeviceType,
        backedUp: info.credentialBackedUp,
      });
      res.status(201).json({ username: user.username, credentialId: info.credential.id, deviceType: info.credentialDeviceType, backedUp: info.credentialBackedUp });
    } catch {
      res.status(400).json({ error: 'Registration failed.' });
    }
  });

  // Ceremony 2, authentication: no username needed; the browser offers the passkeys it holds for this RP ID.
  app.post('/webauthn/login/options', async (_req, res) => {
    const options = await generateAuthenticationOptions({ rpID: rpId, userVerification: 'required', timeout: TIMEOUT_MS });
    challenges.remember(options.challenge, 'authentication');
    res.json(options);
  });

  app.post('/webauthn/login/verify', async (req, res) => {
    const body = req.body as AuthenticationResponseJSON;
    const challenge = challengeOf(body?.response?.clientDataJSON);
    if (!challenges.take(challenge, 'authentication')) return res.status(400).json(EXPIRED);
    const credential = store.credentials.get(String(body.id));
    // The user handle is the user ID the passkey was made for: it must be the account that owns this credential.
    if (!credential || body.response.userHandle !== credential.userId) return res.status(401).json(FAILED);
    try {
      // Checks the type, challenge, origin, RP ID hash and flags, then the signature over
      // authenticatorData || SHA-256(clientDataJSON) with the stored public key, and the signature counter
      // (it must go up, unless the stored and the new count are both 0, as synced passkeys report).
      const { verified, authenticationInfo } = await verifyAuthenticationResponse({
        response: body,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpId,
        credential: { id: credential.id, publicKey: credential.publicKey as Uint8Array<ArrayBuffer>, counter: credential.counter, transports: credential.transports as never },
        requireUserVerification: true,
      });
      if (!verified) return res.status(401).json(FAILED);
      // Backup eligibility (the BE flag) is fixed when a credential is made (WebAuthn Level 3, section 7.2): a
      // device-bound passkey that now claims to be synced, or the reverse, is not the credential we registered.
      if (authenticationInfo.credentialDeviceType !== credential.deviceType) return res.status(401).json(FAILED);
      credential.counter = authenticationInfo.newCounter;
      credential.backedUp = authenticationInfo.credentialBackedUp;
    } catch {
      return res.status(401).json(FAILED);
    }
    // A real app starts a session here (chapter 05) or issues tokens (chapter 08).
    res.json({ username: store.users.get(credential.userId)!.username, message: 'Signed in.' });
  });

  return { app, store };
}
