import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SEED, USERS } from '../src/documents.ts';
import { can } from '../src/policy.ts';
import { FULL_ACCESS, type User } from '../src/tokens.ts';

const user = (name: string): User => {
  const { sub, ...rest } = USERS[name];
  return { id: sub, ...rest, scopes: FULL_ACCESS.split(' ') };
};
const doc = (id: string) => SEED.find((d) => d.id === id)!;

test('the read rule: published for everyone in the tenant, drafts for the owner, editors and admins', () => {
  assert.equal(can(user('bo'), 'read', doc('d2')), true); // published
  assert.equal(can(user('bo'), 'read', doc('d1')), false); // a viewer and someone else's draft
  assert.equal(can(user('ada'), 'read', doc('d1')), true); // the owner
  assert.equal(can(user('cy'), 'read', doc('d1')), true); // an editor
  assert.equal(can(user('di'), 'read', doc('d1')), true); // an admin
});

test("the publish rule needs an editor in the document's department, or an admin", () => {
  assert.equal(can(user('ada'), 'publish', doc('d1')), true); // sales editor, sales document
  assert.equal(can(user('cy'), 'publish', doc('d1')), false); // support editor, sales document
  assert.equal(can(user('bo'), 'publish', doc('d1')), false); // a viewer, even in sales
  assert.equal(can(user('di'), 'publish', doc('d3')), true); // an admin
});

test('update is for the owner or an admin, and delete for admins only', () => {
  assert.equal(can(user('ada'), 'update', doc('d1')), true); // the owner
  assert.equal(can(user('cy'), 'update', doc('d1')), false); // an editor, but not the owner
  assert.equal(can(user('di'), 'update', doc('d1')), true); // an admin
  assert.equal(can(user('ada'), 'delete', doc('d1')), false); // the owner, but not an admin
  assert.equal(can(user('di'), 'delete', doc('d1')), true); // an admin
});

test('another tenant gets nothing, not even an admin', () => {
  for (const action of ['read', 'update', 'publish', 'delete'] as const) {
    assert.equal(can(user('eve'), action, doc('d1')), false, action);
    assert.equal(can(user('di'), action, doc('d4')), false, action);
  }
});
