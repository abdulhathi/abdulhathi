// The client side of OAuth 2.0, written out by hand so every step is visible.
// In a real app use a maintained library (openid-client or oauth4webapi), which does the same steps.
import { challengeFor, newVerifier, randomToken } from './pkce.ts';

export class OAuthError extends Error {
  readonly error: string;
  constructor(error: string, description: string) {
    super(description);
    this.error = error;
  }
}

export type TokenResponse = { access_token: string; token_type: string; expires_in: number; scope: string };

/** What the client must remember between sending the user away and the user coming back: keep it in the session. */
export type Pending = { url: string; state: string; verifier: string };

/** server: where to send requests. issuer: the server's issuer identifier, which its responses must carry. */
type Options = { server: string; issuer: string; clientId: string; redirectUri: string };

async function tokenResponse(res: Response): Promise<TokenResponse> {
  const body = await res.json();
  if (!res.ok) throw new OAuthError(body.error, body.error_description);
  return body as TokenResponse;
}

/** The authorization code flow with PKCE, for an app that acts for a user. */
export class AuthorizationCodeClient {
  private options: Options;
  constructor(options: Options) {
    this.options = options;
  }

  /** Step 1: build the URL to send the browser to, with a fresh state and PKCE verifier. */
  start(scope: string): Pending {
    const { server, clientId, redirectUri } = this.options;
    const state = randomToken(16); // ties the callback to this browser: CSRF protection
    const verifier = newVerifier(); // stays here; only its hash travels through the browser
    const url = new URL('/authorize', server);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      state,
      code_challenge: challengeFor(verifier),
      code_challenge_method: 'S256',
    }).toString();
    return { url: url.href, state, verifier };
  }

  /** Step 2: the browser came back to the redirect URI. Check state and iss, then swap the code (and verifier) for a token. */
  async finish(callbackUrl: string, pending: Pending): Promise<TokenResponse> {
    const params = new URL(callbackUrl).searchParams;
    if (params.get('state') !== pending.state) {
      throw new OAuthError('invalid_state', 'The state does not match this sign-in. Start again.');
    }
    // RFC 9207: this server always sends iss. A missing or different value means the response came from elsewhere
    // (a mix-up attack against a client that talks to several authorization servers).
    if (params.get('iss') !== this.options.issuer) {
      throw new OAuthError('invalid_issuer', 'The response did not come from the expected authorization server.');
    }
    const error = params.get('error');
    if (error) throw new OAuthError(error, params.get('error_description') ?? '');
    const res = await fetch(new URL('/token', this.options.server), {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: params.get('code') ?? '',
        redirect_uri: this.options.redirectUri,
        client_id: this.options.clientId,
        code_verifier: pending.verifier,
      }),
    });
    return tokenResponse(res);
  }
}

/** The client credentials grant, for a service calling an API as itself (no user). */
export async function clientCredentials(server: string, clientId: string, secret: string, scope: string): Promise<TokenResponse> {
  // client_secret_basic: RFC 6749 section 2.3.1 form-encodes the id and secret before Base64.
  const basic = Buffer.from(`${encodeURIComponent(clientId)}:${encodeURIComponent(secret)}`).toString('base64');
  const res = await fetch(new URL('/token', server), {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}` },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope }),
  });
  return tokenResponse(res);
}
