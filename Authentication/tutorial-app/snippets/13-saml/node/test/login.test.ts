import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.ts';
import { EXAMPLE_SETTINGS, NS, POST_BINDING } from '../src/saml.ts';
import { authnRequestFrom, createIdp } from './idp.ts';

const idp = createIdp();
const { app } = createApp({ settings: { ...EXAMPLE_SETTINGS, idpCert: idp.cert }, now: () => Date.parse('2026-10-17T12:00:00Z') });
const server = app.listen(0);
let base = '';
before(() => (base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`));
after(() => server.close());

test('login redirects to the IdP with a deflated AuthnRequest', async () => {
  const res = await fetch(`${base}/saml/login`, { redirect: 'manual' });
  assert.equal(res.status, 302);
  const location = res.headers.get('location')!;
  assert.ok(location.startsWith('https://idp.example.com/saml/sso?SAMLRequest='));
  const request = authnRequestFrom(location);
  assert.equal(request.localName, 'AuthnRequest');
  assert.match(request.getAttribute('ID')!, /^_[0-9a-f]{40}$/);
  assert.equal(request.getAttribute('IssueInstant'), '2026-10-17T12:00:00Z');
  assert.equal(request.getAttribute('AssertionConsumerServiceURL'), 'https://sp.example.com/saml/acs');
  assert.equal(request.getAttribute('ProtocolBinding'), POST_BINDING);
  assert.equal(request.getElementsByTagNameNS(NS.assertion, 'Issuer')[0].textContent, 'https://sp.example.com/saml/metadata');
});

test('metadata publishes the entity ID and the ACS URL', async () => {
  const res = await fetch(`${base}/saml/metadata`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type')!, /^application\/samlmetadata\+xml/);
  const body = await res.text();
  assert.ok(body.includes('entityID="https://sp.example.com/saml/metadata"'));
  assert.ok(body.includes(`Binding="${POST_BINDING}" Location="https://sp.example.com/saml/acs"`));
});
