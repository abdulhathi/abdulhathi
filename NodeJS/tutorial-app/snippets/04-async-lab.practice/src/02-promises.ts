import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { FIXTURES, receipt, type Country, type Customer, type Order } from './lib/shop.ts';

// 1. A promise is a placeholder for a value that arrives later.
const later = new Promise<string>((resolve) => setTimeout(() => resolve('ready'), 100));
console.log('right away:', later); // pending
await later;
console.log('after await:', later); // fulfilled

// 2. promisify turns an error-first callback function into one that returns a promise.
function legacyLookup(id: number, callback: (err: Error | null, name: string) => void): void {
  setTimeout(() => (id === 7 ? callback(null, 'Ada Lovelace') : callback(new Error(`No customer ${id}`), '')), 50);
}
const lookup = promisify(legacyLookup);
console.log('promisified:', await lookup(7));

// 3. Chaining: each then() returns a new promise, so the steps read top to bottom.
const readJson = (name: string) => readFile(path.join(FIXTURES, name), 'utf8').then((text) => JSON.parse(text));

let order: Order;
let customer: Customer;
await readJson('order.json')
  .then((o: Order) => {
    order = o;
    return readJson(`customer-${o.customerId}.json`); // returning a promise waits for it
  })
  .then((c: Customer) => {
    customer = c;
    return readJson(`country-${c.country}.json`);
  })
  .then((country: Country) => console.log('chained:', receipt(order, customer, country)))
  .catch((err: Error) => console.error('One catch handles every step:', err.message))
  .finally(() => console.log('finally runs either way'));

// 4. A rejected promise skips the then() callbacks and lands in catch().
await lookup(99)
  .then((name) => console.log('never printed', name))
  .catch((err: Error) => console.log('rejected:', err.message));
