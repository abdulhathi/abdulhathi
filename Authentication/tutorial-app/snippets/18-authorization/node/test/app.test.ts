import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, test } from 'node:test';
import { SignJWT } from 'jose';
import { createApp } from '../src/app.ts';
import { USERS } from '../src/documents.ts';
import { AUDIENCE, FULL_ACCESS, ISSUER, signToken } from '../src/tokens.ts';

const key = randomBytes(32);
let server: Server;
let base = '';

// A fresh app, with fresh demo data, for every test.
beforeEach(async () => {
  server = createApp({ key }).app.listen(0);
  await once(server, 'listening');
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(() => new Promise<void>((done) => server.close(() => done())));

const token = (name: string, scope?: string) => signToken(key, USERS[name], scope);

async function call(method: string, path: string, bearer?: string, body?: unknown) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  return fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const as = async (name: string, method: string, path: string, body?: unknown) => call(method, path, await token(name), body);
const ids = async (res: Response) => ((await res.json()) as { documents: { id: string }[] }).documents.map((d) => d.id);

type Route = [method: string, path: string, body?: unknown];
// Every route that names a document, and every route that writes.
const ROUTES_WITH_ID: Route[] = [['GET', '/documents/d1'], ['PUT', '/documents/d1', { title: 'Mine now' }], ['POST', '/documents/d1/publish'], ['DELETE', '/documents/d1']];
const WRITES: Route[] = [['POST', '/documents', { title: 'Team notes' }], ...ROUTES_WITH_ID.slice(1)];

test('a request without a valid token is 401', async () => {
  for (const [method, path, body] of [['GET', '/documents'], ...WRITES] as Route[]) {
    const res = await call(method, path, undefined, body);
    assert.equal(res.status, 401, `${method} ${path}`);
    assert.equal(res.headers.get('www-authenticate'), 'Bearer');
    assert.deepEqual(await res.json(), { error: 'Missing or invalid token.' });
  }
  const otherKey = await signToken(randomBytes(32), USERS.ada);
  const expired = await signToken(key, USERS.ada, undefined, Math.floor(Date.now() / 1000) - 60); // no clock skew allowed
  for (const bearer of ['not-a-token', otherKey, expired]) {
    const res = await call('GET', '/documents', bearer);
    assert.equal(res.status, 401);
    assert.equal(res.headers.get('www-authenticate'), 'Bearer error="invalid_token"');
    assert.deepEqual(await res.json(), { error: 'Missing or invalid token.' });
  }
});

test('a signed token still needs this audience, an expiry and every claim the rules read', async () => {
  const sign = (claims: Record<string, unknown>) => new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).sign(key);
  const without = (name: string, claims: Record<string, unknown>) => Object.fromEntries(Object.entries(claims).filter(([k]) => k !== name));
  const full = { ...USERS.ada, scope: FULL_ACCESS, iss: ISSUER, aud: AUDIENCE, exp: Math.floor(Date.now() / 1000) + 3600 };
  assert.equal((await call('GET', '/documents', await sign(full))).status, 200, 'the complete token works');
  for (const claims of [{ ...full, aud: 'another-api' }, without('exp', full), without('tenant', full), without('roles', full)]) {
    const res = await call('GET', '/documents', await sign(claims));
    assert.equal(res.status, 401, JSON.stringify(claims));
    assert.equal(res.headers.get('www-authenticate'), 'Bearer error="invalid_token"');
  }
});

test('each user lists only the documents they may read, in their own tenant', async () => {
  assert.deepEqual(await ids(await as('bo', 'GET', '/documents')), ['d2']);
  assert.deepEqual(await ids(await as('ada', 'GET', '/documents')), ['d1', 'd2', 'd3']);
  assert.deepEqual(await ids(await as('eve', 'GET', '/documents')), ['d4']);
});

test("another tenant's document is 404 on every route, even for an admin, exactly like a missing one", async () => {
  const missing = await as('eve', 'GET', '/documents/nope');
  assert.equal(missing.status, 404);
  const notFound = await missing.json();
  for (const [method, path, body] of ROUTES_WITH_ID) {
    const res = await as('eve', method, path, body); // eve is an admin, but of the south tenant
    assert.equal(res.status, 404, `${method} ${path}`);
    assert.deepEqual(await res.json(), notFound);
  }
  assert.equal((await as('di', 'GET', '/documents/d4')).status, 404);
  const own = await as('ada', 'GET', '/documents/d1');
  assert.equal(own.status, 200, 'still there for its own tenant');
  assert.deepEqual(await own.json(), { id: 'd1', tenant: 'north', owner: 'ada', department: 'sales', title: 'Sales plan', status: 'draft' }, 'and unchanged');
});

test("a viewer cannot see someone else's draft on any route, but can read published documents", async () => {
  for (const [method, path, body] of ROUTES_WITH_ID.slice(0, 3)) {
    assert.equal((await as('bo', method, path, body)).status, 404, `${method} ${path}`);
  }
  const published = await as('bo', 'GET', '/documents/d2');
  assert.equal(published.status, 200);
  assert.equal(((await published.json()) as { title: string }).title, 'Price list');
});

test('only editors and admins can create documents (RBAC)', async () => {
  const viewer = await as('bo', 'POST', '/documents', { title: 'Team notes' });
  assert.equal(viewer.status, 403);
  assert.deepEqual(await viewer.json(), { error: 'You are not allowed to do that.' });
  const editor = await as('ada', 'POST', '/documents', { title: 'Team notes' });
  assert.equal(editor.status, 201);
  const doc = (await editor.json()) as Record<string, string>;
  assert.equal(editor.headers.get('location'), `/documents/${doc.id}`);
  assert.deepEqual({ ...doc, id: 'x' }, { id: 'x', tenant: 'north', owner: 'ada', department: 'sales', title: 'Team notes', status: 'draft' });
});

test('tenant, owner and status come from the token, never from the request body', async () => {
  const res = await as('ada', 'POST', '/documents', { title: 'Sneaky', tenant: 'south', owner: 'eve', status: 'published' });
  const doc = (await res.json()) as Record<string, string>;
  assert.equal(doc.tenant, 'north');
  assert.equal(doc.owner, 'ada');
  assert.equal(doc.status, 'draft');
  assert.equal((await as('eve', 'GET', `/documents/${doc.id}`)).status, 404);
});

test('a title is required, and it is checked only after the access checks', async () => {
  for (const body of [undefined, {}, { title: '   ' }]) {
    for (const [method, path] of [['POST', '/documents'], ['PUT', '/documents/d1']]) {
      const res = await as('ada', method, path, body);
      assert.equal(res.status, 400, `${method} ${path} ${JSON.stringify(body)}`);
      assert.deepEqual(await res.json(), { error: 'Enter a title.' });
    }
  }
  assert.equal((await as('bo', 'PUT', '/documents/d1', {})).status, 404); // a draft bo cannot see
  assert.equal((await as('eve', 'PUT', '/documents/d1', {})).status, 404); // another tenant's
});

test('only the owner or an admin can update a document', async () => {
  assert.equal((await as('cy', 'PUT', '/documents/d1', { title: 'Mine now' })).status, 403); // can read it, not the owner
  assert.equal((await as('bo', 'PUT', '/documents/d2', { title: 'Mine now' })).status, 403); // can read it, not the owner
  assert.equal((await as('bo', 'PUT', '/documents/d1', { title: 'Mine now' })).status, 404); // cannot even read it
  const owner = await as('ada', 'PUT', '/documents/d1', { title: 'Sales plan v2' });
  assert.equal(owner.status, 200);
  assert.equal(((await owner.json()) as { title: string }).title, 'Sales plan v2');
  assert.equal((await as('di', 'PUT', '/documents/d1', { title: 'Sales plan v3' })).status, 200);
});

test('editors may publish only in their own department (ABAC)', async () => {
  const otherDepartment = await as('cy', 'POST', '/documents/d1/publish');
  assert.equal(otherDepartment.status, 403);
  assert.deepEqual(await otherDepartment.json(), { error: 'You are not allowed to do that.' });
  const sameDepartment = await as('ada', 'POST', '/documents/d1/publish');
  assert.equal(sameDepartment.status, 200);
  assert.equal(((await sameDepartment.json()) as { status: string }).status, 'published');
  assert.equal((await as('di', 'POST', '/documents/d3/publish')).status, 200); // an admin
});

test('a read-only token cannot write, even for an editor (scopes)', async () => {
  const readOnly = await token('ada', 'documents:read');
  assert.equal((await call('GET', '/documents/d1', readOnly)).status, 200);
  for (const [method, path, body] of WRITES) {
    const res = await call(method, path, readOnly, body);
    assert.equal(res.status, 403, `${method} ${path}`);
    assert.equal(res.headers.get('www-authenticate'), 'Bearer error="insufficient_scope", scope="documents:write"');
    assert.deepEqual(await res.json(), { error: 'This token lacks the documents:write scope.' });
  }
  const writeOnly = await call('GET', '/documents', await token('ada', 'documents:write'));
  assert.equal(writeOnly.status, 403);
  assert.equal(writeOnly.headers.get('www-authenticate'), 'Bearer error="insufficient_scope", scope="documents:read"');
});

test('only admins can delete, and only in their own tenant', async () => {
  // The role check runs before the lookup and gives the same answer for every id, so it reveals nothing.
  for (const id of ['d1', 'd4', 'nope']) {
    const res = await as('ada', 'DELETE', `/documents/${id}`); // ada owns d1, but is not an admin
    assert.equal(res.status, 403, id);
    assert.deepEqual(await res.json(), { error: 'You are not allowed to do that.' });
  }
  assert.equal((await as('di', 'DELETE', '/documents/d1')).status, 204);
  assert.equal((await as('ada', 'GET', '/documents/d1')).status, 404);
});
