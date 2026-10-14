import assert from 'node:assert/strict';
import { after, before, describe, it, mock } from 'node:test';
import { area } from './lib/math.ts';

describe('area', () => {
  before(() => {}); // runs once before the tests in this block
  after(() => mock.restoreAll());

  it('computes the area of a circle', () => {
    assert.equal(area(1), 3.14159);
    assert.deepEqual({ a: [1] }, { a: [1] }); // compares structure, not identity
  });

  it('rejects with the right error', async () => {
    await assert.rejects(Promise.reject(new TypeError('bad')), TypeError);
    assert.throws(() => JSON.parse('{'), SyntaxError);
  });

  it('counts calls with a mock function', () => {
    const send = mock.fn((to: string) => `sent to ${to}`);
    send('ada');
    assert.equal(send.mock.callCount(), 1);
    assert.deepEqual(send.mock.calls[0]?.arguments, ['ada']);
  });

  it('controls time with mock timers', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let fired = false;
    setTimeout(() => (fired = true), 60_000);
    t.mock.timers.tick(60_000); // a minute passes instantly
    assert.equal(fired, true);
  });
});
