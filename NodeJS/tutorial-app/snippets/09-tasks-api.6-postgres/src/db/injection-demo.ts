import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE tasks (owner TEXT, title TEXT);
         INSERT INTO tasks VALUES ('ada', 'Buy milk'), ('bob', 'Secret plan'), ('bob', 'Payroll');`);

// Pretend this arrived in a query string: ?owner=...
const owner = "nobody' OR '1'='1";

const sql = `SELECT owner, title FROM tasks WHERE owner = '${owner}'`;
console.log('SQL built with a template string:\n ', sql);
console.log('  →', db.prepare(sql).all());

console.log('With a ? placeholder, the input is only ever a value:');
console.log('  →', db.prepare('SELECT owner, title FROM tasks WHERE owner = ?').all(owner));
