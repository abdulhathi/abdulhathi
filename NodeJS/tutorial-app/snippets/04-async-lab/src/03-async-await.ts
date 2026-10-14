import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { FIXTURES, receipt, type Country, type Customer, type Order } from './lib/shop.ts';

async function readJson<T>(name: string): Promise<T> {
  const text = await readFile(path.join(FIXTURES, name), 'utf8');
  return JSON.parse(text) as T;
}

// The same three steps, written like synchronous code. Every value stays in scope.
async function buildReceipt(orderFile: string): Promise<string> {
  const order = await readJson<Order>(orderFile);
  const customer = await readJson<Customer>(`customer-${order.customerId}.json`);
  const country = await readJson<Country>(`country-${customer.country}.json`);
  return receipt(order, customer, country);
}

// An async function always returns a promise, even when it returns a plain value.
const pending = buildReceipt('order.json');
console.log('buildReceipt returned', pending);
console.log(await pending);

// try/catch works with await exactly as it does with synchronous code.
try {
  await buildReceipt('missing.json');
} catch (err) {
  console.error('Failed:', (err as NodeJS.ErrnoException).code, (err as Error).message);
}
