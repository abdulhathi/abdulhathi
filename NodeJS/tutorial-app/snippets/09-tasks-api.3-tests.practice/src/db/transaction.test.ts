import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { transaction } from './transaction.ts';

describe('transaction', () => {
  const setup = () => {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE notes (text TEXT NOT NULL)');
    const insert = db.prepare('INSERT INTO notes VALUES (?)');
    const count = () => (db.prepare('SELECT count(*) AS n FROM notes').get() as { n: number }).n;
    return { db, insert, count };
  };

  it('commits and returns the callback result', () => {
    const { db, insert, count } = setup();
    const result = transaction(db, () => {
      insert.run('a');
      insert.run('b');
      return 'saved';
    });
    assert.equal(result, 'saved');
    assert.equal(count(), 2);
  });

  it('rolls everything back and rethrows when the callback fails', () => {
    const { db, insert, count } = setup();
    assert.throws(
      () =>
        transaction(db, () => {
          insert.run('a');
          insert.run(null); // NOT NULL constraint fails
        }),
      /NOT NULL constraint failed/,
    );
    assert.equal(count(), 0);
  });
});
