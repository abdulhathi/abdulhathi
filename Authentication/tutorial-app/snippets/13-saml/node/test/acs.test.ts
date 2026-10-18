import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { DOMParser, XMLSerializer, type Element } from '@xmldom/xmldom';
import { createApp } from '../src/app.ts';
import { EXAMPLE_SETTINGS, NS } from '../src/saml.ts';
import { authnRequestFrom, createIdp, SHA1, signedResponse, type ResponseOptions } from './idp.ts';

// The tests play the IdP: they hold its private key, and the app trusts only its certificate.
const idp = createIdp();
const otherIdp = createIdp('attacker.example.com');
let clock = Date.parse('2026-10-17T12:00:00Z');
const { app, users } = createApp({ settings: { ...EXAMPLE_SETTINGS, idpCert: idp.cert }, now: () => clock });
const server = app.listen(0);
let base = '';
before(() => (base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`));
after(() => server.close());

/** Starts a sign-in at the SP and returns the ID of the AuthnRequest it sent. */
async function startLogin(): Promise<string> {
  const res = await fetch(`${base}/saml/login`, { redirect: 'manual' });
  return authnRequestFrom(res.headers.get('location')!).getAttribute('ID')!;
}

/** What the IdP sends back for a fresh sign-in, signed by the IdP unless another key is given. */
async function respond(options: Partial<ResponseOptions> = {}, signer = idp): Promise<string> {
  return signedResponse({ inResponseTo: await startLogin(), now: clock, ...options }, signer);
}

/** The browser's auto-submitted form: SAMLResponse is the Base64 of the XML. */
const post = (xml: string) =>
  fetch(`${base}/saml/acs`, { method: 'POST', body: new URLSearchParams({ SAMLResponse: Buffer.from(xml).toString('base64') }) });

async function assertRefused(xml: string, error: string) {
  const res = await post(xml);
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error });
}

test('a valid response signs the user in, mapped from NameID and attributes', async () => {
  const res = await post(await respond());
  assert.equal(res.status, 200);
  const user = { nameId: 'ada@example.com', email: 'ada@example.com', name: 'Ada Lovelace', groups: ['engineering'] };
  assert.deepEqual(await res.json(), user);
  assert.deepEqual(users.get('https://idp.example.com/saml ada@example.com'), user);
});

test('a response signed with another key is refused', async () => {
  await assertRefused(await respond({}, otherIdp), 'Invalid signature.');
});

test('changing a signed attribute breaks the signature', async () => {
  const xml = await respond();
  const tampered = xml.replace('<saml:AttributeValue>engineering</saml:AttributeValue>', '<saml:AttributeValue>admins</saml:AttributeValue>');
  assert.notEqual(tampered, xml);
  await assertRefused(tampered, 'Invalid signature.');
});

test('an assertion signed with SHA-1 is refused, even with the right key', async () => {
  await assertRefused(signedResponse({ inResponseTo: await startLogin(), now: clock }, idp, SHA1), 'Invalid signature.');
});

test('an assertion from another issuer is refused', async () => {
  await assertRefused(await respond({ issuer: 'https://other-idp.example.com/saml' }), 'Wrong issuer.');
});

test('an assertion for another service provider is refused', async () => {
  await assertRefused(await respond({ audience: 'https://other-sp.example.com/saml/metadata' }), 'Wrong audience.');
});

test('a response for another ACS URL is refused', async () => {
  await assertRefused(await respond({ recipient: 'https://other-sp.example.com/saml/acs' }), 'Wrong recipient.');
});

test('an expired assertion is refused', async () => {
  const xml = await respond(); // valid for 5 minutes
  clock += 10 * 60 * 1000;
  await assertRefused(xml, 'The assertion has expired.');
});

test('an assertion that is not valid yet is refused', async () => {
  // Issued five minutes ahead of our clock: more than the one minute of skew we allow.
  await assertRefused(await respond({ now: clock + 5 * 60 * 1000 }), 'The assertion is not valid yet.');
});

test('the same assertion cannot be used twice', async () => {
  const xml = await respond();
  assert.equal((await post(xml)).status, 200);
  await assertRefused(xml, 'This assertion was already used.');
});

test('a response to a request the SP never sent is refused', async () => {
  await assertRefused(signedResponse({ inResponseTo: '_never-sent', now: clock }, idp), 'InResponseTo does not match a pending request.');
});

test('a wrapped assertion is refused (signature wrapping)', async () => {
  // The attacker has a real, signed assertion for their own account. They add a forged copy for someone else in
  // front of it. The signature still verifies (it covers the original), and a naive SP reads the first assertion.
  const doc = new DOMParser().parseFromString(await respond({ nameId: 'mallory@example.com' }), 'text/xml');
  const signed = doc.getElementsByTagNameNS(NS.assertion, 'Assertion')[0];
  const forged = signed.cloneNode(true) as Element;
  forged.setAttribute('ID', '_forged');
  forged.removeChild(forged.getElementsByTagNameNS(NS.dsig, 'Signature')[0]);
  forged.getElementsByTagNameNS(NS.assertion, 'NameID')[0].textContent = 'admin@example.com';
  doc.documentElement!.insertBefore(forged, signed);
  await assertRefused(new XMLSerializer().serializeToString(doc), 'The response must contain exactly one assertion.');
});

test('a signed assertion hidden inside the signature is refused (signature wrapping)', async () => {
  // A deeper variant: the forged assertion takes the signed one's place and carries its signature, and the signed
  // assertion moves into a ds:Object inside that signature. The reference still finds it there, so the signature
  // verifies. Counting every Assertion at any depth, not only the Response's children, stops it.
  const doc = new DOMParser().parseFromString(await respond({ nameId: 'mallory@example.com' }), 'text/xml');
  const signed = doc.getElementsByTagNameNS(NS.assertion, 'Assertion')[0];
  const forged = signed.cloneNode(true) as Element;
  forged.setAttribute('ID', '_forged');
  forged.getElementsByTagNameNS(NS.assertion, 'NameID')[0].textContent = 'admin@example.com';
  doc.documentElement!.replaceChild(forged, signed);
  signed.removeChild(signed.getElementsByTagNameNS(NS.dsig, 'Signature')[0]); // the enveloped transform removed it anyway
  const object = doc.createElementNS(NS.dsig, 'ds:Object');
  object.appendChild(signed);
  forged.getElementsByTagNameNS(NS.dsig, 'Signature')[0].appendChild(object);
  await assertRefused(new XMLSerializer().serializeToString(doc), 'The response must contain exactly one assertion.');
});

test('a response with a DTD is refused before anything else (XXE)', async () => {
  // An external entity would make a careless parser read a file from the server into the NameID.
  const xml = (await respond())
    .replace('<samlp:Response', '<!DOCTYPE samlp:Response [<!ENTITY name SYSTEM "file:///etc/passwd">]><samlp:Response')
    .replace('>ada@example.com</saml:NameID>', '>&name;</saml:NameID>');
  const res = await post(xml);
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'Malformed SAML response.' });
});

test('a comment inside the NameID cannot shorten it', async () => {
  // Canonicalization drops comments, so the signature still verifies. A reader that takes only the first text node
  // would see "ada@example.com"; reading what was signed gives the whole value.
  const xml = await respond({ nameId: 'ada@example.com.evil.example' });
  const injected = xml.replace('>ada@example.com.evil.example</saml:NameID>', '>ada@example.com<!---->.evil.example</saml:NameID>');
  assert.notEqual(injected, xml);
  const res = await post(injected);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).nameId, 'ada@example.com.evil.example');
});
