import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { AuthorizationCodeClient } from '../src/client.ts';
import { newVerifier } from '../src/pkce.ts';
import { bearer, ISSUER, startApp } from './setup.ts';

const t = await startApp();
after(() => t.close());

const REDIRECT = 'http://localhost:4000/callback';
const photoApp = (redirectUri = REDIRECT) => new AuthorizationCodeClient({ server: t.base, issuer: ISSUER, clientId: 'photo-app', redirectUri });

/** Plays the browser: opens the URL and reports where the server redirects it, without following. */
async function visit(url: string) {
  const res = await fetch(url, { redirect: 'manual' });
  return { status: res.status, location: res.headers.get('location') ?? '' };
}

/** Runs step 1 and returns the pending values plus the callback URL the browser was sent to. */
async function authorize(client: AuthorizationCodeClient) {
  const pending = client.start('photos.read');
  return { pending, callback: (await visit(pending.url)).location };
}

test('the code flow with PKCE returns a token that reads the user’s photos', async () => {
  const client = photoApp();
  const pending = client.start('photos.read');
  const { status, location } = await visit(pending.url);
  assert.equal(status, 302);
  assert.ok(location.startsWith(`${REDIRECT}?code=`));
  assert.equal(new URL(location).searchParams.get('state'), pending.state);
  assert.equal(new URL(location).searchParams.get('iss'), ISSUER);

  const tokens = await client.finish(location, pending);
  assert.equal(tokens.token_type, 'Bearer');
  assert.equal(tokens.expires_in, 600);
  assert.equal(tokens.scope, 'photos.read');
  const api = await fetch(`${t.base}/api/photos`, bearer(tokens.access_token));
  assert.equal(api.status, 200);
  assert.deepEqual(await api.json(), { owner: 'u-1001', photos: ['beach.jpg', 'hills.jpg'] });
});

test('a wrong code_verifier is refused, and the code is used up', async () => {
  const client = photoApp();
  const { pending, callback } = await authorize(client);
  await assert.rejects(client.finish(callback, { ...pending, verifier: newVerifier() }), {
    error: 'invalid_grant',
    message: 'code_verifier does not match the code_challenge.',
  });
  // Even the right verifier fails now: one failed try burns the code, so verifiers cannot be guessed.
  await assert.rejects(client.finish(callback, pending), { error: 'invalid_grant', message: 'The code is invalid, expired or already used.' });
});

test('a code works only once, and using it again revokes the token it gave', async () => {
  const client = photoApp();
  const { pending, callback } = await authorize(client);
  const { access_token } = await client.finish(callback, pending);
  assert.equal((await fetch(`${t.base}/api/photos`, bearer(access_token))).status, 200);

  await assert.rejects(client.finish(callback, pending), { error: 'invalid_grant', message: 'The code is invalid, expired or already used.' });
  // The code leaked (someone else may hold the first token), so that token no longer works.
  const api = await fetch(`${t.base}/api/photos`, bearer(access_token));
  assert.equal(api.status, 401);
  assert.equal(api.headers.get('www-authenticate'), 'Bearer error="invalid_token"');
});

test('a code works only for the client it was issued to', async () => {
  const { pending, callback } = await authorize(photoApp());
  // album-app is another registered public client. It presents photo-app's code, redirect URI and even its verifier.
  const form = {
    grant_type: 'authorization_code',
    code: new URL(callback).searchParams.get('code')!,
    redirect_uri: REDIRECT,
    code_verifier: pending.verifier,
  };
  const res = await fetch(`${t.base}/token`, { method: 'POST', body: new URLSearchParams({ ...form, client_id: 'album-app' }) });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'invalid_grant', error_description: 'The code was issued to another client.' });
  // The attempt used the code up, so not even photo-app can redeem it now.
  const again = await fetch(`${t.base}/token`, { method: 'POST', body: new URLSearchParams({ ...form, client_id: 'photo-app' }) });
  assert.equal((await again.json()).error, 'invalid_grant');
});

test('a code expires after 60 seconds', async () => {
  const client = photoApp();
  const { pending, callback } = await authorize(client);
  t.advance(61_000);
  await assert.rejects(client.finish(callback, pending), { error: 'invalid_grant' });
});

test('the redirect_uri must match exactly, at /authorize and at /token', async () => {
  const lookalikes = [
    'http://localhost:4000/callback/',
    'http://localhost:4000/callback?next=/admin',
    'http://localhost:4001/callback',
    'https://evil.example.com/callback',
  ];
  for (const uri of lookalikes) {
    const res = await visit(photoApp(uri).start('photos.read').url);
    assert.equal(res.status, 400, uri);
    assert.equal(res.location, '', 'never redirect to an address that is not registered');
  }

  const { pending, callback } = await authorize(photoApp());
  const res = await fetch(`${t.base}/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: new URL(callback).searchParams.get('code')!,
      redirect_uri: 'http://localhost:4000/other',
      client_id: 'photo-app',
      code_verifier: pending.verifier,
    }),
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'invalid_grant', error_description: 'redirect_uri does not match the authorization request.' });
});

test('the client rejects a callback whose state does not match', async () => {
  const client = photoApp();
  const { pending, callback } = await authorize(client);
  // A forged link: a real code, but a state this browser never made (a login CSRF attempt).
  const forged = callback.replace(/state=[^&]+/, 'state=made-by-an-attacker');
  await assert.rejects(client.finish(forged, pending), { error: 'invalid_state' });
});

test('the client rejects a callback with a missing or different iss', async () => {
  const client = photoApp();
  const { pending, callback } = await authorize(client);
  for (const change of [(u: URL) => u.searchParams.delete('iss'), (u: URL) => u.searchParams.set('iss', 'https://evil.example.com')]) {
    const url = new URL(callback);
    change(url);
    await assert.rejects(client.finish(url.href, pending), { error: 'invalid_issuer' });
  }
});

test('the authorization server requires PKCE with S256 and an allowed scope', async () => {
  for (const change of [(u: URL) => u.searchParams.delete('code_challenge'), (u: URL) => u.searchParams.set('code_challenge_method', 'plain')]) {
    const url = new URL(photoApp().start('photos.read').url);
    change(url);
    const { status, location } = await visit(url.href);
    assert.equal(status, 302); // the client and redirect_uri are fine, so the error goes back to the client
    const back = new URL(location).searchParams;
    assert.equal(back.get('error'), 'invalid_request');
    assert.equal(back.get('error_description'), 'PKCE with S256 is required.');
    assert.equal(back.get('state'), url.searchParams.get('state'));
    assert.equal(back.get('iss'), ISSUER);
  }
  const { location } = await visit(photoApp().start('reports.read').url);
  assert.equal(new URL(location).searchParams.get('error'), 'invalid_scope');
});
