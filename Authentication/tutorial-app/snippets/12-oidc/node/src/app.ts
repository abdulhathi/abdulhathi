// The relying party: a web app that signs users in with OpenID Connect, using openid-client.
import { randomBytes } from 'node:crypto';
import express, { type Request } from 'express';
import session from 'express-session';
import * as oidc from 'openid-client';
import { createMockIdp } from './mock-idp.ts';

// What the session holds: the sign-in in progress, then the signed-in user.
declare module 'express-session' {
  interface SessionData {
    pending?: { state: string; nonce: string; verifier: string };
    user?: { sub: string; name: string; email: string };
    idToken?: string;
    logoutState?: string;
  }
}

const CLIENT_ID = 'web-app';
// A test secret. Read a real one from configuration or a vault; never commit it.
const CLIENT_SECRET = process.env.CLIENT_SECRET ?? 'web-app-secret';

/** openid-client wraps the detail in err.cause: keep the whole chain for the log. */
const reason = (err: unknown): string =>
  err instanceof Error ? [err.message, err.cause instanceof Error ? reason(err.cause) : ''].filter(Boolean).join(': ') : String(err);

const regenerate = (req: Request) => new Promise<void>((ok, fail) => req.session.regenerate((err) => (err ? fail(err) : ok())));

export async function createApp({ baseUrl = 'http://localhost:3000' } = {}) {
  const issuer = `${baseUrl}/idp`; // a real app reads the provider's issuer URL from configuration
  // The lab's own identity provider, served by this same app under /idp. In production it is Entra ID, Google, ...
  // The hash is SHA-256 of "web-app-secret".
  const idp = await createMockIdp({
    issuer,
    clients: [{
      id: CLIENT_ID,
      secretHash: '99b55be79983e9546380ca7d7f1506aef263143451a1e15751f87e103d044371',
      redirectUris: [`${baseUrl}/callback`],
      postLogoutRedirectUris: [`${baseUrl}/logged-out`],
    }],
  });
  const signInErrors: string[] = []; // why sign-ins failed: what you would send to your logs

  // Discovery, once: reads {issuer}/.well-known/openid-configuration and checks its issuer matches.
  // allowInsecureRequests: only because the local mock is plain HTTP. enableNonRepudiationChecks: verify the ID
  // token's signature against the JWKS too (openid-client otherwise relies on TLS to the token endpoint).
  const insecure = new URL(issuer).protocol === 'http:';
  let config: Promise<oidc.Configuration> | undefined;
  const discover = () =>
    (config ??= oidc.discovery(new URL(issuer), CLIENT_ID, CLIENT_SECRET, undefined, {
      execute: insecure ? [oidc.allowInsecureRequests, oidc.enableNonRepudiationChecks] : [oidc.enableNonRepudiationChecks],
    }));

  const app = express();
  app.use('/idp', idp.router);
  app.use(session({
    name: 'sid',
    secret: randomBytes(32).toString('hex'), // signs the session id cookie; use a fixed secret from a vault in production
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: !insecure }, // Lax: sent on the redirect back from the provider
  }));

  app.get('/', (req, res) => {
    res.json(req.session.user ? { signedIn: true, name: req.session.user.name } : { signedIn: false });
  });

  // Sends the browser to the provider with a fresh state, nonce and PKCE challenge, remembered in the session.
  app.get('/login', async (req, res) => {
    const pending = { state: oidc.randomState(), nonce: oidc.randomNonce(), verifier: oidc.randomPKCECodeVerifier() };
    req.session.pending = pending;
    const url = oidc.buildAuthorizationUrl(await discover(), {
      redirect_uri: `${baseUrl}/callback`,
      scope: 'openid profile email',
      state: pending.state,
      nonce: pending.nonce,
      code_challenge: await oidc.calculatePKCECodeChallenge(pending.verifier),
      code_challenge_method: 'S256',
    });
    res.redirect(302, url.href);
  });

  app.get('/callback', async (req, res) => {
    const pending = req.session.pending;
    delete req.session.pending; // one use, whatever happens next
    try {
      if (!pending) throw new Error('No sign-in was started in this browser.');
      const config = await discover();
      // Checks state (and iss, if the provider says it sends one), swaps the code (with the PKCE verifier) for tokens,
      // then validates the ID token: signature by kid from the JWKS (because of enableNonRepudiationChecks), iss, aud
      // (and azp when there are several audiences), exp, that iat is present, and that nonce matches ours.
      const tokens = await oidc.authorizationCodeGrant(config, new URL(req.originalUrl, baseUrl), {
        pkceCodeVerifier: pending.verifier,
        expectedState: pending.state,
        expectedNonce: pending.nonce,
        idTokenExpected: true,
      });
      const claims = tokens.claims()!;
      // UserInfo, with the access token; openid-client checks its sub matches the ID token's.
      const profile = await oidc.fetchUserInfo(config, tokens.access_token, claims.sub);
      await regenerate(req); // a new session id at sign-in: no session fixation
      req.session.user = { sub: claims.sub, name: String(profile.name), email: String(profile.email) };
      req.session.idToken = tokens.id_token;
      res.redirect(302, '/me');
    } catch (err) {
      // Bad state, nonce, signature, issuer, audience or expiry all end here. Log the reason; tell the user little.
      signInErrors.push(reason(err));
      res.status(401).json({ error: 'Sign-in failed.' });
    }
  });

  app.get('/me', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Not signed in.' });
    res.json(req.session.user);
  });

  // Ends the local session, then sends the browser to the provider's end_session_endpoint with id_token_hint.
  app.post('/logout', async (req, res) => {
    const idToken = req.session.idToken;
    await regenerate(req);
    req.session.logoutState = oidc.randomState();
    const url = oidc.buildEndSessionUrl(await discover(), {
      post_logout_redirect_uri: `${baseUrl}/logged-out`,
      state: req.session.logoutState,
      ...(idToken && { id_token_hint: idToken }),
    });
    res.redirect(302, url.href);
  });

  // The provider sends the browser back here after its own sign-out.
  app.get('/logged-out', (req, res) => {
    const expected = req.session.logoutState;
    delete req.session.logoutState;
    if (!expected || req.query.state !== expected) return res.status(400).json({ error: 'Sign-out state does not match.' });
    res.redirect(302, '/');
  });

  return { app, idp: idp.settings, signInErrors };
}
