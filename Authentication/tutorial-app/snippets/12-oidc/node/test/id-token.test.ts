import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import type { Misbehavior } from '../src/mock-idp.ts';
import { startLab } from './lab.ts';

// Each test makes the provider get one thing wrong in the ID token; the sign-in must fail, with no session.
const lab = await startLab();
after(() => lab.close());

async function signInWith(misbehave: Misbehavior) {
  lab.idp.misbehave = misbehave;
  const browser = lab.browser();
  const res = await browser.open(await browser.startSignIn());
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'Sign-in failed.' });
  assert.equal((await browser.open('/me')).status, 401);
  return lab.signInErrors.at(-1)!;
}

test('an ID token with the wrong nonce is refused', async () => {
  assert.match(await signInWith('wrong-nonce'), /"nonce"/);
});

test('an ID token for another audience is refused', async () => {
  assert.match(await signInWith('wrong-audience'), /"aud"/);
});

test('an expired ID token is refused', async () => {
  assert.match(await signInWith('expired'), /"exp"/);
});

test('an ID token from another issuer is refused', async () => {
  assert.match(await signInWith('wrong-issuer'), /"iss"/);
});

test('an ID token signed with an unknown key is refused', async () => {
  // The provider may have rotated keys, so the client fetches the JWKS again before giving up.
  assert.match(await signInWith('unknown-kid'), /no applicable keys found/);
});

test('an ID token with a forged signature is refused', async () => {
  // The kid is the provider's, the claims are all right, the signature is not. Without enableNonRepudiationChecks
  // openid-client would accept this token.
  assert.match(await signInWith('bad-signature'), /signature verification failed/);
});
